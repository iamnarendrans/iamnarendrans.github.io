/*
 * Public configuration for the resume access gate.
 *
 * The Supabase publishable/anon key is safe to expose in browser code when
 * Row Level Security is enabled. Never put a service-role key here.
 */
window.RESUME_GATE_CONFIG = {
  supabaseUrl: "https://tnhzxukwjdxzjfvhmsfg.supabase.co",
  supabaseAnonKey: "sb_publishable_5CwHhvsyqB9ZQPrK1-W0kA_F_aQeBwJ",
  requestOtpFunction: "request-resume-otp",
  downloadFunction: "resume-download",
  turnstileSiteKey: ""
};
