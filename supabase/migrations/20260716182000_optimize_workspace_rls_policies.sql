drop policy if exists "members can read business profiles" on public.business_profiles;
drop policy if exists "owners and admins can update business profiles" on public.business_profiles;

create policy "members can read business profiles"
on public.business_profiles
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "owners and admins can insert business profiles"
on public.business_profiles
for insert
to authenticated
with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = business_profiles.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
);

create policy "owners and admins can update business profiles"
on public.business_profiles
for update
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = business_profiles.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
)
with check (
  exists (
    select 1 from public.memberships m
    where m.organization_id = business_profiles.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
);

create policy "owners and admins can delete business profiles"
on public.business_profiles
for delete
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = business_profiles.organization_id
      and m.user_id = (select auth.uid())
      and m.role in ('owner', 'admin')
  )
);

drop policy if exists "users can read their provider connections" on public.provider_connections;
create policy "users can read their provider connections"
on public.provider_connections
for select
to authenticated
using (public.is_org_member(organization_id) and user_id = (select auth.uid()));

drop policy if exists "users can read their setup runs" on public.setup_runs;
create policy "users can read their setup runs"
on public.setup_runs
for select
to authenticated
using (public.is_org_member(organization_id) and user_id = (select auth.uid()));

drop policy if exists "members can read connection tests" on public.connection_tests;
create policy "members can read connection tests"
on public.connection_tests
for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = connection_tests.organization_id
      and m.user_id = (select auth.uid())
  )
);

drop policy if exists "members can read capabilities" on public.capabilities;
create policy "members can read capabilities"
on public.capabilities
for select
to authenticated
using (
  exists (
    select 1 from public.memberships m
    where m.organization_id = capabilities.organization_id
      and m.user_id = (select auth.uid())
  )
);
