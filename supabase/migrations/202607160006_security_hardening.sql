create index if not exists memberships_user_idx on public.memberships (user_id);
create index if not exists provider_connections_user_idx on public.provider_connections (user_id);
create index if not exists setup_runs_user_idx on public.setup_runs (user_id);
create index if not exists audit_events_actor_idx on public.audit_events (actor_user_id);
create index if not exists oauth_states_org_idx on public.oauth_states (organization_id);
create index if not exists oauth_states_user_idx on public.oauth_states (user_id);
create index if not exists connection_tests_org_idx on public.connection_tests (organization_id);
create index if not exists connection_tests_user_idx on public.connection_tests (user_id);
create index if not exists capabilities_user_idx on public.capabilities (user_id);

revoke all on public.oauth_states from anon, authenticated;
revoke execute on function public.get_or_create_workspace(text) from public, anon;
grant execute on function public.get_or_create_workspace(text) to authenticated;

alter function public.get_or_create_workspace(text) set search_path = public, pg_temp;

create or replace function public.delete_my_workspace()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  owned_org uuid;
begin
  if current_user_id is null then raise exception 'Authentication required'; end if;
  select organization_id into owned_org from public.memberships
    where user_id = current_user_id and role = 'owner'
    order by created_at limit 1;
  if owned_org is null then raise exception 'Owner workspace not found'; end if;
  delete from public.organizations where id = owned_org;
end;
$$;
revoke execute on function public.delete_my_workspace() from public, anon;
grant execute on function public.delete_my_workspace() to authenticated;
