alter table public.agent_approvals
  add column if not exists idempotency_key text,
  add column if not exists payload_hash text,
  add column if not exists provider text not null default 'google',
  add column if not exists execution_attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz;

update public.agent_approvals
set idempotency_key = coalesce(idempotency_key, id::text),
    payload_hash = coalesce(payload_hash, encode(digest(arguments::text, 'sha256'), 'hex'))
where idempotency_key is null or payload_hash is null;

alter table public.agent_approvals
  alter column idempotency_key set not null,
  alter column payload_hash set not null;

create unique index if not exists agent_approvals_org_idempotency_unique
  on public.agent_approvals(organization_id, idempotency_key);
create index if not exists agent_approvals_pending_lookup_idx
  on public.agent_approvals(organization_id, user_id, status, expires_at);

alter table public.agent_approvals drop constraint if exists agent_approvals_status_check;
alter table public.agent_approvals add constraint agent_approvals_status_check
  check (status in ('pending','approved','rejected','executing','executed','failed','expired'));

alter table public.agent_approvals drop constraint if exists agent_approvals_risk_level_check;
alter table public.agent_approvals add constraint agent_approvals_risk_level_check
  check (risk_level in ('low','medium','high','critical'));
