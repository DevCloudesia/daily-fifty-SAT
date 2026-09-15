create table if not exists public.daily_fifty_accounts (
  profile_id text primary key check (profile_id ~ '^user_[0-9a-f]{32}$'),
  password_fingerprint text not null unique check (password_fingerprint ~ '^[0-9a-f]{64}$'),
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.daily_fifty_accounts enable row level security;
revoke all on public.daily_fifty_accounts from anon, authenticated;
grant select, insert, update on public.daily_fifty_accounts to service_role;
