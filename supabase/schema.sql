-- TYE Skill Certificate site: Supabase schema
-- Run this whole file in the Supabase dashboard: SQL Editor > New query > paste > Run.
-- It is safe to run more than once: tables and policies use IF NOT EXISTS / DROP IF EXISTS.
-- Requires the pgcrypto extension for gen_random_uuid().
--
-- MULTI-SKILL MIGRATION: the site now teaches many skills, so progress,
-- capstone_checks and certificates each carry a skill_slug column and
-- their unique constraints are per skill. The migration below is
-- idempotent over the live tables that already exist: it adds the column
-- only if missing, backfills existing rows (all full-stack until now,
-- except certificates, whose slug is derived from the skill name), and
-- swaps the unique constraints only when the new one can hold.

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
-- progress: one row per user per skill per day. A row exists only when the
-- day's quiz was passed at 70 percent or more.
-- ---------------------------------------------------------------------------
create table if not exists public.progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_slug text not null default 'full-stack-web-development',
  day integer not null check (day >= 1 and day <= 30),
  completed_at timestamptz not null default now(),
  quiz_score integer not null default 0 check (quiz_score >= 0 and quiz_score <= 100),
  created_at timestamptz not null default now()
);

-- Migrate live tables that were created before skill_slug existed.
alter table public.progress add column if not exists skill_slug text;
update public.progress set skill_slug = 'full-stack-web-development' where skill_slug is null;
alter table public.progress alter column skill_slug set not null;
alter table public.progress alter column skill_slug set default 'full-stack-web-development';
alter table public.progress drop constraint if exists progress_user_id_day_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'progress_user_skill_day_key')
     and not exists (select user_id, skill_slug, day from public.progress group by user_id, skill_slug, day having count(*) > 1) then
    alter table public.progress add constraint progress_user_skill_day_key unique (user_id, skill_slug, day);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- capstone_checks: one row per user per skill per capstone check the user
-- has ticked. Check ids are plain text, for example capstone-plan,
-- capstone-frontend.
-- ---------------------------------------------------------------------------
create table if not exists public.capstone_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  skill_slug text not null default 'full-stack-web-development',
  check_id text not null,
  checked_at timestamptz not null default now()
);

alter table public.capstone_checks add column if not exists skill_slug text;
update public.capstone_checks set skill_slug = 'full-stack-web-development' where skill_slug is null;
alter table public.capstone_checks alter column skill_slug set not null;
alter table public.capstone_checks alter column skill_slug set default 'full-stack-web-development';
alter table public.capstone_checks drop constraint if exists capstone_checks_user_id_check_id_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'capstone_checks_user_skill_check_key')
     and not exists (select user_id, skill_slug, check_id from public.capstone_checks group by user_id, skill_slug, check_id having count(*) > 1) then
    alter table public.capstone_checks add constraint capstone_checks_user_skill_check_key unique (user_id, skill_slug, check_id);
  end if;
end $$;

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
  skill_slug text not null default 'full-stack-web-development',
  learner_name text not null,
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.certificates add column if not exists skill_slug text;
-- Backfill from the skill NAME, slugified, so a certificate issued for
-- another skill keeps its own slug instead of being lumped into
-- full-stack. Falls back to full-stack when the name slugifies to nothing.
update public.certificates
  set skill_slug = coalesce(nullif(btrim(lower(regexp_replace(skill, '[^a-zA-Z0-9]+', '-', 'g')), '-'), ''), 'full-stack-web-development')
  where skill_slug is null;
alter table public.certificates alter column skill_slug set not null;
alter table public.certificates alter column skill_slug set default 'full-stack-web-development';
alter table public.certificates drop constraint if exists certificates_user_id_skill_key;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'certificates_user_skill_key')
     and not exists (select user_id, skill_slug from public.certificates group by user_id, skill_slug having count(*) > 1) then
    alter table public.certificates add constraint certificates_user_skill_key unique (user_id, skill_slug);
  end if;
end $$;

create index if not exists progress_user_id_idx on public.progress (user_id);
create index if not exists progress_skill_slug_idx on public.progress (skill_slug);
create index if not exists capstone_checks_user_id_idx on public.capstone_checks (user_id);
create index if not exists capstone_checks_skill_slug_idx on public.capstone_checks (skill_slug);
create index if not exists certificates_code_idx on public.certificates (code);
create index if not exists certificates_user_id_idx on public.certificates (user_id);
create index if not exists certificates_skill_slug_idx on public.certificates (skill_slug);

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

-- ---------------------------------------------------------------------------
-- Table privileges. RLS policies alone do not grant access: without these,
-- PostgREST returns 42501 "permission denied" for anon and authenticated,
-- the site falls back to browser-only progress, and public verification
-- always fails. RLS still enforces the row rules above.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to anon, authenticated;
grant select, insert, update, delete on public.progress to anon, authenticated;
grant select, insert, update, delete on public.capstone_checks to anon, authenticated;
grant select, insert, update, delete on public.certificates to anon, authenticated;
