create table if not exists public.resume_downloads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  email text not null,
  country text,
  region text,
  city text,
  timezone text,
  language text,
  user_agent text,
  referrer text,
  downloaded_at timestamptz not null default now(),
  notification_sent boolean not null default false,
  notification_error text
);

alter table public.resume_downloads enable row level security;
revoke all on public.resume_downloads from anon, authenticated;
