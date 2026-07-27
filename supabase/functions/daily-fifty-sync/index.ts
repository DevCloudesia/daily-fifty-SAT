import { createClient } from "npm:@supabase/supabase-js@2";

const SYNC_KEY = Deno.env.get("DAILY_FIFTY_SYNC_KEY");
const ID_PATTERN = /^[0-9a-f]{8}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 1000;
const DAY_MS = 86_400_000;
const MIN_TIMESTAMP = Date.UTC(2000, 0, 1);

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

// Crossed-out answer choices are not question ids, so they must not be run through the
// 8-hex question-id validator: doing so silently discarded every eliminated choice.
function cleanChoices(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const choices = new Set<string>();
  for (const item of value) {
    const text = String(item ?? "").trim();
    if (text && text.length <= 64) choices.add(text);
    if (choices.size >= 32) break;
  }
  return [...choices];
}

function timestamp(value: unknown): number {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

// Client-supplied timestamps land in timestamptz columns, so anything unparseable or wildly
// out of range has to be rejected here rather than failing the whole sync at the database.
function isoTimestamp(value: unknown, fallback: string): string {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed) || parsed < MIN_TIMESTAMP || parsed > Date.now() + DAY_MS) return fallback;
  return new Date(parsed).toISOString();
}

// A session date orders every cross-day decision, so an unvalidated one ("garbage" sorts above
// any real date) could win permanently and wedge the shared session for every device.
function validDate(value: unknown): string {
  const text = String(value || "");
  if (!DATE_PATTERN.test(text)) return "";
  const parsed = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return "";
  if (new Date(parsed).toISOString().slice(0, 10) !== text) return "";
  if (parsed > Date.now() + DAY_MS) return "";
  return text;
}

function clampIndex(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(49, Math.max(0, Math.trunc(parsed)));
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
    // The winning side's eliminated choices are authoritative. Unioning both sides made
    // un-crossing a choice impossible: the next sync always restored it.
    crossed: cleanChoices(base.crossed),
    timedOut: Boolean(remote.timedOut || local.timedOut),
    overtimeSeconds: Math.max(Number(remote.overtimeSeconds || 0), Number(local.overtimeSeconds || 0)),
    completed: Boolean(remote.completed || local.completed),
    completedAt: timestamp(remote.completedAt) >= timestamp(local.completedAt) ? remote.completedAt : local.completedAt,
  };
}

function mergeAnswers(remoteValue: unknown, localValue: unknown) {
  const remote = asObject(remoteValue);
  const local = asObject(localValue);
  const groups = new Map<string, { remote: any; local: any }>();
  // Question ids are case-insensitive, so variants of the same id are folded together first.
  // Assigning straight to merged[id.toLowerCase()] let one variant overwrite the other.
  const collect = (source: Record<string, any>, side: "remote" | "local") => {
    for (const [rawId, answer] of Object.entries(source)) {
      if (!ID_PATTERN.test(rawId)) continue;
      const id = rawId.toLowerCase();
      const group = groups.get(id) || { remote: {}, local: {} };
      group[side] = mergeAnswer(group[side], answer);
      groups.set(id, group);
    }
  };
  collect(remote, "remote");
  collect(local, "local");
  const merged: Record<string, any> = {};
  for (const [id, group] of groups) merged[id] = mergeAnswer(group.remote, group.local);
  return merged;
}

function planIds(session: any): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(session?.plan)) return ids;
  for (const item of session.plan) {
    const id = String(item?.id || "").toLowerCase();
    if (ID_PATTERN.test(id)) ids.add(id);
  }
  return ids;
}

// Answers are merged by question id across every device payload, so ids belonging to an
// earlier day's plan would otherwise accumulate on the current date and inflate its counts.
function answersInPlan(session: any): Record<string, any> {
  const allowed = planIds(session);
  const answers = asObject(session?.answers);
  if (!allowed.size) return answers;
  const scoped: Record<string, any> = {};
  for (const [id, answer] of Object.entries(answers)) if (allowed.has(id)) scoped[id] = answer;
  return scoped;
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
  const remoteDate = validDate(remote.date);
  const localDate = validDate(local.date);
  if (remoteDate && !localDate) return remote;
  if (localDate && !remoteDate) return local;
  if (!remoteDate && !localDate) return sessionProgress(local) > sessionProgress(remote) ? local : remote;
  return localDate > remoteDate ? local : remote;
}

function mergeSession(remoteValue: unknown, localValue: unknown) {
  const remote = asObject(remoteValue);
  const local = asObject(localValue);
  if (!Object.keys(remote).length) return local;
  if (!Object.keys(local).length) return remote;
  if (String(remote.date || "") !== String(local.date || "")) return chooseDifferentDateSession(remote, local);
  const winner = compareSessions(remote, local);
  const base = winner === "local" ? local : remote;
  // savedAt stays device-authoritative. Bumping it to server time made the final tiebreak
  // compare a device clock against a server clock, reverting the slower device's position.
  const savedAtMs = Math.max(timestamp(remote.savedAt), timestamp(local.savedAt));
  return {
    ...base,
    answers: mergeAnswers(remote.answers, local.answers),
    index: winner === "local" ? local.index : remote.index,
    savedAt: savedAtMs ? new Date(savedAtMs).toISOString() : new Date().toISOString(),
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
    index: clampIndex(row.current_index),
    savedAt: row.saved_at || row.updated_at || new Date(0).toISOString(),
    answers,
  };
}

