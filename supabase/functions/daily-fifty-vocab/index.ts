import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const { data, error } = await supabase
      .from("daily_fifty_question_skills")
      .select("question_id")
      .eq("scan_status", "ok")
      .eq("is_words_in_context", true)
      .order("question_id", { ascending: true });
    if (error) throw error;
    const vocabIds = (data || []).map((row) => row.question_id);
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
