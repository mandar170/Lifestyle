# Migrations

This folder tracks schema changes going forward. Historical changes (before
2026-07-19) were applied directly against the remote Supabase project and
are not replayed here — the live migration history is the source of truth
for that period (`list_migrations` via the Supabase MCP tools, or the
Supabase dashboard's Database → Migrations view).

## Convention

- One `.sql` file per change, named `<YYYYMMDDHHMMSS>_<snake_case_name>.sql`
  (matches what `apply_migration` generates).
- Every schema change from now on gets applied via `apply_migration` (or the
  Supabase CLI) **and** committed here in the same change — so the repo and
  the live database never drift apart again.
- New tables must ship with RLS enabled and a policy in the same migration
  (see `20260719_enforce_authenticated_only_rls.sql` for the pattern used
  throughout this project: single-user app, gated by Supabase Auth login,
  so policies are `to authenticated using (true) with check (true)` unless
  the table needs per-row ownership).
