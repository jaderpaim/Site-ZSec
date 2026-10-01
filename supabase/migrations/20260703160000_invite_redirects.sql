-- Tabela de proxy para links de convite.
-- Oculta a URL do Supabase do email enviado ao usuário.
-- Somente service_role tem acesso — nenhuma policy para authenticated/anon.

CREATE TABLE public.invite_redirects (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  target_url  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at     timestamptz
);

ALTER TABLE public.invite_redirects ENABLE ROW LEVEL SECURITY;

-- service_role bypass RLS nativamente; nenhuma policy necessária para outros papéis.
-- Limpeza automática de tokens expirados (roda diariamente às 03h).
SELECT cron.schedule(
  'invite-redirects-cleanup',
  '0 3 * * *',
  $$DELETE FROM public.invite_redirects WHERE expires_at < now() - interval '1 day'$$
);
