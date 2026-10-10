-- Reconstrução: tabelas que existiam no banco de origem mas nunca foram
-- criadas por migration (foram criadas direto no banco). Sem isto, um banco
-- novo falha na migration seguinte (20260601162323), que liga o RLS e cria as
-- policies destas tabelas.
--
-- Colunas e tipos deduzidos de src/integrations/supabase/types.ts; chaves
-- únicas, dos upserts do código (onConflict). Valores padrão inferidos (o
-- types.ts só diz QUE a coluna tem default, não qual).
-- IF NOT EXISTS: num banco que já tem as tabelas, nada muda.

-- Histórico de eventos da GMUD (gmud.functions.ts, tela Logs).
-- gmud_id fica NULL se a GMUD for excluída: o log de exclusão continua valendo.
CREATE TABLE IF NOT EXISTS public.gmud_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmud_id       uuid REFERENCES public.gmuds(id) ON DELETE SET NULL,
  gmud_titulo   text,
  tipo_evento   text NOT NULL,
  status        text NOT NULL,
  descricao     text NOT NULL,
  detalhes      jsonb,
  usuario_email text,
  usuario_nome  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gmud_logs_created_at ON public.gmud_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gmud_logs_gmud_id ON public.gmud_logs (gmud_id);

-- Histórico de eventos de vulnerabilidades (VulnerabilidadesReal.tsx, tela Logs).
-- vuln_id sem FK: a migration 20260602140112 remove a FK original, e os ids
-- vêm de mais de uma tabela de vulnerabilidades.
CREATE TABLE IF NOT EXISTS public.vuln_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vuln_id       text,
  fqdn          text,
  tipo_evento   text NOT NULL,
  status        text NOT NULL,
  descricao     text NOT NULL,
  detalhes      jsonb,
  usuario_email text,
  usuario_nome  text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vuln_logs_created_at ON public.vuln_logs (created_at DESC);

-- Amostras do QRadar gravadas pelo sync (qradar.server.ts, upsert por amostra).
CREATE TABLE IF NOT EXISTS public.qradar_external_offenders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ip   text NOT NULL,
  event_count bigint,
  sampled_at  timestamptz NOT NULL,
  CONSTRAINT qradar_external_offenders_ip_sample_key UNIQUE (source_ip, sampled_at)
);

CREATE TABLE IF NOT EXISTS public.qradar_internal_offenders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_ip   text NOT NULL,
  event_count bigint,
  sampled_at  timestamptz NOT NULL,
  CONSTRAINT qradar_internal_offenders_ip_sample_key UNIQUE (source_ip, sampled_at)
);

CREATE TABLE IF NOT EXISTS public.qradar_o365_deletions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username    text NOT NULL,
  qid         bigint,
  source_ip   text,
  event_count bigint,
  event_time  timestamptz,
  sampled_at  timestamptz NOT NULL,
  CONSTRAINT qradar_o365_deletions_user_qid_sample_key UNIQUE (username, qid, sampled_at)
);

CREATE TABLE IF NOT EXISTS public.qradar_o365_downloads (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username    text NOT NULL,
  qid         bigint,
  source_ip   text,
  event_count bigint,
  event_time  timestamptz,
  sampled_at  timestamptz NOT NULL,
  CONSTRAINT qradar_o365_downloads_user_qid_sample_key UNIQUE (username, qid, sampled_at)
);

CREATE INDEX IF NOT EXISTS idx_qradar_external_offenders_sampled ON public.qradar_external_offenders (sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_qradar_internal_offenders_sampled ON public.qradar_internal_offenders (sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_qradar_o365_deletions_sampled ON public.qradar_o365_deletions (sampled_at DESC);
CREATE INDEX IF NOT EXISTS idx_qradar_o365_downloads_sampled ON public.qradar_o365_downloads (sampled_at DESC);

-- RLS e policies vêm na migration seguinte (20260601162323).
