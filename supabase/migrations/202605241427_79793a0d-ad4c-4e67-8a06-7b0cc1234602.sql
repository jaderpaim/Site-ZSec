-- ─── audit_logs ───────────────────────────────────────────────────────────────
-- Drop e recria limpo caso já exista com estrutura diferente.
-- Rode no SQL Editor do Supabase.

drop table if exists public.audit_logs cascade;

create table public.audit_logs (
  id           uuid        primary key default gen_random_uuid(),
  action       text        not null,
  status       text        not null,
  zone_id      text,
  zone_name    text,
  details      jsonb,
  message      text,
  user_email   text,
  duration_ms  integer,
  created_at   timestamptz not null default now()
);

create index audit_logs_action_idx     on public.audit_logs (action);
create index audit_logs_status_idx     on public.audit_logs (status);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_insert" on public.audit_logs
  for insert to authenticated with check (true);

create policy "audit_select" on public.audit_logs
  for select to authenticated using (true);