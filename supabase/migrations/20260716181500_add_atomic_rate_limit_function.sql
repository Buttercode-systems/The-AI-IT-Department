create or replace function public.consume_rate_limit(
  p_organization_id uuid,
  p_user_id uuid,
  p_action text,
  p_limit integer,
  p_window_seconds integer
) returns table(allowed boolean, request_count integer, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket timestamptz;
  v_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'INVALID_RATE_LIMIT_CONFIG';
  end if;
  v_bucket := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limit_windows(organization_id,user_id,action,bucket_start,request_count,updated_at)
  values(p_organization_id,p_user_id,p_action,v_bucket,1,now())
  on conflict (organization_id,user_id,action,bucket_start)
  do update set request_count = public.rate_limit_windows.request_count + 1, updated_at = now()
  returning public.rate_limit_windows.request_count into v_count;
  return query select v_count <= p_limit, v_count, greatest(p_limit - v_count, 0), v_bucket + make_interval(secs => p_window_seconds);
end;
$$;
revoke all on function public.consume_rate_limit(uuid,uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.consume_rate_limit(uuid,uuid,text,integer,integer) to service_role;
