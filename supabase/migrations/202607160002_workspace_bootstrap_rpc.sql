create or replace function public.get_or_create_workspace(requested_name text default null)
returns table (
  organization_id uuid,
  organization_name text,
  stage text,
  profile_complete boolean,
  google_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  org_id uuid;
  org_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  select m.organization_id, o.name
    into org_id, org_name
  from public.memberships m
  join public.organizations o on o.id = m.organization_id
  where m.user_id = current_user_id
  order by m.created_at
  limit 1;

  if org_id is null then
    org_name := coalesce(nullif(trim(requested_name), ''), 'My Business Workspace');
    insert into public.organizations(name) values (org_name) returning id into org_id;
    insert into public.memberships(organization_id, user_id, role) values (org_id, current_user_id, 'owner');
    insert into public.business_profiles(organization_id) values (org_id);
    insert into public.setup_runs(organization_id, user_id, stage, recommended_connections)
      values (org_id, current_user_id, 'discovery', '["google"]'::jsonb);
  elsif requested_name is not null and char_length(trim(requested_name)) >= 2 then
    org_name := trim(requested_name);
    update public.organizations set name = org_name, updated_at = now() where id = org_id;
  end if;

  return query
  select
    org_id,
    o.name,
    coalesce(sr.stage, 'discovery'),
    (o.name <> 'My Business Workspace'),
    pc.status::text
  from public.organizations o
  left join lateral (
    select s.stage from public.setup_runs s
    where s.organization_id = org_id and s.user_id = current_user_id
    order by s.started_at desc limit 1
  ) sr on true
  left join lateral (
    select p.status from public.provider_connections p
    where p.organization_id = org_id and p.user_id = current_user_id and p.provider = 'google'
    order by p.created_at desc limit 1
  ) pc on true
  where o.id = org_id;
end;
$$;

revoke all on function public.get_or_create_workspace(text) from public;
grant execute on function public.get_or_create_workspace(text) to authenticated;