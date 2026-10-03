-- Organização SI: estrutura real do time de Segurança da Informação.
--
-- PENDENTE: a tela (OrganizacaoDashboard) ainda exibe dados fictícios fixos no
-- código. Esta migração só cria a base; falta ligar a interface a estas tabelas
-- (listagem, cadastro e os indicadores calculados a partir delas).
--
-- Modelo:
--   org_areas                    áreas/squads do time (ex.: SOC, GRC, AppSec)
--   org_membros                  pessoas de cada área (opcionalmente ligadas a um usuário do app)
--   org_funcoes_criticas         funções que precisam de titular e substituto
--   org_treinamentos             treinamentos/capacitações do time
--   org_treinamento_participantes  quem participa de cada treinamento

-- ── Áreas ─────────────────────────────────────────────────────────────────────
CREATE TABLE public.org_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  responsavel_membro_id uuid,
  ordem integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_areas_nome_unique UNIQUE (nome)
);

-- ── Pessoas ───────────────────────────────────────────────────────────────────
CREATE TABLE public.org_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id uuid NOT NULL REFERENCES public.org_areas(id) ON DELETE RESTRICT,
  -- Ligação opcional com o usuário do app (quando a pessoa tem login)
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  nome text NOT NULL,
  email text,
  cargo text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_org_membros_area ON public.org_membros(area_id);
CREATE UNIQUE INDEX idx_org_membros_user ON public.org_membros(user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.org_areas
  ADD CONSTRAINT org_areas_responsavel_fkey
  FOREIGN KEY (responsavel_membro_id) REFERENCES public.org_membros(id) ON DELETE SET NULL;

-- ── Funções críticas ──────────────────────────────────────────────────────────
-- "Coberta" = tem titular e substituto ativos e diferentes entre si.
CREATE TABLE public.org_funcoes_criticas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  area_id uuid REFERENCES public.org_areas(id) ON DELETE SET NULL,
  titular_id uuid REFERENCES public.org_membros(id) ON DELETE SET NULL,
  substituto_id uuid REFERENCES public.org_membros(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_funcoes_titular_substituto_diff CHECK (
    titular_id IS NULL OR substituto_id IS NULL OR titular_id <> substituto_id
  )
);

-- ── Treinamentos ──────────────────────────────────────────────────────────────
CREATE TABLE public.org_treinamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  provedor text,
  area_id uuid REFERENCES public.org_areas(id) ON DELETE SET NULL,
  inicio date,
  fim date,
  status text NOT NULL DEFAULT 'Planejado'
    CHECK (status IN ('Planejado', 'Em andamento', 'Concluído', 'Cancelado')),
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_treinamentos_periodo CHECK (inicio IS NULL OR fim IS NULL OR fim >= inicio)
);

CREATE TABLE public.org_treinamento_participantes (
  treinamento_id uuid NOT NULL REFERENCES public.org_treinamentos(id) ON DELETE CASCADE,
  membro_id uuid NOT NULL REFERENCES public.org_membros(id) ON DELETE CASCADE,
  concluido boolean NOT NULL DEFAULT false,
  concluido_em date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (treinamento_id, membro_id)
);

-- ── Permissões de acesso às tabelas ───────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.org_areas,
  public.org_membros,
  public.org_funcoes_criticas,
  public.org_treinamentos,
  public.org_treinamento_participantes
TO authenticated;
GRANT ALL ON
  public.org_areas,
  public.org_membros,
  public.org_funcoes_criticas,
  public.org_treinamentos,
  public.org_treinamento_participantes
TO service_role;

-- ── RLS: mesmas regras de módulo usadas em Comitês ────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org_areas',
    'org_membros',
    'org_funcoes_criticas',
    'org_treinamentos',
    'org_treinamento_participantes'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format($p$
      CREATE POLICY "view %1$s by permission" ON public.%1$I
        FOR SELECT TO authenticated
        USING (
          has_role(auth.uid(), 'admin'::app_role)
          OR is_module_admin(auth.uid(), 'organizacao')
          OR has_module_permission(auth.uid(), 'organizacao', 'view')
        )$p$, t);

    EXECUTE format($p$
      CREATE POLICY "insert %1$s by permission" ON public.%1$I
        FOR INSERT TO authenticated
        WITH CHECK (
          has_role(auth.uid(), 'admin'::app_role)
          OR is_module_admin(auth.uid(), 'organizacao')
          OR has_module_permission(auth.uid(), 'organizacao', 'create')
          OR has_module_permission(auth.uid(), 'organizacao', 'edit')
        )$p$, t);

    EXECUTE format($p$
      CREATE POLICY "update %1$s by permission" ON public.%1$I
        FOR UPDATE TO authenticated
        USING (
          has_role(auth.uid(), 'admin'::app_role)
          OR is_module_admin(auth.uid(), 'organizacao')
          OR has_module_permission(auth.uid(), 'organizacao', 'edit')
        )$p$, t);

    EXECUTE format($p$
      CREATE POLICY "delete %1$s by permission" ON public.%1$I
        FOR DELETE TO authenticated
        USING (
          has_role(auth.uid(), 'admin'::app_role)
          OR is_module_admin(auth.uid(), 'organizacao')
          OR has_module_permission(auth.uid(), 'organizacao', 'delete')
        )$p$, t);
  END LOOP;
END $$;

-- updated_at automático (a tabela de participantes não tem updated_at)
CREATE TRIGGER org_areas_set_updated_at
  BEFORE UPDATE ON public.org_areas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER org_membros_set_updated_at
  BEFORE UPDATE ON public.org_membros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER org_funcoes_criticas_set_updated_at
  BEFORE UPDATE ON public.org_funcoes_criticas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER org_treinamentos_set_updated_at
  BEFORE UPDATE ON public.org_treinamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Ações do módulo (hoje só existe "view") ───────────────────────────────────
INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('organizacao', 'create', 'Criar',   2, 'Cadastrar áreas, pessoas, funções críticas e treinamentos'),
  ('organizacao', 'edit',   'Editar',  3, 'Editar a estrutura do time de SI'),
  ('organizacao', 'delete', 'Excluir', 4, 'Excluir registros da estrutura do time de SI')
ON CONFLICT DO NOTHING;

-- Admins globais recebem as novas ações do módulo
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'organizacao', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'organizacao'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
