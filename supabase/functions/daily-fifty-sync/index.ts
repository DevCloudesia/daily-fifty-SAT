import { createClient } from "npm:@supabase/supabase-js@2";

const SYNC_KEY = Deno.env.get("DAILY_FIFTY_SYNC_KEY");
const ID_PATTERN = /^[0-9a-f]{8}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://daily-fifty.vercel.app" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://daily-fifty.vercel.app",
    "Access-Control-Allow-Headers": "content-type, x-daily-fifty-key",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

function cleanIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id).toLowerCase()).filter((id) => ID_PATTERN.test(id)))];
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function answerScore(answer: any): number {
  if (!answer || typeof answer !== "object") return 0;
  return Number(Boolean(answer.selected || String(answer.input || "").trim()))
    + Number(Boolean(answer.checked)) * 4
    + Number(Boolean(answer.revealed)) * 2
    + Number(Boolean(answer.completed)) * 8
    + Number(Boolean(answer.result !== null && answer.result !== undefined));
}

function answerTimestamp(answer: any): number {
  return Math.max(timestamp(answer?.completedAt), timestamp(answer?.savedAt));
}

function mergeAnswer(remoteValue: unknown, localValue: unknown) {
  const remote = asObject(remoteValue);
  const local = asObject(localValue);
  if (!Object.keys(remote).length) return local;
  if (!Object.keys(local).length) return remote;
  const remoteScore = answerScore(remote);
  const localScore = answerScore(local);
  const base = localScore > remoteScore || (localScore === remoteScore && answerTimestamp(local) > answerTimestamp(remote)) ? local : remote;
  return {
    ...base,
    crossed: cleanIds([...(Array.isArray(remote.crossed) ? remote.crossed : []), ...(Array.isArray(local.crossed) ? local.crossed : [])]),
    timedOut: Boolean(remote.timedOut || local.timedOut),
    overtimeSeconds: Math.max(Number(remote.overtimeSeconds || 0), Number(local.overtimeSeconds || 0)),
    completed: Boolean(remote.completed || local.completed),
    completedAt: timestamp(remote.completedAt) >= timestamp(local.completedAt) ? remote.completedAt : local.completedAt,
  };
}

function mergeAnswers(remoteValue: unknown, localValue: unknown) {
  const remote = asObject(remoteValue);
  const local = asObject(localValue);
  const merged: Record<string, any> = {};
  for (const id of new Set([...Object.keys(remote), ...Object.keys(local)])) {
    if (!ID_PATTERN.test(id)) continue;
    merged[id.toLowerCase()] = mergeAnswer(remote[id], local[id]);
  }
  return merged;
}

function sessionProgress(session: any): number {
  return Object.values(asObject(session?.answers)).reduce((sum: number, answer: any) => sum + answerScore(answer), 0);
}

function completedCount(session: any): number {
  return Object.values(asObject(session?.answers)).filter((answer: any) => Boolean(answer?.completed || answer?.checked)).length;
}

function hasValidPlan(session: any): boolean {
  return Array.isArray(session?.plan) && session.plan.length === 50;
}

function compareSessions(remote: Record<string, any>, local: Record<string, any>): "remote" | "local" {
  const remoteValid = hasValidPlan(remote);
  const localValid = hasValidPlan(local);
  if (remoteValid !== localValid) return localValid ? "local" : "remote";
  const remoteProgress = sessionProgress(remote);
  const localProgress = sessionProgress(local);
  if (remoteProgress !== localProgress) return localProgress > remoteProgress ? "local" : "remote";
  const remoteDone = completedCount(remote);
  const localDone = completedCount(local);
  if (remoteDone !== localDone) return localDone > remoteDone ? "local" : "remote";
  return timestamp(local.savedAt) > timestamp(remote.savedAt) ? "local" : "remote";
}

function chooseDifferentDateSession(remote: Record<string, any>, local: Record<string, any>) {
  // Sessions from different calendar days aren't comparable by progress: The Daily Fifty
  // is a per-day set, so the later date always supersedes an earlier one, finished or not.
  // Completed questions are preserved separately in daily_fifty_question_history regardless.
  const remoteDate = String(remote.date || "");
  const localDate = String(local.date || "");
  return localDate > remoteDate ? local : remote;
}

function mergeSession(remoteValue: unknown, localValue: unknown) {
  const remote = asObject(remoteValue);
  const local = asObject(localValue);
  if (!Object.keys(remote).length) return local;
  if (!Object.keys(local).length) return remote;
  const remoteDate = String(remote.date || "");
  const localDate = String(local.date || "");
  if (remoteDate !== localDate) return chooseDifferentDateSession(remote, local);
  const winner = compareSessions(remote, local);
  const base = winner === "local" ? local : remote;
  return {
    ...base,
    answers: mergeAnswers(remote.answers, local.answers),
    index: winner === "local" ? local.index : remote.index,
    savedAt: new Date(Math.max(timestamp(remote.savedAt), timestamp(local.savedAt), Date.now())).toISOString(),
  };
}

function choosePreferences(remote: any, local: any, remoteUpdated: unknown, localUpdated: unknown): any {
  return timestamp(localUpdated) >= timestamp(remoteUpdated) ? asObject(local) : asObject(remote);
}

