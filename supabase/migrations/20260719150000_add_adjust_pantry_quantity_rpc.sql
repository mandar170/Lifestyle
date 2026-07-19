-- Applied 2026-07-19 via Supabase MCP (apply_migration: add_adjust_pantry_quantity_rpc).
--
-- Atomic pantry stock mutation. The whole read-modify-write (and the clamp at
-- zero) happens in a single UPDATE, so concurrent meal commits can't lose each
-- other's writes, and the client never has to write back a possibly-stale
-- in-memory quantity. Returns the authoritative new quantity.
--
-- The nutrition.js stock helpers (deductFoodFromStock / refundFoodToStock) now
-- route every pantry mutation through this function instead of doing the
-- subtraction in JS. The equivalence resolution (unit conversion, tolerance)
-- stays in JS unchanged — only the persistence became atomic.
create or replace function public.adjust_pantry_quantity(p_item_id uuid, p_delta numeric)
returns numeric
language sql
as $$
  update public.pantry_items
     set quantity   = greatest(0, coalesce(quantity, 0) + p_delta),
         updated_at = now()
   where id = p_item_id
  returning quantity;
$$;

grant execute on function public.adjust_pantry_quantity(uuid, numeric) to anon, authenticated;
