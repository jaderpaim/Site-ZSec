-- Cloudflare WAF — portado do b-security-suite (20261007100000, 20261008100000
-- e 20261019100000):
--   1) Adicionar domínio: conecta uma nova zona à conta Cloudflare (políticas
--      de IA + importação de DNS), pelo menu Ações.
--   2) Aba Overview: status/nameservers da zona e tráfego 24h/7d/30d, igual à
--      página Overview do painel da Cloudflare (com "verificar nameservers").
--   3) Retenção de cloudflare_firewall_events.

-- 1+2) Permissões ─────────────────────────────────────────────────────────────
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cloudflare-waf', 'manage_adicionar_dominio', 'Gerenciar — Adicionar Domínio',
   'Permite conectar um novo domínio (zona) à conta Cloudflare, com políticas de IA e importação de DNS. O token da integração precisa de "Zone: Edit" com escopo de conta.', 49),
  ('cloudflare-waf', 'manage_overview_zona', 'Aba Overview',
   'Permite ver a aba Overview: status, nameservers e tráfego da zona (24 h, 7 e 30 dias) e pedir a verificação dos nameservers.', 50)
ON CONFLICT DO NOTHING;

-- Backfill (mesmo do b-sec): admin e analista recebem as duas agora.
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cloudflare-waf'
  AND mp.action IN ('manage_adicionar_dominio', 'manage_overview_zona')
ON CONFLICT (user_id, module_slug, action) DO NOTHING;

-- 3) Retenção de cloudflare_firewall_events ──────────────────────────────────
-- 90 dias: é o máximo que as server functions de analytics aceitam
-- (cloudflare.functions.ts limita "days" a 90); as telas usam até 30. O b-sec
-- usa 60 por causa do Painel C-Level, que aqui não existe.
--
-- Apaga em lotes (ctid = ANY(...)) em vez de um DELETE único: o backlog inicial
-- num DELETE só seria uma transação gigante (statement_timeout, WAL inchado).
-- De hora em hora com lote de 100k, o backlog some em poucas execuções e depois
-- cada uma apaga só o que venceu. Sem VACUUM FULL (trava a tabela): o
-- autovacuum devolve o espaço para os próximos syncs.
CREATE OR REPLACE FUNCTION public.purge_cloudflare_firewall_events(
  p_retention_days integer DEFAULT 90,
  p_batch_size integer DEFAULT 100000
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.cloudflare_firewall_events
  WHERE ctid = ANY (ARRAY(
    SELECT ctid
    FROM public.cloudflare_firewall_events
    WHERE datetime < now() - make_interval(days => p_retention_days)
    LIMIT p_batch_size
  ));
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Só o cron (postgres) chama; sem isso ficaria exposta via RPC do PostgREST.
REVOKE ALL ON FUNCTION public.purge_cloudflare_firewall_events(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_cloudflare_firewall_events(integer, integer) FROM anon, authenticated;

-- Job SQL direto no pg_cron (não chama hook nem APP_URL).
DO $$
BEGIN
  PERFORM cron.unschedule('cloudflare-firewall-events-retention');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cloudflare-firewall-events-retention',
  '17 * * * *',
  $$SELECT public.purge_cloudflare_firewall_events(90, 100000)$$
);
