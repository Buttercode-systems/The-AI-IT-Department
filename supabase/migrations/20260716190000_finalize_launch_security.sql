-- Final launch hardening for service-controlled tables and obsolete RPC access.

revoke execute on function public.delete_my_workspace() from public, anon, authenticated;
grant execute on function public.delete_my_workspace() to service_role;

drop policy if exists "deny client oauth state access" on public.oauth_states;
create policy "deny client oauth state access"
on public.oauth_states
for all
to authenticated
using (false)
with check (false);

drop policy if exists "deny client rate limit access" on public.rate_limit_windows;
create policy "deny client rate limit access"
on public.rate_limit_windows
for all
to authenticated
using (false)
with check (false);
