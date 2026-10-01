-- Tickets do SEK/Zendesk sincronizados pelo worker (VM bnlsrvvsesi) -- ver
-- handoff completo em memória do projeto. Campos "achatados" são os que
-- fazem sentido filtrar/ordenar na lista (Assunto/ID/status/datas) e pra
-- correlação manual com a offense do QRadar (ofensa_numero, extraído do
-- assunto/descrição, ex.: "[SEK...] Bernoulli - Low - 1329" -> "1329").
-- O resto do alerta (categorização, indicadores técnicos agrupados,
-- recomendações por fase) é naturalmente aninhado -- vira parsed_alert
-- jsonb em vez de dezenas de colunas soltas.
CREATE TABLE public.sek_tickets (
  id bigint PRIMARY KEY,
  subject text NOT NULL,
  status text NOT NULL,
  priority text,
  type text,
  description text,
  ofensa_numero text,
  assignee_id bigint,
  requester_id bigint,
  custom_status_id bigint,
  can_comment boolean,
  can_be_solved_by_me boolean,
  zendesk_created_at timestamptz,
  zendesk_updated_at timestamptz,
  parsed_alert jsonb,
  raw_payload jsonb NOT NULL,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sek_tickets_ofensa_numero_idx ON public.sek_tickets (ofensa_numero);
CREATE INDEX sek_tickets_status_idx ON public.sek_tickets (status);
CREATE INDEX sek_tickets_zendesk_updated_at_idx ON public.sek_tickets (zendesk_updated_at DESC);

GRANT SELECT ON public.sek_tickets TO authenticated;
GRANT ALL ON public.sek_tickets TO service_role;

ALTER TABLE public.sek_tickets ENABLE ROW LEVEL SECURITY;

-- Leitura pra quem já enxerga o SOC (mesmo público de qradar_offenses) --
-- reaproveita has_role, sem view/permissão granular nova pra essa primeira
-- versão. Escrita é sempre via hook (service_role), nunca client direto.
CREATE POLICY "authenticated can read sek tickets" ON public.sek_tickets
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service role writes sek tickets" ON public.sek_tickets
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Upsert em lote, mesmo padrão de upsert_shadowit_finding -- o hook manda
-- um array de linhas por chamada em vez de 1 insert por ticket.
CREATE OR REPLACE FUNCTION public.upsert_sek_tickets(p_rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.sek_tickets (
    id, subject, status, priority, type, description, ofensa_numero,
    assignee_id, requester_id, custom_status_id, can_comment, can_be_solved_by_me,
    zendesk_created_at, zendesk_updated_at, parsed_alert, raw_payload, synced_at
  )
  SELECT
    (r->>'id')::bigint,
    r->>'subject',
    r->>'status',
    r->>'priority',
    r->>'type',
    r->>'description',
    r->>'ofensa_numero',
    NULLIF(r->>'assignee_id', '')::bigint,
    NULLIF(r->>'requester_id', '')::bigint,
    NULLIF(r->>'custom_status_id', '')::bigint,
    (r->>'can_comment')::boolean,
    (r->>'can_be_solved_by_me')::boolean,
    NULLIF(r->>'zendesk_created_at', '')::timestamptz,
    NULLIF(r->>'zendesk_updated_at', '')::timestamptz,
    r->'parsed_alert',
    r->'raw_payload',
    now()
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT (id) DO UPDATE SET
    subject = EXCLUDED.subject,
    status = EXCLUDED.status,
    priority = EXCLUDED.priority,
    type = EXCLUDED.type,
    description = EXCLUDED.description,
    ofensa_numero = EXCLUDED.ofensa_numero,
    assignee_id = EXCLUDED.assignee_id,
    requester_id = EXCLUDED.requester_id,
    custom_status_id = EXCLUDED.custom_status_id,
    can_comment = EXCLUDED.can_comment,
    can_be_solved_by_me = EXCLUDED.can_be_solved_by_me,
    zendesk_created_at = EXCLUDED.zendesk_created_at,
    zendesk_updated_at = EXCLUDED.zendesk_updated_at,
    parsed_alert = EXCLUDED.parsed_alert,
    raw_payload = EXCLUDED.raw_payload,
    synced_at = now();
END;
$function$;
