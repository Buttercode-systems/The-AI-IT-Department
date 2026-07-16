create extension if not exists pgcrypto;

create type public.membership_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.connection_status as enum ('pending', 'connected', 'degraded', 'revoked', 'error');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  industry text,
  timezone text not null default 'Africa/Johannesburg',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.business_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  primary_role text,
  team_size text,
  desired_outcomes jsonb not null default '[]'::jsonb,
  current_tools jsonb not null default '[]'::jsonb,
  profile_version integer not null default 1,
  updated_at timestamptz not null default now()
);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('google')),
  provider_account_id text,
  provider_account_label text,
  status public.connection_status not null default 'pending',
  granted_scopes text[] not null default '{}',
  token_ciphertext text,
  token_key_version integer,
  expires_at timestamptz,
  last_verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, provider, provider_account_id)
);

create table public.setup_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  stage text not null default 'started',
  recommended_connections jsonb not null default '[]'::jsonb,
  completed_steps jsonb not null default '[]'::jsonb,
  blocking_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  source text not null,
  tool_name text,
  provider text,
  resource_type text,
  operation text not null,
  result text not null,
  error_code text,
  correlation_id uuid not null default gen_random_uuid(),
  occurred_at timestamptz not null default now()
);

create index provider_connections_tenant_idx on public.provider_connections (organization_id, user_id, provider);
create index audit_events_tenant_time_idx on public.audit_events (organization_id, occurred_at desc);
create index setup_runs_user_idx on public.setup_runs (organization_id, user_id, started_at desc);

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.business_profiles enable row level security;
alter table public.provider_connections enable row level security;
alter table public.setup_runs enable row level security;
alter table public.audit_events enable row level security;

create or replace function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.memberships
    where organization_id = target_org and user_id = auth.uid()
  );
$$;

create policy "members can read organizations"
on public.organizations for select
using (public.is_org_member(id));

create policy "members can read memberships"
on public.memberships for select
using (public.is_org_member(organization_id));

create policy "members can read business profiles"
on public.business_profiles for select
using (public.is_org_member(organization_id));

create policy "owners and admins can update business profiles"
on public.business_profiles for all
using (
  exists (
    select 1 from public.memberships
    where organization_id = business_profiles.organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.memberships
    where organization_id = business_profiles.organization_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

create policy "users can read their provider connections"
on public.provider_connections for select
using (public.is_org_member(organization_id) and user_id = auth.uid());

create policy "users can read their setup runs"
on public.setup_runs for select
using (public.is_org_member(organization_id) and user_id = auth.uid());

create policy "members can read safe audit metadata"
on public.audit_events for select
using (public.is_org_member(organization_id));

revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
