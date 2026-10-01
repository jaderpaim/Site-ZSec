
CREATE TABLE public.indisponibilidades (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ativo_id uuid NOT NULL REFERENCES public.cmdb_ativos(id) ON DELETE CASCADE,
  inicio timestamptz NOT NULL,
  fim timestamptz,
  duracao_min integer GENERATED ALWAYS AS (
    CASE WHEN fim IS NULL THEN NULL
         ELSE GREATEST(0, (EXTRACT(EPOCH FROM (fim - inicio))/60)::int)
    END
  ) STORED,
  motivo text,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.indisponibilidades TO authenticated;
GRANT ALL ON public.indisponibilidades TO service_role;

ALTER TABLE public.indisponibilidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View indisponibilidades" ON public.indisponibilidades
  FOR SELECT TO authenticated
  USING (public.is_module_admin(auth.uid(), 'disponibilidade') OR public.has_module_permission(auth.uid(), 'disponibilidade', 'view'));

CREATE POLICY "Create indisponibilidades" ON public.indisponibilidades
  FOR INSERT TO authenticated
  WITH CHECK (public.is_module_admin(auth.uid(), 'disponibilidade') OR public.has_module_permission(auth.uid(), 'disponibilidade', 'create'));

CREATE POLICY "Edit indisponibilidades" ON public.indisponibilidades
  FOR UPDATE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'disponibilidade') OR public.has_module_permission(auth.uid(), 'disponibilidade', 'edit'))
  WITH CHECK (public.is_module_admin(auth.uid(), 'disponibilidade') OR public.has_module_permission(auth.uid(), 'disponibilidade', 'edit'));

CREATE POLICY "Delete indisponibilidades" ON public.indisponibilidades
  FOR DELETE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'disponibilidade') OR public.has_module_permission(auth.uid(), 'disponibilidade', 'delete'));

CREATE TRIGGER trg_indisponibilidades_updated_at
  BEFORE UPDATE ON public.indisponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_indisponibilidades_inicio ON public.indisponibilidades(inicio DESC);
CREATE INDEX idx_indisponibilidades_ativo ON public.indisponibilidades(ativo_id);

INSERT INTO public.module_permissions (module_slug, action, label) VALUES
  ('disponibilidade', 'view', 'Visualizar'),
  ('disponibilidade', 'create', 'Criar'),
  ('disponibilidade', 'edit', 'Editar'),
  ('disponibilidade', 'delete', 'Excluir')
ON CONFLICT DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'disponibilidade'
ON CONFLICT DO NOTHING;

INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'disponibilidade', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT DO NOTHING;
