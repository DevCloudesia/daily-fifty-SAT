import { createClient } from "npm:@supabase/supabase-js@2";

const PAGE_SIZE = 1000;

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    // PostgREST returns at most 1000 rows per request. Reading a single page and reporting its
    // length as vocabCount silently understated the list once the set passed that size.
    const vocabIds: string[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("daily_fifty_question_skills")
        .select("question_id")
        .eq("scan_status", "ok")
        .eq("is_words_in_context", true)
        .order("question_id", { ascending: true })
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      const page = data || [];
      for (const row of page) vocabIds.push(row.question_id);
      if (page.length < PAGE_SIZE) break;
    }
    return new Response(JSON.stringify({ ok: true, vocabIds, vocabCount: vocabIds.length }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        "access-control-allow-origin": "*",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
});
