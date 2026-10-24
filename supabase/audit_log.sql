-- Run once in the VENDOR's own Supabase project (SQL editor). Not in any school's database.
-- Append-only audit log for the platform dashboard.

create table if not exists public.platform_audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
create index if not exists platform_audit_log_at_idx on public.platform_audit_log (at desc);
-- Login rate limiting counts recent 'login.failed' rows per IP / operator.
create index if not exists platform_audit_log_action_at_idx on public.platform_audit_log (action, at desc);

alter table public.platform_audit_log enable row level security;
revoke all on public.platform_audit_log from public, anon, authenticated;
-- No policies: only the service-role key (which bypasses RLS) can read or insert.

-- Append-only, even for the service role: rows can't be changed or removed.
create or replace function public.platform_audit_log_immutable()
returns trigger language plpgsql as $$
begin
  raise exception 'platform_audit_log is append-only';
end $$;
drop trigger if exists platform_audit_log_no_change on public.platform_audit_log;
create trigger platform_audit_log_no_change
  before update or delete on public.platform_audit_log
  for each row execute function public.platform_audit_log_immutable();
drop trigger if exists platform_audit_log_no_truncate on public.platform_audit_log;
create trigger platform_audit_log_no_truncate
  before truncate on public.platform_audit_log
  for each statement execute function public.platform_audit_log_immutable();
