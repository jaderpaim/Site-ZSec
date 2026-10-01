-- Retrato mensal de vulnerabilidades de infra — resolve a divergência entre o "Evolução
-- Mensal" do dashboard e o gráfico de referência do Sek. Desde que vulnerabilities_infra
-- passou a guardar só 1 linha por achado (estado atual), perdemos a capacidade de
-- reconstruir "o que era verdade especificamente no mês X" depois que o estado muda — cada
-- vez que algo fecha/reabre, os meses passados do gráfico "cicatrizam" e deixam de bater com
-- a foto congelada que o Sek mostra pra aquele mês.
--
-- Esta tabela resolve isso guardando só os TOTAIS agregados de cada import, direto dos
-- dados brutos do arquivo (raw["Situação"]), ANTES de qualquer merge/upsert — uma foto
-- congelada de verdade, que nunca muda depois. Cresce no máximo 1 linha por mês, pra
-- sempre — não reintroduz o problema de milhares de linhas por achado que motivou o upsert.
--
-- new_count/maintained_count/fix_count = contagem bruta de raw["Situação"] daquele import
-- especificamente (New/Maintained/Fix), não uma reconstrução a partir do estado atual.

CREATE TABLE public.vuln_infra_monthly_snapshot (
  month text PRIMARY KEY, -- 'YYYY-MM'
  new_count integer NOT NULL DEFAULT 0,
  maintained_count integer NOT NULL DEFAULT 0,
  fix_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vuln_infra_monthly_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view vuln infra monthly snapshot by permission" ON public.vuln_infra_monthly_snapshot
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
    OR auth.uid() IN (SELECT user_id FROM public.module_admins WHERE module_slug = 'vulnerabilidades')
    OR auth.uid() IN (
      SELECT user_id FROM public.user_module_permissions
      WHERE module_slug = 'vulnerabilidades' AND action = 'view'
    )
  );

CREATE POLICY "upsert vuln infra monthly snapshot by permission" ON public.vuln_infra_monthly_snapshot
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
    OR auth.uid() IN (SELECT user_id FROM public.module_admins WHERE module_slug = 'vulnerabilidades')
    OR auth.uid() IN (
      SELECT user_id FROM public.user_module_permissions
      WHERE module_slug = 'vulnerabilidades' AND action = 'create'
    )
  );

CREATE POLICY "update vuln infra monthly snapshot by permission" ON public.vuln_infra_monthly_snapshot
  FOR UPDATE TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
    OR auth.uid() IN (SELECT user_id FROM public.module_admins WHERE module_slug = 'vulnerabilidades')
    OR auth.uid() IN (
      SELECT user_id FROM public.user_module_permissions
      WHERE module_slug = 'vulnerabilidades' AND action = 'create'
    )
  )
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
    OR auth.uid() IN (SELECT user_id FROM public.module_admins WHERE module_slug = 'vulnerabilidades')
    OR auth.uid() IN (
      SELECT user_id FROM public.user_module_permissions
      WHERE module_slug = 'vulnerabilidades' AND action = 'create'
    )
  );

-- Backfill dos 9 meses já importados (out/2025–jul/2026) — números tirados direto do
-- gráfico de referência do Sek (New/Maintained) cruzados com a contagem real de
-- raw["Situação"]="Fix" dos arquivos originais, validados nesta conversa antes do banco
-- ter sido zerado e reimportado.
INSERT INTO public.vuln_infra_monthly_snapshot (month, new_count, maintained_count, fix_count) VALUES
  ('2025-10', 1826, 0,    0),
  ('2025-12', 48,   1584, 16),
  ('2026-01', 94,   1454, 3),
  ('2026-02', 37,   1589, 0),
  ('2026-03', 18,   1650, 9),
  ('2026-04', 177,  1581, 91),
  ('2026-05', 78,   1644, 27),
  ('2026-06', 16,   1649, 35),
  ('2026-07', 51,   1694, 36)
ON CONFLICT (month) DO NOTHING;
