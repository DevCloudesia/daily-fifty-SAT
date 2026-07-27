-- Daily Fifty normalized progress and question-classification schema.
-- All access is performed by Supabase Edge Functions using the service role.

create table if not exists public.daily_fifty_sync_state (
  id text primary key,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_fifty_question_skills (
  question_id text primary key,
  heading text,
  is_words_in_context boolean not null default false,
  difficulty text,
  scan_status text not null default 'pending',
  error_message text,
  scanned_at timestamptz not null default now()
);

create table if not exists public.daily_fifty_question_history (
  question_id text primary key check (question_id ~ '^[0-9a-fA-F]{8}$'),
  first_completed_at timestamptz not null default now(),
  last_completed_at timestamptz not null default now(),
  ever_correct boolean not null default false,
  ever_wrong boolean not null default false,
  ever_timed_out boolean not null default false
);

create table if not exists public.daily_fifty_daily_sessions (
  session_date date primary key,
  plan jsonb not null default '[]'::jsonb,
  reserve jsonb not null default '{}'::jsonb,
  plan_version text,
  current_index integer not null default 0 check (current_index between 0 and 49),
  saved_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.daily_fifty_daily_answers (
  session_date date not null references public.daily_fifty_daily_sessions(session_date) on delete cascade,
  question_id text not null check (question_id ~ '^[0-9a-fA-F]{8}$'),
  answer jsonb not null default '{}'::jsonb,
  answer_score integer not null default 0,
  checked boolean not null default false,
  completed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (session_date, question_id)
);

alter table public.daily_fifty_sync_state enable row level security;
alter table public.daily_fifty_question_skills enable row level security;
alter table public.daily_fifty_question_history enable row level security;
alter table public.daily_fifty_daily_sessions enable row level security;
alter table public.daily_fifty_daily_answers enable row level security;
