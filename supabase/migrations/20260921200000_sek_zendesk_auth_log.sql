-- Log de renovação de sessão do worker SEK/Zendesk (ver handoff completo em
-- memória do projeto: captura local via Playwright + JWT curto assinado com
-- SEK_RENEWAL_SECRET + upload autenticado por Cloudflare Access até a VM
-- bnlsrvvsesi). Cada linha é um evento reportado pelo worker via hook
-- (sek-zendesk-auth-log.ts), nunca escrito diretamente pelo client -- e nunca
-- guarda o JWT nem o storage_state, só metadado do evento.
CREATE TABLE public.sek_zendesk_auth_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  triggered_by uuid,
  triggered_by_name text,
  reported_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sek_zendesk_auth_log TO authenticated;
GRANT ALL ON public.sek_zendesk_auth_log TO service_role;

ALTER TABLE public.sek_zendesk_auth_log ENABLE ROW LEVEL SECURITY;

-- Só leitura pra admin -- escrita é sempre via hook (supabaseAdmin, service_role),
-- nunca pelo client autenticado, mesmo sendo admin.
CREATE POLICY "admins can read sek zendesk auth log" ON public.sek_zendesk_auth_log
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "service role writes sek zendesk auth log" ON public.sek_zendesk_auth_log
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
