alter table public.workspace_memories add column if not exists is_active boolean not null default true;
alter table public.workspace_memories add column if not exists last_used_at timestamptz;
create index if not exists workspace_memories_active_idx on public.workspace_memories(organization_id, is_active, updated_at desc);
