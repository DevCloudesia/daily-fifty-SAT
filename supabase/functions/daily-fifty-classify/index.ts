import { createClient } from "npm:@supabase/supabase-js@2";

const INDEX_URL = "https://daily-fifty-fast-index.vercel.app/question-index.json";
const QUESTION_URL = "https://daily-fifty-api.vercel.app/api/question?id=";
const SYNC_KEY = Deno.env.get("DAILY_FIFTY_SYNC_KEY");

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function fetchQuestion(id: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(QUESTION_URL + encodeURIComponent(id), {
      cache: "no-store",
      signal: controller.signal,
      headers: { "user-agent": "DailyFiftyVocabularyClassifier/2.0" },
    });
    const body = await response.json().catch(() => null);
    if (!response.ok || !body?.ok || !body?.question) {
      throw new Error(body?.error || `Question endpoint returned ${response.status}`);
    }
    const heading = String(body.question.heading || "");
    return {
      question_id: id,
      heading,
      is_words_in_context: /words\s+in\s+context/i.test(heading),
      difficulty: String(body.question.difficulty || "Hard"),
      scan_status: "ok",
      error_message: null,
      scanned_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      question_id: id,
      heading: null,
      is_words_in_context: false,
      difficulty: "Hard",
      scan_status: "error",
      error_message: error instanceof Error ? error.message : String(error),
      scanned_at: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}

async function mapConcurrent<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}

// Non-numeric query values used to become NaN, which survives the clamps: the scan silently
// processed nothing and reported nextOffset: null, so pagination stopped early looking healthy.
function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

Deno.serve(async (req: Request) => {
  // This endpoint holds the service role, is deployed --no-verify-jwt, and fans a single call
  // out to 150 upstream fetches plus 150 table writes, so it cannot stay unauthenticated.
  if (!SYNC_KEY || req.headers.get("x-daily-fifty-key") !== SYNC_KEY) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const url = new URL(req.url);
    const offset = Math.max(0, positiveInt(url.searchParams.get("offset"), 0));
    const limit = Math.min(150, Math.max(1, positiveInt(url.searchParams.get("limit"), 100)));
    const retryErrors = url.searchParams.get("retryErrors") === "1";

    const indexResponse = await fetch(INDEX_URL, { cache: "no-store" });
    if (!indexResponse.ok) throw new Error(`Index returned ${indexResponse.status}`);
    const index = await indexResponse.json();
    const allIds: string[] = Array.isArray(index?.buckets?.rw_hard) ? index.buckets.rw_hard : [];
    const chunk = allIds.slice(offset, offset + limit);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    let ids = chunk;
    if (!retryErrors && chunk.length) {
      const { data: existing, error } = await supabase
        .from("daily_fifty_question_skills")
        .select("question_id,scan_status")
        .in("question_id", chunk);
      if (error) throw error;
      const done = new Set((existing || []).filter((row) => row.scan_status === "ok").map((row) => row.question_id));
      ids = chunk.filter((id) => !done.has(id));
    }

    const rows = await mapConcurrent(ids, 10, fetchQuestion);
    if (rows.length) {
      const { error } = await supabase.from("daily_fifty_question_skills").upsert(rows, { onConflict: "question_id" });
      if (error) throw error;
    }

    const { count: scannedCount } = await supabase
      .from("daily_fifty_question_skills")
      .select("question_id", { count: "exact", head: true })
      .eq("scan_status", "ok");
    const { count: vocabCount } = await supabase
      .from("daily_fifty_question_skills")
      .select("question_id", { count: "exact", head: true })
      .eq("scan_status", "ok")
      .eq("is_words_in_context", true);

    return json({
      ok: true,
      total: allIds.length,
      offset,
      requested: chunk.length,
      processed: rows.length,
      errors: rows.filter((row) => row.scan_status === "error").length,
      scannedCount: scannedCount || 0,
      vocabCount: vocabCount || 0,
      nextOffset: offset + chunk.length < allIds.length ? offset + chunk.length : null,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
