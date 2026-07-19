-- Applied 2026-07-19 via Supabase MCP (apply_migration: mark_dead_tables_deprecated).
--
-- meal_plan_items / meal_plan_sub_entries are not referenced anywhere in the
-- app's JS anymore (superseded by meal_plans + meal_food_items). Renamed
-- instead of dropped: reversible, keeps the historical data (61 + 11 rows)
-- safe, just gets them out of the way of the active schema.
alter table public.meal_plan_items rename to zz_deprecated_meal_plan_items;
alter table public.meal_plan_sub_entries rename to zz_deprecated_meal_plan_sub_entries;
