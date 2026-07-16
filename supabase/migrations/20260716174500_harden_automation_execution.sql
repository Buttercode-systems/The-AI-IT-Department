alter table public.automations add column if not exists conversation_id uuid references public.conversations(id) on delete set null;
alter table public.automations add column if not exists schedule_config jsonb not null default '{}'::jsonb;
alter table public.automations add column if not exists approval_mode text not null default 'always_ask';
alter table public.automations add column if not exists last_error_code text;
alter table public.automations add column if not exists consecutive_failures integer not null default 0;
alter table public.automations drop constraint if exists automations_approval_mode_check;
alter table public.automations add constraint automations_approval_mode_check check (approval_mode in ('always_ask','read_only_only'));
create index if not exists automations_conversation_idx on public.automations(conversation_id) where conversation_id is not null;

alter table public.automation_runs add column if not exists scheduled_for timestamptz;
alter table public.automation_runs add column if not exists correlation_id uuid not null default gen_random_uuid();
alter table public.automation_runs add column if not exists duration_ms integer;
create unique index if not exists automation_runs_scheduled_once_idx on public.automation_runs(automation_id, scheduled_for) where scheduled_for is not null;
create unique index if not exists automation_runs_correlation_idx on public.automation_runs(correlation_id);