// PostgREST caps a single response at 1000 rows. Reading the retirement history unpaginated
// silently truncated it, so past 1000 retirements questions would start repeating.
async function readAllRows(supabase: any, table: string, columns: string, orderColumn: string) {
  const rows: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
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
    // A plain read must not run the write path: page loads were upserting the session, every
    // answer row, and the whole history table on every request.
    const readOnly = body?.mode === "read";
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

    // Sessions carrying an unusable date are dropped on both sides. This also self-heals a
    // cache that a bad date already poisoned.
    const cachedSession = asObject(cached.session);
    const localSession = asObject(local.session);
    const activeCandidate = mergeSession(
      validDate(cachedSession.date) ? cachedSession : {},
      validDate(localSession.date) ? localSession : {},
    );
    const activeDate = validDate(activeCandidate.date);
    let canonicalSession = activeCandidate;
    let retirableAnswers = asObject(canonicalSession.answers);

    if (activeDate) {
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
      retirableAnswers = asObject(canonicalSession.answers);
      canonicalSession.answers = answersInPlan(canonicalSession);
      canonicalSession.index = clampIndex(canonicalSession.index);

      if (!readOnly) {
        const { error: sessionWriteError } = await supabase.from("daily_fifty_daily_sessions").upsert({
          session_date: activeDate,
          plan: Array.isArray(canonicalSession.plan) ? canonicalSession.plan : [],
          reserve: asObject(canonicalSession.reserve),
          plan_version: canonicalSession.planVersion || null,
          current_index: canonicalSession.index,
          saved_at: isoTimestamp(canonicalSession.savedAt, new Date().toISOString()),
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
    }

    const now = new Date().toISOString();
    const history = await readAllRows(
      supabase,
      "daily_fifty_question_history",
      "question_id,first_completed_at,last_completed_at,ever_correct,ever_wrong,ever_timed_out",
      "question_id",
    );
    const historyById = new Map<string, any>(history.map((row) => [String(row.question_id).toLowerCase(), row]));

    const retiredFromAnswers = Object.entries(retirableAnswers)
      .filter(([id, answer]) => ID_PATTERN.test(id) && Boolean((answer as any)?.completed))
      .map(([id]) => id.toLowerCase());
    const retiredIds = cleanIds([...(cached.completed || []), ...(local.completed || []), ...retiredFromAnswers]);

    // Only rows that are new or that actually changed are written. Re-upserting every retired
    // id on every sync meant thousands of no-op writes per request, and ignoreDuplicates froze
    // ever_correct / ever_wrong / ever_timed_out at whatever the first insert happened to write.
    const pending: any[] = [];
    for (const questionId of retiredIds) {
      const answer = asObject(retirableAnswers[questionId]);
      const existing = historyById.get(questionId);
      const hasResult = answer.result !== null && answer.result !== undefined;
      const completedAt = isoTimestamp(answer.completedAt, "");

      if (!existing) {
        const stamp = completedAt || now;
        pending.push({
          question_id: questionId,
          first_completed_at: stamp,
          last_completed_at: stamp,
          ever_correct: hasResult && Boolean(answer.result),
          ever_wrong: hasResult && !answer.result,
          ever_timed_out: Boolean(answer.timedOut),
        });
        continue;
      }

      const everCorrect = Boolean(existing.ever_correct) || (hasResult && Boolean(answer.result));
      const everWrong = Boolean(existing.ever_wrong) || (hasResult && !answer.result);
      const everTimedOut = Boolean(existing.ever_timed_out) || Boolean(answer.timedOut);
      const firstCompletedAt = completedAt && timestamp(completedAt) < timestamp(existing.first_completed_at)
        ? completedAt
        : existing.first_completed_at;
      const lastCompletedAt = completedAt && timestamp(completedAt) > timestamp(existing.last_completed_at)
        ? completedAt
        : existing.last_completed_at;
      const changed = everCorrect !== Boolean(existing.ever_correct)
        || everWrong !== Boolean(existing.ever_wrong)
        || everTimedOut !== Boolean(existing.ever_timed_out)
        || firstCompletedAt !== existing.first_completed_at
        || lastCompletedAt !== existing.last_completed_at;
      if (!changed) continue;
      pending.push({
        question_id: questionId,
        first_completed_at: firstCompletedAt,
        last_completed_at: lastCompletedAt,
        ever_correct: everCorrect,
        ever_wrong: everWrong,
        ever_timed_out: everTimedOut,
      });
    }

    if (pending.length && !readOnly) {
      const { error: historyWriteError } = await supabase
        .from("daily_fifty_question_history")
        .upsert(pending, { onConflict: "question_id" });
      if (historyWriteError) throw historyWriteError;
    }

    const completedRows = [...history];
    if (!readOnly) for (const row of pending) if (!historyById.has(row.question_id)) completedRows.push(row);
    completedRows.sort((a, b) => timestamp(a.first_completed_at) - timestamp(b.first_completed_at));

    const merged = {
      completed: cleanIds(completedRows.map((row) => row.question_id)),
      blocked: cleanIds([...(cached.blocked || []), ...(local.blocked || [])]),
      session: canonicalSession,
      preferences: choosePreferences(cached.preferences, local.preferences, cached.updatedAt, local.updatedAt),
      // A read-only call must return a stable updatedAt when nothing actually changed. Stamping
      // "now" on every call - including reads - meant a client that polls GET /api/sync and
      // compares updatedAt to detect remote changes would see a "change" on every single poll,
      // even with a completely idle database, and could re-merge or reload in a tight loop.
      updatedAt: readOnly ? (cached.updatedAt || now) : now,
    };

    if (!readOnly) {
      const { error: cacheWriteError } = await supabase.from("daily_fifty_sync_state").upsert({
        id: "primary",
        payload: merged,
        updated_at: now,
      });
      if (cacheWriteError) throw cacheWriteError;
    }

    return new Response(JSON.stringify({ ok: true, payload: merged }), { status: 200, headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
