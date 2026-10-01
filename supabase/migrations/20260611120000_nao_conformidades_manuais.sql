
CREATE TABLE public.nao_conformidades_manuais (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  plataforma text NOT NULL,
  fora_compliance text NOT NULL,
  prazo_resolucao date,
  observacoes text,
  aceite_risco text,
  evidencias text,
  impactos text,
  data_configuracao date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nao_conformidades_manuais TO authenticated;
GRANT ALL ON public.nao_conformidades_manuais TO service_role;

ALTER TABLE public.nao_conformidades_manuais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR SELECT TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nao-conformidade') OR public.has_module_permission(auth.uid(), 'nao-conformidade', 'view'));

CREATE POLICY "Create nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR INSERT TO authenticated
  WITH CHECK (public.is_module_admin(auth.uid(), 'nao-conformidade') OR public.has_module_permission(auth.uid(), 'nao-conformidade', 'create'));

CREATE POLICY "Edit nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR UPDATE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nao-conformidade') OR public.has_module_permission(auth.uid(), 'nao-conformidade', 'edit'))
  WITH CHECK (public.is_module_admin(auth.uid(), 'nao-conformidade') OR public.has_module_permission(auth.uid(), 'nao-conformidade', 'edit'));

CREATE POLICY "Delete nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR DELETE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nao-conformidade') OR public.has_module_permission(auth.uid(), 'nao-conformidade', 'delete'));

CREATE TRIGGER trg_nao_conformidades_manuais_updated_at
  BEFORE UPDATE ON public.nao_conformidades_manuais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_nao_conformidades_manuais_created_at ON public.nao_conformidades_manuais(created_at DESC);

INSERT INTO public.module_permissions (module_slug, action, label) VALUES
  ('nao-conformidade', 'create', 'Criar'),
  ('nao-conformidade', 'edit', 'Editar'),
  ('nao-conformidade', 'delete', 'Excluir')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'nao-conformidade'
ON CONFLICT DO NOTHING;
