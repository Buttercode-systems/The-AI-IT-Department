create table if not exists public.briefings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'ready' check (status in ('generating','ready','failed')),
  summary text not null default '',
  source_counts jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists briefings_org_generated_idx on public.briefings (organization_id, generated_at desc);
create index if not exists briefings_user_idx on public.briefings (user_id);

create table if not exists public.briefing_items (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.briefings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  item_type text not null check (item_type in ('email','calendar','action')),
  priority text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  title text not null,
  summary text not null default '',
  reason text not null default '',
  source_label text,
  source_url text,
  source_id text,
  due_at timestamptz,
  state text not null default 'open' check (state in ('open','done','dismissed','snoozed')),
  snoozed_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists briefing_items_briefing_idx on public.briefing_items (briefing_id, priority, created_at);
create index if not exists briefing_items_org_state_idx on public.briefing_items (organization_id, state, created_at desc);

alter table public.briefings enable row level security;
alter table public.briefing_items enable row level security;

create policy "members can read briefings" on public.briefings for select to authenticated using (
  exists (select 1 from public.memberships m where m.organization_id = briefings.organization_id and m.user_id = (select auth.uid()))
);
create policy "members can read briefing items" on public.briefing_items for select to authenticated using (
  exists (select 1 from public.memberships m where m.organization_id = briefing_items.organization_id and m.user_id = (select auth.uid()))
);

revoke all on public.briefings, public.briefing_items from anon;
grant select on public.briefings, public.briefing_items to authenticated;
