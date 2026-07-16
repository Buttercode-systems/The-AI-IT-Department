create index if not exists agent_approvals_user_idx on public.agent_approvals(user_id);
create index if not exists agent_runs_organization_idx on public.agent_runs(organization_id);
create index if not exists agent_runs_user_idx on public.agent_runs(user_id);
create index if not exists conversation_messages_organization_idx on public.conversation_messages(organization_id);
create index if not exists conversation_messages_user_idx on public.conversation_messages(user_id);
create index if not exists conversations_user_idx on public.conversations(user_id);
create index if not exists setup_runs_user_idx on public.setup_runs(user_id);