function rowToSession(row: any, answers: Record<string, any>) {
  if (!row) return {};
  return {
    date: row.session_date,
    plan: Array.isArray(row.plan) ? row.plan : [],
    reserve: asObject(row.reserve),
    planVersion: row.plan_version || null,
    index: Math.min(49, Math.max(0, Number(row.current_index || 0))),
    savedAt: row.saved_at || row.updated_at || new Date(0).toISOString(),
    answers,
  };
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (!SYNC_KEY || req.headers.get("x-daily-fifty-key") !== SYNC_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  try {
    const body = await req.json();
    const local = asObject(body?.payload);
    if (JSON.stringify(local).length > 750_000) throw new Error("Sync payload is too large.");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: cacheRow, error: cacheError } = await supabase
      .from("daily_fifty_sync_state")
      .select("payload")
      .eq("id", "primary")
      .maybeSingle();
    if (cacheError) throw cacheError;
    const cached = asObject(cacheRow?.payload);

    const activeCandidate = mergeSession(cached.session, local.session);
    const activeDate = String(activeCandidate.date || "");
    let canonicalSession = activeCandidate;

    if (DATE_PATTERN.test(activeDate)) {
      const [{ data: sessionRow, error: sessionError }, { data: answerRows, error: answersError }] = await Promise.all([
        supabase.from("daily_fifty_daily_sessions").select("*").eq("session_date", activeDate).maybeSingle(),
        supabase.from("daily_fifty_daily_answers").select("question_id,answer").eq("session_date", activeDate),
      ]);
      if (sessionError) throw sessionError;
      if (answersError) throw answersError;

      const dbAnswers: Record<string, any> = {};
      for (const row of answerRows || []) dbAnswers[String(row.question_id).toLowerCase()] = asObject(row.answer);
      const dbSession = rowToSession(sessionRow, dbAnswers);
      canonicalSession = mergeSession(dbSession, activeCandidate);
      canonicalSession.date = activeDate;
      canonicalSession.answers = mergeAnswers(dbAnswers, canonicalSession.answers);

      const canonicalIndex = Math.min(49, Math.max(0, Number(canonicalSession.index || 0)));
      const { error: sessionWriteError } = await supabase.from("daily_fifty_daily_sessions").upsert({
        session_date: activeDate,
        plan: Array.isArray(canonicalSession.plan) ? canonicalSession.plan : [],
        reserve: asObject(canonicalSession.reserve),
        plan_version: canonicalSession.planVersion || null,
        current_index: canonicalIndex,
        saved_at: canonicalSession.savedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (sessionWriteError) throw sessionWriteError;

      const answerUpserts = Object.entries(asObject(canonicalSession.answers))
        .filter(([id]) => ID_PATTERN.test(id))
        .map(([id, answer]) => ({
          session_date: activeDate,
          question_id: id.toLowerCase(),
          answer,
          answer_score: answerScore(answer),
          checked: Boolean((answer as any)?.checked),
          completed: Boolean((answer as any)?.completed),
          updated_at: new Date().toISOString(),
        }));
      if (answerUpserts.length) {
        const { error: answerWriteError } = await supabase.from("daily_fifty_daily_answers").upsert(answerUpserts, { onConflict: "session_date,question_id" });
        if (answerWriteError) throw answerWriteError;
      }
    }

    const retiredFromAnswers = Object.entries(asObject(canonicalSession.answers))
      .filter(([id, answer]) => ID_PATTERN.test(id) && Boolean((answer as any)?.completed))
      .map(([id]) => id.toLowerCase());
    const retiredIds = cleanIds([...(cached.completed || []), ...(local.completed || []), ...retiredFromAnswers]);

    if (retiredIds.length) {
      const answerMap = asObject(canonicalSession.answers);
      const historyRows = retiredIds.map((questionId) => {
        const answer = asObject(answerMap[questionId]);
        const hasResult = answer.result !== null && answer.result !== undefined;
        return {
          question_id: questionId,
          first_completed_at: answer.completedAt || new Date().toISOString(),
          last_completed_at: answer.completedAt || new Date().toISOString(),
          ever_correct: hasResult && Boolean(answer.result),
          ever_wrong: hasResult && !Boolean(answer.result),
          ever_timed_out: Boolean(answer.timedOut),
        };
      });
      const { error: historyWriteError } = await supabase
        .from("daily_fifty_question_history")
        .upsert(historyRows, { onConflict: "question_id", ignoreDuplicates: true });
      if (historyWriteError) throw historyWriteError;
    }

    const { data: historyRows, error: historyReadError } = await supabase
      .from("daily_fifty_question_history")
      .select("question_id")
      .order("first_completed_at", { ascending: true });
    if (historyReadError) throw historyReadError;

    const now = new Date().toISOString();
    const merged = {
      completed: cleanIds((historyRows || []).map((row) => row.question_id)),
      blocked: cleanIds([...(cached.blocked || []), ...(local.blocked || [])]),
      session: canonicalSession,
      preferences: choosePreferences(cached.preferences, local.preferences, cached.updatedAt, local.updatedAt),
      updatedAt: now,
    };

    const { error: cacheWriteError } = await supabase.from("daily_fifty_sync_state").upsert({
      id: "primary",
      payload: merged,
      updated_at: now,
    });
    if (cacheWriteError) throw cacheWriteError;

    return new Response(JSON.stringify({ ok: true, payload: merged }), { status: 200, headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
