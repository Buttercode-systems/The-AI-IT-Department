revoke execute on function public.get_or_create_workspace(text) from anon;
revoke execute on function public.is_org_member(uuid) from anon;
revoke execute on function public.is_org_member(uuid) from authenticated;
grant execute on function public.get_or_create_workspace(text) to authenticated;