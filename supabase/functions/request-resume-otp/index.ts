import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, corsResponse, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

async function verifyTurnstile(token: string, ip: string) {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) return true;
  if (!token) return false;

  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form
  });
  const result = await response.json();
  return result.success === true;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return corsResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await request.json();
    const email = String(body.email || "").trim().toLowerCase();
    const consent = body.consent === true;
    const ip = request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return jsonResponse({ error: "Enter a valid email address." }, 400);
    }
    if (!consent) {
      return jsonResponse({ error: "Consent is required to request the resume." }, 400);
    }
    if (!(await verifyTurnstile(String(body.turnstileToken || ""), ip))) {
      return jsonResponse({ error: "Security verification failed. Please try again." }, 400);
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });

    if (error) return jsonResponse({ error: error.message }, 400);
    return jsonResponse({ ok: true });
  } catch (_error) {
    return jsonResponse({ error: "Unable to send the verification code." }, 500);
  }
});
