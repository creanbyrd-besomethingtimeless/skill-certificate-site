-- TYE Skill Certificate site: Supabase schema
-- Run this whole file in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It is safe to run more than once: tables and policies use IF NOT EXISTS / DROP IF EXISTS.
-- Requires the pgcrypto extension for gen_random_uuid().

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles: one row per user, filled from the full name in sign-up metadata.
-- id matches auth.users.id.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- progress: one row per user per day. A row exists only when the day's quiz
-- was passed at 70 percent or more.
-- ---------------------------------------------------------------------------
create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day integer not null check (day >= 1 and day <= 30),
  completed_at timestamptz not null default now(),
  quiz_score integer not null default 0 check (quiz_score >= 0 and quiz_score <= 100),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- ---------------------------------------------------------------------------
-- capstone_checks: one row per user per capstone check the user has ticked.
-- Check ids are plain text, for example capstone-plan, capstone-frontend.
-- ---------------------------------------------------------------------------
create table if not exists public.capstone_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  check_id text not null,
  checked_at timestamptz not null default now(),
  unique (user_id, check_id)
);

-- ---------------------------------------------------------------------------
-- certificates: one row per user per skill. Code format is SC-YYYY-XXXXXX
-- and is unique. Verification is public by code (see the policy below),
-- so anyone with the code can confirm the learner, skill and issue date.
-- ---------------------------------------------------------------------------
create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  code text not null unique,
  skill text not null,
  learner_name text not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, skill)
);

create index if not exists progress_user_id_idx on public.progress (user_id);
create index if not exists capstone_checks_user_id_idx on public.capstone_checks (user_id);
create index if not exists certificates_code_idx on public.certificates (code);
create index if not exists certificates_user_id_idx on public.certificates (user_id);

-- ---------------------------------------------------------------------------
-- Row Level Security. Users only see their own rows, except certificates,
-- which anyone can read by code for verification. No one can read another
-- user's progress or capstone checks, and no one can write another user's
-- rows. The anon key alone cannot bypass these rules.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.progress enable row level security;
alter table public.capstone_checks enable row level security;
alter table public.certificates enable row level security;

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "Users can view their own progress" on public.progress;
create policy "Users can view their own progress"
  on public.progress for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own progress" on public.progress;
create policy "Users can insert their own progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own progress" on public.progress;
create policy "Users can update their own progress"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own capstone checks" on public.capstone_checks;
create policy "Users can view their own capstone checks"
  on public.capstone_checks for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own capstone checks" on public.capstone_checks;
create policy "Users can insert their own capstone checks"
  on public.capstone_checks for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own capstone checks" on public.capstone_checks;
create policy "Users can delete their own capstone checks"
  on public.capstone_checks for delete
  using (auth.uid() = user_id);

drop policy if exists "Users can view their own certificates" on public.certificates;
create policy "Users can view their own certificates"
  on public.certificates for select
  using (auth.uid() = user_id);

drop policy if exists "Anyone can verify a certificate by code" on public.certificates;
create policy "Anyone can verify a certificate by code"
  on public.certificates for select
  using (true);

drop policy if exists "Users can insert their own certificates" on public.certificates;
create policy "Users can insert their own certificates"
  on public.certificates for insert
  with check (auth.uid() = user_id);
