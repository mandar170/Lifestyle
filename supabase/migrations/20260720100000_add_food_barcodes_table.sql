-- Applied 2026-07-20 via Supabase MCP (apply_migration: add_food_barcodes_table).
--
-- Multiple barcodes per food (the app caps at 5). Replaces the single
-- foods.barcode column, which caused duplicate foods when a product's
-- alternate barcode was scanned (Open Food Facts returned a different name
-- than the food already registered).
create table if not exists public.food_barcodes (
  id         uuid primary key default gen_random_uuid(),
  food_id    uuid not null references public.foods(id) on delete cascade,
  barcode    text not null unique,
  created_at timestamptz default now()
);
create index if not exists idx_food_barcodes_food on public.food_barcodes(food_id);

-- Migrate the existing single barcodes into the new table.
insert into public.food_barcodes (food_id, barcode)
select id, barcode from public.foods
where barcode is not null and btrim(barcode) <> ''
on conflict (barcode) do nothing;

-- foods.barcode is now deprecated (kept for safety, no longer read/written).

-- RLS: same permissive anon model as the rest of the schema (see the README
-- security note — real per-user RLS is a separate auth-rework chantier).
alter table public.food_barcodes enable row level security;
create policy allow_all on public.food_barcodes for all to public using (true) with check (true);
