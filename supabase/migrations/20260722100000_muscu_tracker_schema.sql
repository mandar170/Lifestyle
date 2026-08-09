-- Applied 2026-07-22 via Supabase MCP (apply_migration: muscu_tracker_schema).
--
-- Strength-training tracker: exercises library, sessions with sets, templates,
-- and muscle groups (for the per-muscle recap). RLS is permissive (anon), like
-- the rest of the schema (see the README security note).

create table if not exists public.muscle_groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  order_index int not null default 0,
  created_at  timestamptz default now()
);

create table if not exists public.exercises (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_cardio   boolean not null default false,
  created_at  timestamptz default now()
);

create table if not exists public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_id   uuid not null references public.muscle_groups(id) on delete cascade,
  primary key (exercise_id, muscle_id)
);

create table if not exists public.workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  session_date date,
  duration_min int,
  notes        text,
  is_template  boolean not null default false,
  created_at   timestamptz default now()
);

create table if not exists public.session_exercises (
  id                  uuid primary key default gen_random_uuid(),
  session_id          uuid not null references public.workout_sessions(id) on delete cascade,
  exercise_id         uuid references public.exercises(id) on delete set null,
  exercise_name       text not null,           -- snapshot: history survives renames/deletes
  order_index         int not null default 0,
  is_cardio           boolean not null default false,
  cardio_duration_min int,
  created_at          timestamptz default now()
);

create table if not exists public.exercise_sets (
  id                  uuid primary key default gen_random_uuid(),
  session_exercise_id uuid not null references public.session_exercises(id) on delete cascade,
  set_index           int not null default 0,
  set_type            text not null default 'travail' check (set_type in ('echauffement','travail','recup')),
  reps                int,
  weight_kg           numeric,
  created_at          timestamptz default now()
);

create index if not exists idx_session_exercises_session on public.session_exercises(session_id);
create index if not exists idx_exercise_sets_sess_ex     on public.exercise_sets(session_exercise_id);
create index if not exists idx_exercise_muscles_ex       on public.exercise_muscles(exercise_id);
create index if not exists idx_workout_sessions_date     on public.workout_sessions(session_date);

insert into public.muscle_groups (name, order_index) values
  ('Pectoraux',1),('Dos',2),('Épaules',3),('Biceps',4),('Triceps',5),
  ('Quadriceps',6),('Ischios',7),('Fessiers',8),('Mollets',9),
  ('Abdos',10),('Avant-bras',11),('Trapèzes',12)
on conflict (name) do nothing;

do $$
declare tbl text;
begin
  foreach tbl in array array['muscle_groups','exercises','exercise_muscles','workout_sessions','session_exercises','exercise_sets']
  loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('create policy allow_all on public.%I for all to public using (true) with check (true)', tbl);
  end loop;
end $$;
