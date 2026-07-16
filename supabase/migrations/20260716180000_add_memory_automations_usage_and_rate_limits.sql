create table if not exists public.workspace_memories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null,
  memory_value jsonb not null default '{}'::jsonb,
  category text not null default 'business',
  source text not null default 'user',
  confidence numeric(4,3) not null default 1.000 check (confidence >= 0 and confidence <= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, memory_key)
);

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  instruction text not null,
  schedule_type text not null default 'cron' check (schedule_type in ('cron','daily','weekly','manual')),
  cron_expression text,
  timezone text not null default 'Africa/Johannesburg',
  status text not null default 'active' check (status in ('active','paused','disabled')),
  next_run_at timestamptz,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references public.automations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running','completed','failed','skipped')),
  output jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.usage_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  quantity integer not null default 1 check (quantity > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.rate_limit_windows (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  bucket_start timestamptz not null,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id, action, bucket_start)
);

create index if not exists workspace_memories_org_updated_idx on public.workspace_memories(organization_id, updated_at desc);
create index if not exists workspace_memories_user_idx on public.workspace_memories(user_id);
create index if not exists automations_due_idx on public.automations(status, next_run_at) where status = 'active';
create index if not exists automations_org_user_idx on public.automations(organization_id, user_id, updated_at desc);
create index if not exists automation_runs_automation_started_idx on public.automation_runs(automation_id, started_at desc);
create index if not exists automation_runs_org_idx on public.automation_runs(organization_id);
create index if not exists automation_runs_user_idx on public.automation_runs(user_id);
create index if not exists usage_events_org_created_idx on public.usage_events(organization_id, created_at desc);
create index if not exists usage_events_user_idx on public.usage_events(user_id);
create index if not exists rate_limit_windows_user_idx on public.rate_limit_windows(user_id);

alter table public.workspace_memories enable row level security;
alter table public.automations enable row level security;
alter table public.automation_runs enable row level security;
alter table public.usage_events enable row level security;
alter table public.rate_limit_windows enable row level security;

drop policy if exists workspace_memories_member_access on public.workspace_memories;
create policy workspace_memories_member_access on public.workspace_memories for all to authenticated
  using (exists (select 1 from public.memberships m where m.organization_id = workspace_memories.organization_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.memberships m where m.organization_id = workspace_memories.organization_id and m.user_id = (select auth.uid())) and user_id = (select auth.uid()));

drop policy if exists automations_member_access on public.automations;
create policy automations_member_access on public.automations for all to authenticated
  using (exists (select 1 from public.memberships m where m.organization_id = automations.organization_id and m.user_id = (select auth.uid())))
  with check (exists (select 1 from public.memberships m where m.organization_id = automations.organization_id and m.user_id = (select auth.uid())) and user_id = (select auth.uid()));

drop policy if exists automation_runs_member_select on public.automation_runs;
create policy automation_runs_member_select on public.automation_runs for select to authenticated
  using (exists (select 1 from public.memberships m where m.organization_id = automation_runs.organization_id and m.user_id = (select auth.uid())));

drop policy if exists usage_events_member_select on public.usage_events;
create policy usage_events_member_select on public.usage_events for select to authenticated
  using (exists (select 1 from public.memberships m where m.organization_id = usage_events.organization_id and m.user_id = (select auth.uid())));
