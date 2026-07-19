-- Applied 2026-07-19 via Supabase MCP.
--
-- REVERT of 20260719120000_enforce_authenticated_only_rls.sql.
--
-- That lockdown assumed the app sent an authenticated JWT for its data
-- requests. It does not: every data page queries Supabase with the public
-- `anon` key (assets/js/config.js), and the login screen (personal.js) does
-- not propagate a session to those requests. So `to authenticated` policies
-- made every table unreadable and the whole app went blank (no meals, no
-- budget transactions, no foods, ...).
--
-- This restores the previous working behavior: RLS stays enabled, but every
-- table gets a single permissive policy open to the anon role. Effective
-- access is the same the app always had.
--
-- Real RLS is still desirable, but it requires reworking the client auth flow
-- (authenticated Supabase client on every iframed page) and verifying against
-- the live app FIRST — a separate, tested change, not a schema-only flip.

do $$
declare
  r record;
  p record;
begin
  for r in
    select tablename from pg_tables where schemaname = 'public'
  loop
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = r.tablename
    loop
      execute format('drop policy %I on public.%I', p.policyname, r.tablename);
    end loop;

    execute format('alter table public.%I enable row level security', r.tablename);
    execute format(
      'create policy allow_all on public.%I for all to public using (true) with check (true)',
      r.tablename
    );
  end loop;
end $$;
