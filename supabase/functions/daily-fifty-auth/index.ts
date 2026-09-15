import { createClient } from "npm:@supabase/supabase-js@2";
import bcrypt from "npm:bcryptjs@2.4.3";

const SYNC_KEY = Deno.env.get("DAILY_FIFTY_SYNC_KEY");
const PROFILE_PATTERN = /^user_[0-9a-f]{32}$/;

function headers() {
  return { "Content-Type": "application/json", "Cache-Control": "no-store" };
}

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: headers() });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return reply(405, { error: "Method not allowed" });
  if (!SYNC_KEY || req.headers.get("x-daily-fifty-key") !== SYNC_KEY) return reply(401, { error: "Unauthorized" });

  try {
    const body = await req.json();
    const action = String(body?.action || "");
    const password = String(body?.password || "");
    if (password.length < 8 || password.length > 128) return reply(400, { error: "Password must be 8 to 128 characters." });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );
    const fingerprint = await sha256Hex(password);

    if (action === "signup") {
      const { data: existing, error: existingError } = await supabase
        .from("daily_fifty_accounts")
        .select("profile_id")
        .eq("password_fingerprint", fingerprint)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return reply(409, { error: "That password is already registered." });

      const profile = `user_${crypto.randomUUID().replaceAll("-", "")}`;
      if (!PROFILE_PATTERN.test(profile)) throw new Error("Generated profile id is invalid.");
      const passwordHash = await bcrypt.hash(password, 12);
      const { error: insertError } = await supabase.from("daily_fifty_accounts").insert({
        profile_id: profile,
        password_fingerprint: fingerprint,
        password_hash: passwordHash,
      });
      if (insertError) {
        if (insertError.code === "23505") return reply(409, { error: "That password is already registered." });
        throw insertError;
      }
      return reply(200, { ok: true, profile });
    }

    if (action === "login") {
      const { data: account, error: accountError } = await supabase
        .from("daily_fifty_accounts")
        .select("profile_id,password_hash")
        .eq("password_fingerprint", fingerprint)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account || !PROFILE_PATTERN.test(String(account.profile_id))) return reply(401, { error: "Invalid password." });
      const valid = await bcrypt.compare(password, String(account.password_hash));
      if (!valid) return reply(401, { error: "Invalid password." });

      await supabase.from("daily_fifty_accounts").update({ last_login_at: new Date().toISOString() }).eq("profile_id", account.profile_id);
      return reply(200, { ok: true, profile: account.profile_id });
    }

    return reply(400, { error: "Unsupported action." });
  } catch (error) {
    console.error(error);
    return reply(500, { error: error instanceof Error ? error.message : String(error) });
  }
});
