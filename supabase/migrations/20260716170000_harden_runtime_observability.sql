alter table public.agent_runs add column if not exists correlation_id uuid not null default gen_random_uuid();
alter table public.agent_runs add column if not exists duration_ms integer;
alter table public.agent_runs add column if not exists provider text;
alter table public.agent_runs add column if not exists request_metadata jsonb not null default '{}'::jsonb;
create unique index if not exists agent_runs_correlation_id_idx on public.agent_runs(correlation_id);

revoke all on table public.oauth_states from anon, authenticated;
revoke all on table public.rate_limit_windows from anon, authenticated;
revoke all on function public.consume_rate_limit(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid, uuid, text, integer, integer) to service_role;

create index if not exists usage_events_org_created_idx on public.usage_events(organization_id, created_at desc);
create index if not exists usage_events_user_created_idx on public.usage_events(user_id, created_at desc) where user_id is not null;
