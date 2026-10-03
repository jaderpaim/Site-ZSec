-- Treinamentos (fase 1): plataforma interna que substitui a LearningFlix.
--
-- Modelo:
--   treinamentos               catálogo (um vídeo por treinamento; upload no Storage ou link externo)
--   treinamento_atribuicoes    quem precisa fazer qual treinamento, prazo, progresso e conclusão
--   treinamento_acessos        registro de cada acesso do colaborador (evidência de auditoria)
--
-- O colaborador NÃO tem conta no Z-Sec: ele entra pela página pública /treinamentos com o
-- login Microsoft do tenant (fluxo separado do login do painel). Por isso as telas do
-- colaborador falam só com o servidor (service role); o RLS abaixo cobre o lado da gestão.

-- ── Catálogo ──────────────────────────────────────────────────────────────────
CREATE TABLE public.treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  tipo text NOT NULL DEFAULT 'Conscientização'
    CHECK (tipo IN ('Política', 'Phishing', 'Conscientização')),
  status text NOT NULL DEFAULT 'Rascunho' CHECK (status IN ('Rascunho', 'Publicado', 'Arquivado')),
  -- Vídeo: OU arquivo no bucket "treinamentos" OU link externo (YouTube/Vimeo/Stream)
  video_path text,
  video_url text,
  duracao_seg integer CHECK (duracao_seg IS NULL OR duracao_seg > 0),
  exigir_pct_assistido integer NOT NULL DEFAULT 90 CHECK (exigir_pct_assistido BETWEEN 0 AND 100),
  bloquear_avanco boolean NOT NULL DEFAULT true,
  exigir_ciencia boolean NOT NULL DEFAULT true,
  prazo_padrao_dias integer NOT NULL DEFAULT 30 CHECK (prazo_padrao_dias > 0),
  -- Treinamento de ciência de uma política: alimenta a adesão em Políticas
  policy_id uuid REFERENCES public.policies(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treinamentos_video_unico CHECK (video_path IS NULL OR video_url IS NULL)
);
CREATE INDEX idx_treinamentos_policy ON public.treinamentos(policy_id) WHERE policy_id IS NOT NULL;

-- ── Atribuições ───────────────────────────────────────────────────────────────
CREATE TABLE public.treinamento_atribuicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  treinamento_id uuid NOT NULL REFERENCES public.treinamentos(id) ON DELETE CASCADE,
  colaborador_id uuid NOT NULL REFERENCES public.colaboradores(id) ON DELETE CASCADE,
  -- Origem: 'manual' na fase 1; 'phishing' e 'politica' chegam com a automação (fase 2)
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual', 'phishing', 'politica')),
  origem_ref text,
  prazo date,
  status text NOT NULL DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Em andamento', 'Concluído')),
  pct_assistido integer NOT NULL DEFAULT 0 CHECK (pct_assistido BETWEEN 0 AND 100),
  iniciado_em timestamptz,
  concluido_em timestamptz,
  convite_enviado_em timestamptz,
  ultimo_lembrete_em timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT treinamento_atribuicoes_unica UNIQUE (treinamento_id, colaborador_id)
);
CREATE INDEX idx_trein_atrib_colab ON public.treinamento_atribuicoes(colaborador_id);
CREATE INDEX idx_trein_atrib_status ON public.treinamento_atribuicoes(status);

-- Vínculo estável com a conta Microsoft (gravado no primeiro acesso via SSO)
ALTER TABLE public.colaboradores ADD COLUMN IF NOT EXISTS entra_oid text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_colaboradores_entra_oid ON public.colaboradores(entra_oid) WHERE entra_oid IS NOT NULL;

-- ── Registro de acessos do colaborador ────────────────────────────────────────
CREATE TABLE public.treinamento_acessos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES public.colaboradores(id) ON DELETE SET NULL,
  email text,
  evento text NOT NULL, -- 'login', 'login_negado', 'abriu', 'concluiu'
  treinamento_id uuid REFERENCES public.treinamentos(id) ON DELETE SET NULL,
  detalhe text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_trein_acessos_created ON public.treinamento_acessos(created_at DESC);

-- ── Acesso (gestão) ───────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.treinamentos, public.treinamento_atribuicoes TO authenticated;
GRANT SELECT ON public.treinamento_acessos TO authenticated;
GRANT ALL ON public.treinamentos, public.treinamento_atribuicoes, public.treinamento_acessos TO service_role;

ALTER TABLE public.treinamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treinamento_atribuicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treinamento_acessos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['treinamentos', 'treinamento_atribuicoes'] LOOP
    EXECUTE format($p$
      CREATE POLICY "view %1$s by permission" ON public.%1$I FOR SELECT TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'treinamentos')
             OR has_module_permission(auth.uid(), 'treinamentos', 'view'))$p$, t);
    EXECUTE format($p$
      CREATE POLICY "insert %1$s by permission" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'treinamentos')
                  OR has_module_permission(auth.uid(), 'treinamentos', 'create'))$p$, t);
    EXECUTE format($p$
      CREATE POLICY "update %1$s by permission" ON public.%1$I FOR UPDATE TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'treinamentos')
             OR has_module_permission(auth.uid(), 'treinamentos', 'edit'))$p$, t);
    EXECUTE format($p$
      CREATE POLICY "delete %1$s by permission" ON public.%1$I FOR DELETE TO authenticated
      USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'treinamentos')
             OR has_module_permission(auth.uid(), 'treinamentos', 'delete'))$p$, t);
  END LOOP;
END $$;

CREATE POLICY "view treinamento_acessos by permission" ON public.treinamento_acessos FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'treinamentos')
         OR has_module_permission(auth.uid(), 'treinamentos', 'view'));

CREATE TRIGGER treinamentos_set_updated_at BEFORE UPDATE ON public.treinamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER treinamento_atribuicoes_set_updated_at BEFORE UPDATE ON public.treinamento_atribuicoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Storage privado para os vídeos ────────────────────────────────────────────
-- Sem políticas em storage.objects: upload e leitura só por URLs assinadas geradas
-- pelo servidor (service role), depois de checar a permissão de quem pede.
-- file_size_limit em bytes (2 GB); o limite global do Storage também precisa permitir.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('treinamentos', 'treinamentos', false, 2147483648, ARRAY['video/mp4', 'video/webm'])
ON CONFLICT (id) DO NOTHING;

-- ── Permissões do módulo ──────────────────────────────────────────────────────
INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('treinamentos', 'view',   'Visualizar', 1, 'Ver catálogo, atribuições e adesão'),
  ('treinamentos', 'create', 'Criar',      2, 'Criar treinamentos e atribuir a colaboradores'),
  ('treinamentos', 'edit',   'Editar',     3, 'Editar treinamentos e atribuições'),
  ('treinamentos', 'delete', 'Excluir',    4, 'Excluir treinamentos e atribuições')
ON CONFLICT DO NOTHING;

INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'treinamentos', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'treinamentos', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'treinamentos'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
