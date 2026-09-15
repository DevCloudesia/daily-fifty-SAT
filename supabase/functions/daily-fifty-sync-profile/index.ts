import { createClient } from "npm:@supabase/supabase-js@2";

const SYNC_KEY = Deno.env.get("DAILY_FIFTY_SYNC_KEY");
const PROFILE_PATTERN = /^(?:shreejay|user_[0-9a-f]{32})$/;
const ID_PATTERN = /^[0-9a-f]{8}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const allowed = origin === "https://daily-fifty.vercel.app" || /^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : "https://daily-fifty.vercel.app",
    "Access-Control-Allow-Headers": "content-type, x-daily-fifty-key, x-daily-fifty-profile",
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

function validDate(value: unknown): string {
  const text = String(value || "");
  if (!DATE_PATTERN.test(text)) return "";
  const parsed = Date.parse(`${text}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return "";
  if (new Date(parsed).toISOString().slice(0, 10) !== text) return "";
  if (parsed > Date.now() + DAY_MS) return "";
  return text;
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

function sessionProgress(session: any): number {
  return Object.values(asObject(session?.answers)).reduce((sum: number, answer: any) => sum + answerScore(answer), 0);
}

function completedCount(session: any): number {
  return Object.values(asObject(session?.answers)).filter((answer: any) => Boolean(answer?.completed || answer?.checked)).length;
}

function mergeSession(remoteValue: unknown, localValue: unknown) {
  const remote = asObject(remoteValue);
  const local = asObject(localValue);
  if (!Object.keys(remote).length) return local;
  if (!Object.keys(local).length) return remote;

  const remoteDate = validDate(remote.date);
  const localDate = validDate(local.date);
  if (remoteDate !== localDate) {
    if (remoteDate && !localDate) return remote;
    if (localDate && !remoteDate) return local;
    if (remoteDate && localDate) return localDate > remoteDate ? local : remote;
    return sessionProgress(local) > sessionProgress(remote) ? local : remote;
  }

  const remoteValid = Array.isArray(remote.plan) && remote.plan.length === 50;
  const localValid = Array.isArray(local.plan) && local.plan.length === 50;
  let winner = remote;
  if (remoteValid !== localValid) winner = localValid ? local : remote;
  else if (sessionProgress(local) !== sessionProgress(remote)) winner = sessionProgress(local) > sessionProgress(remote) ? local : remote;
  else if (completedCount(local) !== completedCount(remote)) winner = completedCount(local) > completedCount(remote) ? local : remote;
  else winner = timestamp(local.savedAt) > timestamp(remote.savedAt) ? local : remote;

  const savedAtMs = Math.max(timestamp(remote.savedAt), timestamp(local.savedAt));
  return {
    ...winner,
    answers: mergeAnswers(remote.answers, local.answers),
    savedAt: savedAtMs ? new Date(savedAtMs).toISOString() : new Date().toISOString(),
  };
}

function choosePreferences(remote: any, local: any, remoteUpdated: unknown, localUpdated: unknown): any {
  return timestamp(localUpdated) >= timestamp(remoteUpdated) ? asObject(local) : asObject(remote);
}

Deno.serve(async (req: Request) => {
  const headers = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  if (!SYNC_KEY || req.headers.get("x-daily-fifty-key") !== SYNC_KEY) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
  }

  const profile = String(req.headers.get("x-daily-fifty-profile") || "").toLowerCase();
  if (!PROFILE_PATTERN.test(profile)) return new Response(JSON.stringify({ error: "Invalid profile" }), { status: 400, headers });

  try {
    const body = await req.json();
    const local = asObject(body?.payload);
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
      .eq("id", profile)
      .maybeSingle();
    if (cacheError) throw cacheError;
    const cached = asObject(cacheRow?.payload);

    const session = mergeSession(cached.session, local.session);
    const retiredFromAnswers = Object.entries(asObject(session.answers))
      .filter(([id, answer]) => ID_PATTERN.test(id) && Boolean((answer as any)?.completed))
      .map(([id]) => id.toLowerCase());
    const now = new Date().toISOString();
    const merged = {
      completed: cleanIds([...(cached.completed || []), ...(local.completed || []), ...retiredFromAnswers]),
      blocked: cleanIds([...(cached.blocked || []), ...(local.blocked || [])]),
      seen: cleanIds([...(cached.seen || []), ...(local.seen || [])]),
      session,
      preferences: choosePreferences(cached.preferences, local.preferences, cached.updatedAt, local.updatedAt),
      updatedAt: readOnly ? (cached.updatedAt || now) : now,
    };

    if (!readOnly) {
      const { error: writeError } = await supabase.from("daily_fifty_sync_state").upsert({ id: profile, payload: merged, updated_at: now });
      if (writeError) throw writeError;
    }

    return new Response(JSON.stringify({ ok: true, payload: merged }), { status: 200, headers });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), { status: 500, headers });
  }
});
