create table if not exists public.connection_tests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.provider_connections(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('passed','failed')),
  gmail_ok boolean not null default false,
  calendar_ok boolean not null default false,
  scopes_ok boolean not null default false,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists connection_tests_connection_created_idx on public.connection_tests(connection_id, created_at desc);
alter table public.connection_tests enable row level security;
create policy "members can read connection tests" on public.connection_tests for select to authenticated using (
  exists (select 1 from public.memberships m where m.organization_id = connection_tests.organization_id and m.user_id = auth.uid())
);

create table if not exists public.capabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  capability_key text not null,
  status text not null check (status in ('active','inactive')) default 'inactive',
  config jsonb not null default '{}'::jsonb,
  activated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (organization_id, capability_key)
);
alter table public.capabilities enable row level security;
create policy "members can read capabilities" on public.capabilities for select to authenticated using (
  exists (select 1 from public.memberships m where m.organization_id = capabilities.organization_id and m.user_id = auth.uid())
);
revoke all on table public.connection_tests from anon;
revoke all on table public.capabilities from anon;
grant select on table public.connection_tests to authenticated;
grant select on table public.capabilities to authenticated;
