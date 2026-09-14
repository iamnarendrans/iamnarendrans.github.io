# Resume download gate setup

The portfolio now includes a `Check My Resume` button with this flow:

1. A visitor enters an email address and accepts the data-use notice.
2. Supabase emails a one-time verification code.
3. After verification, an Edge Function records the access and returns a short-lived signed URL.
4. Resend can email you the visitor's email, approximate location, timestamp, and browser details.

The frontend is intentionally shipped with placeholder configuration. It will display a configuration message until the Supabase values are added.

## 1. Create the Supabase project

Create a Supabase project and copy its project URL and publishable/anon key. Keep the service-role key private; it must only be configured as an Edge Function secret.

In the Supabase SQL editor, run:

```sql
-- Paste the contents of supabase/migrations/001_resume_downloads.sql
```

## 2. Store the resume privately

Create a **private** Storage bucket named `private-resume` and upload this file with this exact object name:

```text
Narendran_Srinivasan.pdf
```

Before enabling the real gate, move the public copies out of the deployed GitHub Pages path (they can be retained in a private/archive location). A file inside `assets/` is directly downloadable without OTP, even if the UI button is gated. Keep the private Storage copy as the only production download source.

## 3. Configure email OTP

In Supabase Auth, configure an SMTP provider for production email delivery. The default Supabase email service is intended for testing and is limited to pre-authorized team addresses.

Update the email template used by `signInWithOtp` so it contains the OTP token:

```text
Your resume verification code is {{ .Token }}
```

The frontend verifies this six-digit code through Supabase Auth. Do not use a template that only sends a magic link.

## 4. Configure download notifications

Create a Resend account, verify a sending domain, and create an API key. Then configure these Edge Function secrets:

```text
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
ALLOWED_ORIGIN=https://iamnarendrans.github.io
RESUME_BUCKET=private-resume
RESUME_OBJECT=Narendran_Srinivasan.pdf
RESEND_API_KEY=YOUR_RESEND_API_KEY
NOTIFICATION_EMAIL=your-email@example.com
RESEND_FROM_EMAIL=Portfolio <notifications@your-verified-domain.example>
```

For abuse protection, also configure Cloudflare Turnstile:

```text
TURNSTILE_SECRET_KEY=YOUR_TURNSTILE_SECRET_KEY
```

If Turnstile is configured on the backend, place its public site key in `assets/js/resume-gate.config.js`.

## 5. Deploy the Edge Functions

From the repository root, install/login to the Supabase CLI if needed, link the project, set the secrets, and deploy:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co" SUPABASE_ANON_KEY="YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY" ALLOWED_ORIGIN="https://iamnarendrans.github.io" RESUME_BUCKET="private-resume" RESUME_OBJECT="Narendran_Srinivasan.pdf" RESEND_API_KEY="YOUR_RESEND_API_KEY" NOTIFICATION_EMAIL="your-email@example.com" RESEND_FROM_EMAIL="Portfolio <notifications@your-verified-domain.example>" TURNSTILE_SECRET_KEY="YOUR_TURNSTILE_SECRET_KEY"
supabase functions deploy request-resume-otp
supabase functions deploy resume-download
```

Do not commit this command, the service-role key, Resend key, or Turnstile secret to the repository.

## 6. Configure the public frontend

Edit `assets/js/resume-gate.config.js` with only the public values:

```js
window.RESUME_GATE_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  requestOtpFunction: "request-resume-otp",
  downloadFunction: "resume-download",
  turnstileSiteKey: "YOUR_TURNSTILE_SITE_KEY"
};
```

The publishable/anon key is designed for browser use when database/storage permissions and Row Level Security are configured correctly. Never put `SUPABASE_SERVICE_ROLE_KEY` in this file.

## 7. Test it

After deployment:

1. Open the live portfolio and click `Check My Resume`.
2. Enter an email address you can access and accept the notice.
3. Enter the six-digit OTP from the email.
4. Click the generated `Download resume` link within two minutes.
5. Confirm that the PDF opens, a row appears in `resume_downloads`, and the notification email arrives.

If the UI says “not configured,” the public config file still contains placeholders. If it says “storage is not configured,” check the private bucket/object name and the service-role secret.

## Privacy and retention

The current implementation stores the email, approximate country/region/city, timestamp, language, referrer, and user-agent. It does not store the raw IP address. IP geolocation can be inaccurate, especially for VPNs and mobile networks. Publish a short retention/deletion policy and remove old rows periodically before enabling this publicly.
