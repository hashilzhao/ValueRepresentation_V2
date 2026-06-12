-- Study 1 — Initial Database Schema
-- Run this migration in the Supabase SQL Editor.

-- 1. Profiles (extends auth.users)
-- One row per admin / researcher account.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  role        text not null default 'researcher' check (role in ('admin', 'researcher')),
  display_name text not null default '',
  created_at  timestamptz not null default now()
);

-- Enable RLS
alter table public.profiles enable row level security;

-- Only authenticated admins can read profiles.
create policy "Admins can read profiles"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- 2. Participants
create table if not exists public.participants (
  id                uuid primary key default gen_random_uuid(),
  participant_code  text not null unique,
  age               int not null,
  gender            text not null,
  major             text not null,
  consented         boolean not null default false,
  consent_timestamp timestamptz,
  status            text not null default 'active' check (status in ('active', 'completed', 'excluded')),
  created_at        timestamptz not null default now()
);

alter table public.participants enable row level security;

-- Participants can read their own row (TODO: tighten to session-based access).
-- Admins have full access via authenticated role.
create policy "Allow insert for all"
  on public.participants for insert
  with check (true);

create policy "Allow read for authenticated"
  on public.participants for select
  using (auth.role() = 'authenticated');

-- 3. Experiment Sessions
create table if not exists public.experiment_sessions (
  id             uuid primary key default gen_random_uuid(),
  participant_id uuid not null references public.participants(id) on delete cascade,
  current_stage  text not null default 'welcome',
  status         text not null default 'in_progress' check (status in ('in_progress', 'completed', 'excluded')),
  started_at     timestamptz not null default now(),
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.experiment_sessions enable row level security;

create policy "Allow insert for all"
  on public.experiment_sessions for insert
  with check (true);

create policy "Allow read for authenticated"
  on public.experiment_sessions for select
  using (auth.role() = 'authenticated');

-- 4. Event Logs (immutable audit trail)
create table if not exists public.event_logs (
  id             bigserial primary key,
  session_id     uuid not null references public.experiment_sessions(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  event_type     text not null,
  event_data     jsonb,
  created_at     timestamptz not null default now()
);

alter table public.event_logs enable row level security;

-- All inserts allowed (participants don't authenticate).
create policy "Allow insert for all"
  on public.event_logs for insert
  with check (true);

-- Only authenticated users (admins) can read event logs.
create policy "Allow read for authenticated"
  on public.event_logs for select
  using (auth.role() = 'authenticated');

-- Indexes for common queries
create index if not exists idx_participants_code on public.participants(participant_code);
create index if not exists idx_participants_status on public.participants(status);
create index if not exists idx_sessions_participant on public.experiment_sessions(participant_id);
create index if not exists idx_sessions_status on public.experiment_sessions(status);
create index if not exists idx_event_logs_session on public.event_logs(session_id);
create index if not exists idx_event_logs_participant on public.event_logs(participant_id);
create index if not exists idx_event_logs_type on public.event_logs(event_type);

-- Helper: auto-create a profile row when a new user signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    'admin',
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function on every new auth user.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
