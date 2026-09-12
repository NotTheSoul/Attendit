-- Attendit Phase 2 — core schema + RLS.
-- Postgres is the source of truth. Redis stays ephemeral (no schema here).
-- Apply with: supabase db push (or paste into the SQL editor).

-- Required for gen_random_uuid()
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- profiles
-- One row per Supabase Auth user. PLAN's `admin` entity.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------- classes
create table if not exists public.classes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  section text,
  academic_year text,
  join_slug text not null unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists classes_owner_idx on public.classes (owner_id) where deleted_at is null;
create index if not exists classes_slug_idx on public.classes (join_slug) where deleted_at is null;

-- ---------------------------------------------------------------- students
-- registration_id unique *within* the class, not globally.
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  full_name text not null,
  registration_id text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists students_class_idx on public.students (class_id) where deleted_at is null;
create unique index if not exists students_class_reg_uidx
  on public.students (class_id, registration_id) where deleted_at is null;

-- ---------------------------------------------------------------- subjects
create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null,
  code text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists subjects_class_idx on public.subjects (class_id) where deleted_at is null;

-- ---------------------------------------------------------------- sessions
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  subject_id uuid references public.subjects (id) on delete set null,
  session_code text not null,
  radius_meters integer not null default 100,
  status text not null default 'draft' check (status in ('draft', 'active', 'closed')),
  opens_at timestamptz,
  closes_at timestamptz,
  sheet_export_id text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists sessions_class_idx on public.sessions (class_id) where deleted_at is null;
create index if not exists sessions_status_idx on public.sessions (status) where deleted_at is null;

-- ---------------------------------------------------------------- responses
-- One row per (session, student). Student check-ins arrive via the
-- service_role API route (server-validated), never direct client inserts.
create table if not exists public.responses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  submitted_at timestamptz not null default now(),
  method text check (method in ('code', 'qr')),
  lat double precision,
  lng double precision,
  accuracy_m double precision,
  distance_from_host_m double precision,
  device_hash text,
  status text not null default 'accepted'
    check (status in ('accepted', 'rejected_distance', 'rejected_code', 'duplicate', 'host_offline')),
  unique (session_id, student_id)
);
create index if not exists responses_session_idx on public.responses (session_id);

-- ---------------------------------------------------------------- helpers
create or replace function public.is_class_owner(p_class_id uuid)
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.classes
    where id = p_class_id
      and owner_id = (select auth.uid())
  );
$$;

-- Auto-create a profile on signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Soft-delete purge (30-day retention). Schedule with pg_cron (service_role):
--   select cron.schedule('attendit-purge', '0 3 * * *', $$select public.purge_soft_deleted()$$);
create or replace function public.purge_soft_deleted()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.sessions where deleted_at < now() - interval '30 days';
  delete from public.subjects where deleted_at < now() - interval '30 days';
  delete from public.students where deleted_at < now() - interval '30 days';
  delete from public.classes where deleted_at < now() - interval '30 days';
end;
$$;

-- ---------------------------------------------------------------- RLS (deny-all default)
-- NOTE: `anon` is deliberately granted NOTHING. Students have no accounts,
-- so public flows (class join page, roster typeahead, attendance submission)
-- run under `service_role` on the server (see src/lib/server/supabase-admin.ts).
-- Do not add anon SELECT policies to "fix" public access — that would expose
-- session codes and rosters to anyone holding the publishable key.
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.sessions enable row level security;
alter table public.responses enable row level security;

-- profiles: owners only
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- classes: owner full access
drop policy if exists "classes_owner_all" on public.classes;
create policy "classes_owner_all" on public.classes
  for all to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

-- students / subjects: via class ownership
drop policy if exists "students_owner_all" on public.students;
create policy "students_owner_all" on public.students
  for all to authenticated
  using (public.is_class_owner(class_id))
  with check (public.is_class_owner(class_id));

drop policy if exists "subjects_owner_all" on public.subjects;
create policy "subjects_owner_all" on public.subjects
  for all to authenticated
  using (public.is_class_owner(class_id))
  with check (public.is_class_owner(class_id));

-- sessions: via class ownership
drop policy if exists "sessions_owner_all" on public.sessions;
create policy "sessions_owner_all" on public.sessions
  for all to authenticated
  using (public.is_class_owner(class_id))
  with check (public.is_class_owner(class_id));

-- responses: owners can read their sessions' responses.
-- No direct client INSERT: student submissions go through the
-- server API route with service_role (server-validated, Phase 4).
drop policy if exists "responses_owner_select" on public.responses;
create policy "responses_owner_select" on public.responses
  for select to authenticated
  using (
    exists (
      select 1 from public.sessions s
      join public.classes c on c.id = s.class_id
      where s.id = responses.session_id
        and c.owner_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------- Realtime
-- Host feed subscribes to responses of one session (scoped by RLS above).
-- Run once (fails silently if already a member):
do $$
begin
  begin
    alter publication supabase_realtime add table public.responses;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.sessions;
  exception when duplicate_object then null;
  end;
end $$;
