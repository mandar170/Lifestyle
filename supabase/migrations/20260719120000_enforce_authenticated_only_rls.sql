-- Applied 2026-07-19 via Supabase MCP (apply_migration: enforce_authenticated_only_rls).
-- Committed here for history; see supabase/migrations/README.md for the convention.
--
-- 15 tables had Row Level Security fully disabled (fully exposed to the
-- public `anon` key). Additionally, every table that DID have RLS enabled
-- was using an `allow_all` policy (`qual: true`, role `public`) — i.e. RLS
-- enabled in name only, still open to anyone. This migration locks every
-- table down to authenticated Supabase Auth sessions only, matching the
-- app's existing login gate (personal.js / db.auth.signInWithPassword).

alter table public.habit_categories enable row level security;
alter table public.meals enable row level security;
alter table public.activities enable row level security;
alter table public.budget_transactions enable row level security;
alter table public.budget_goals enable row level security;
alter table public.running_sessions enable row level security;
alter table public.calendar_events enable row level security;
alter table public.habit_completions enable row level security;
alter table public.habits enable row level security;
alter table public.workout_sets enable row level security;
alter table public.measurements enable row level security;
alter table public.daily_steps enable row level security;
alter table public.meal_plans enable row level security;
alter table public.nutrition enable row level security;
alter table public.budget_accounts enable row level security;

create policy authenticated_only on public.habit_categories for all to authenticated using (true) with check (true);
create policy authenticated_only on public.activities for all to authenticated using (true) with check (true);
create policy authenticated_only on public.running_sessions for all to authenticated using (true) with check (true);
create policy authenticated_only on public.calendar_events for all to authenticated using (true) with check (true);
create policy authenticated_only on public.habit_completions for all to authenticated using (true) with check (true);
create policy authenticated_only on public.habits for all to authenticated using (true) with check (true);
create policy authenticated_only on public.workout_sets for all to authenticated using (true) with check (true);
create policy authenticated_only on public.measurements for all to authenticated using (true) with check (true);
create policy authenticated_only on public.daily_steps for all to authenticated using (true) with check (true);
create policy authenticated_only on public.meal_plans for all to authenticated using (true) with check (true);
create policy authenticated_only on public.nutrition for all to authenticated using (true) with check (true);
create policy authenticated_only on public.meals for all to authenticated using (true) with check (true);

-- budget_transactions, budget_goals, budget_accounts already had proper
-- owner-scoped policies (auth.uid() = user_id) with real data behind them —
-- kept as-is, just needed RLS switched on.

drop policy allow_all on public.daily_water;
create policy authenticated_only on public.daily_water for all to authenticated using (true) with check (true);

drop policy allow_all on public.food_equivalences;
create policy authenticated_only on public.food_equivalences for all to authenticated using (true) with check (true);

drop policy allow_all on public.food_tag_links;
create policy authenticated_only on public.food_tag_links for all to authenticated using (true) with check (true);

drop policy allow_all on public.food_tags;
create policy authenticated_only on public.food_tags for all to authenticated using (true) with check (true);

drop policy allow_all on public.foods;
create policy authenticated_only on public.foods for all to authenticated using (true) with check (true);

drop policy allow_all on public.journal_entries;
create policy authenticated_only on public.journal_entries for all to authenticated using (true) with check (true);

drop policy allow_all on public.meal_food_items;
create policy authenticated_only on public.meal_food_items for all to authenticated using (true) with check (true);

drop policy allow_all on public.meal_plan_items;
create policy authenticated_only on public.meal_plan_items for all to authenticated using (true) with check (true);

drop policy allow_all on public.meal_plan_sub_entries;
create policy authenticated_only on public.meal_plan_sub_entries for all to authenticated using (true) with check (true);

drop policy allow_all on public.meal_presets;
create policy authenticated_only on public.meal_presets for all to authenticated using (true) with check (true);

drop policy allow_all on public.nutrition_goals;
create policy authenticated_only on public.nutrition_goals for all to authenticated using (true) with check (true);

drop policy allow_all on public.planned_workouts;
create policy authenticated_only on public.planned_workouts for all to authenticated using (true) with check (true);

-- pantry_items: dropped both the broken owner policy (user_id was NULL on
-- every existing row, so it would have silently blocked all access) and the
-- open allow_all policy; replaced with the same authenticated-only rule.
drop policy owner_all_pi on public.pantry_items;
drop policy allow_all on public.pantry_items;
create policy authenticated_only on public.pantry_items for all to authenticated using (true) with check (true);
