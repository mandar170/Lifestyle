-- Applied 2026-07-19 via Supabase MCP (apply_migration: merge_meal_plans_into_meals_status).
--
-- Unify meals (journal) + meal_plans (plan) into a single table distinguished
-- by a `status` column. A (date, meal_type) slot can hold BOTH a 'planned' and
-- a 'logged' row simultaneously (existing coexistence semantics: you can plan a
-- meal and later log it, and clearing the journal reveals the plan again), so
-- the unique key becomes (date, meal_type, status).

alter table public.meals
  add column status text not null default 'logged';
alter table public.meals
  add constraint meals_status_check check (status in ('planned', 'logged'));

-- Existing meals rows are the real journal -> 'logged' (handled by the default).

-- Swap the old (date, meal_type) unique key for a status-aware one.
alter table public.meals drop constraint if exists meals_date_meal_type_key;
drop index if exists public.meals_date_meal_type_key;
alter table public.meals
  add constraint meals_date_meal_type_status_key unique (date, meal_type, status);

-- Bring the plan rows in as status='planned'. No conflict possible: every
-- existing meals row is 'logged', and meal_plans is already unique on
-- (plan_date, meal_type) so there are no duplicate planned rows.
insert into public.meals (date, meal_type, status, description, calories, protein_g, carbs_g, fat_g, fiber_g, created_at)
select plan_date, meal_type, 'planned', description, calories, protein_g, carbs_g, fat_g, fiber_g, created_at
from public.meal_plans;

-- Retire the old table (keep the data, reversible).
alter table public.meal_plans rename to zz_deprecated_meal_plans;
