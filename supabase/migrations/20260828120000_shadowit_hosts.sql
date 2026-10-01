-- Shadow IT (módulo novo, separado do DAST): hosts internos achados pelo
-- ping sweep do DAST (network_discovery) que NÃO resolveram hostname em DNS
-- interno -- dispositivo sem registro conhecido, por definição não é
-- candidato a scan de aplicação (não dá pra saber se tem um app atrás),
-- então não entra em dast_recon_subdomains. Critério acordado: nome DNS
-- resolvido = ativo de aplicação (fica no DAST); só IP = Shadow IT.
--
-- É o próprio ping sweep que já existe no scanner que decide o destino da
-- linha (run_network_discovery() vai separar em dois grupos no callback) --
-- não roda uma varredura de rede segunda vez só pra isso.
--
-- Acesso: reaproveita is_dast_allowed() -- mesmo time (Segurança da
-- Informação) audita os dois módulos hoje. Se precisar de grupo de acesso
-- próprio no futuro, é só trocar a função usada nas policies abaixo.

CREATE TABLE public.shadowit_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip text NOT NULL,
  ip_norm text GENERATED ALWAYS AS (lower(trim(ip))) STORED,
  mac text,
  source text NOT NULL DEFAULT 'nmap',
  scan_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT shadowit_hosts_ip_unique UNIQUE (ip_norm)
);

GRANT SELECT ON public.shadowit_hosts TO authenticated;
GRANT ALL ON public.shadowit_hosts TO service_role;

ALTER TABLE public.shadowit_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dast team read shadowit hosts" ON public.shadowit_hosts
  FOR SELECT TO authenticated
  USING (public.is_dast_allowed(auth.uid()));

CREATE POLICY "service role write shadowit hosts" ON public.shadowit_hosts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Upsert em lote a partir do callback do scanner -- host revisto na próxima
-- varredura atualiza last_seen_at em vez de duplicar linha.
CREATE OR REPLACE FUNCTION public.upsert_shadowit_hosts(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (lower(trim(coalesce(elem ->> 'ip', ''))))
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
  )
  INSERT INTO public.shadowit_hosts (ip, mac, source, scan_id, first_seen_at, last_seen_at)
  SELECT
    row_data ->> 'ip',
    NULLIF(row_data ->> 'mac', ''),
    coalesce(row_data ->> 'source', 'nmap'),
    (row_data ->> 'scan_id')::uuid,
    now(),
    now()
  FROM incoming
  WHERE coalesce(row_data ->> 'ip', '') <> ''
  ON CONFLICT ON CONSTRAINT shadowit_hosts_ip_unique
  DO UPDATE SET
    mac          = coalesce(EXCLUDED.mac, shadowit_hosts.mac),
    source       = EXCLUDED.source,
    scan_id      = EXCLUDED.scan_id,
    last_seen_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shadowit_hosts(jsonb) TO service_role;
