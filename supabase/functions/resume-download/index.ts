import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, corsResponse, jsonResponse } from "../_shared/cors.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const resumeBucket = Deno.env.get("RESUME_BUCKET") || "private-resume";
const resumeObject = Deno.env.get("RESUME_OBJECT") || "Narendran_Srinivasan.pdf";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getClientIp(request: Request) {
  return request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
}

async function getApproximateLocation(ip: string) {
  if (!ip) return {};
  try {
    const response = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (!response.ok) return {};
    const location = await response.json();
    return {
      country: location.country_name || location.country || null,
      region: location.region || null,
      city: location.city || null
    };
  } catch (_error) {
    return {};
  }
}

async function notifyOwner(details: Record<string, unknown>) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("NOTIFICATION_EMAIL");
  const from = Deno.env.get("RESEND_FROM_EMAIL");
  if (!apiKey || !to || !from) {
    return { sent: false, error: "Notification email is not configured." };
  }

  const location = [details.city, details.region, details.country].filter(Boolean).join(", ") || "Unavailable";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Resume downloaded from your portfolio",
      html: `
        <h2>Resume download notification</h2>
        <p><strong>Email:</strong> ${escapeHtml(details.email)}</p>
        <p><strong>Approximate location:</strong> ${escapeHtml(location)}</p>
        <p><strong>Timezone:</strong> ${escapeHtml(details.timezone || "Unavailable")}</p>
        <p><strong>Language:</strong> ${escapeHtml(details.language || "Unavailable")}</p>
        <p><strong>Downloaded at:</strong> ${escapeHtml(details.downloaded_at)}</p>
        <p><strong>User agent:</strong> ${escapeHtml(details.user_agent || "Unavailable")}</p>
      `
    })
  });

  if (!response.ok) {
    const error = await response.text();
    return { sent: false, error: error.slice(0, 500) };
  }
  return { sent: true, error: null };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return corsResponse();
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const authorization = request.headers.get("Authorization") || "";
    const accessToken = authorization.replace(/^Bearer\s+/i, "");
    if (!accessToken) return jsonResponse({ error: "Verification required." }, 401);

    const publicClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: userData, error: userError } = await publicClient.auth.getUser(accessToken);
    if (userError || !userData.user?.email) {
      return jsonResponse({ error: "Verification expired. Please request a new code." }, 401);
    }

    const details = await request.json().catch(() => ({}));
    const downloadedAt = new Date().toISOString();
    const location = await getApproximateLocation(getClientIp(request));
    const serviceClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: signedData, error: signedError } = await serviceClient.storage
      .from(resumeBucket)
      .createSignedUrl(resumeObject, 120);
    if (signedError || !signedData?.signedUrl) {
      return jsonResponse({ error: "Resume storage is not configured yet." }, 503);
    }

    const log = {
      user_id: userData.user.id,
      email: userData.user.email,
      country: location.country || null,
      region: location.region || null,
      city: location.city || null,
      timezone: details.timezone || null,
      language: details.language || null,
      user_agent: request.headers.get("user-agent") || null,
      referrer: details.referrer || null,
      downloaded_at: downloadedAt
    };

    const { data: downloadLog, error: logError } = await serviceClient
      .from("resume_downloads")
      .insert(log)
      .select("id")
      .single();
    if (logError) return jsonResponse({ error: "Unable to record the download." }, 500);

    const notification = await notifyOwner(log);
    await serviceClient.from("resume_downloads").update({
      notification_sent: notification.sent,
      notification_error: notification.error
    }).eq("id", downloadLog.id);

    return jsonResponse({
      download_url: signedData.signedUrl,
      expires_in: 120
    });
  } catch (_error) {
    return jsonResponse({ error: "Unable to prepare the resume download." }, 500);
  }
});
