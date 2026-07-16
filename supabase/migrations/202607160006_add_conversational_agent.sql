alter table public.business_profiles
  add column if not exists business_type text,
  add column if not exists user_role text,
  add column if not exists timezone text not null default 'Africa/Johannesburg',
  add column if not exists communication_style text,
  add column if not exists operating_context jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_completed_at timestamptz;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  role text not null check (role in ('user','assistant','tool','system')),
  content text not null default '',
  tool_name text,
  tool_call_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'running' check (status in ('running','completed','failed','cancelled')),
  model text not null,
  request_text text not null,
  response_text text,
  tool_calls jsonb not null default '[]'::jsonb,
  error_code text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists conversations_org_user_updated_idx on public.conversations(organization_id,user_id,updated_at desc);
create index if not exists conversation_messages_conversation_created_idx on public.conversation_messages(conversation_id,created_at);
create index if not exists agent_runs_conversation_started_idx on public.agent_runs(conversation_id,started_at desc);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;
alter table public.agent_runs enable row level security;

create policy conversations_member_access on public.conversations
for all to authenticated
using (exists (select 1 from public.memberships m where m.organization_id = conversations.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.memberships m where m.organization_id = conversations.organization_id and m.user_id = (select auth.uid())));

create policy conversation_messages_member_access on public.conversation_messages
for all to authenticated
using (exists (select 1 from public.memberships m where m.organization_id = conversation_messages.organization_id and m.user_id = (select auth.uid())))
with check (exists (select 1 from public.memberships m where m.organization_id = conversation_messages.organization_id and m.user_id = (select auth.uid())));

create policy agent_runs_member_access on public.agent_runs
for select to authenticated
using (exists (select 1 from public.memberships m where m.organization_id = agent_runs.organization_id and m.user_id = (select auth.uid())));

revoke all on table public.agent_runs from anon, authenticated;
grant select on table public.agent_runs to authenticated;
