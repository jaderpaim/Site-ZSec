
-- FUNÇÕES, TRIGGERS, SEEDS, PERMISSIONS, REALTIME

CREATE OR REPLACE FUNCTION public.calcular_score(_nista NUMERIC, _isoa NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _nista IS NULL AND _isoa IS NULL THEN NULL
    WHEN _nista IS NULL THEN _isoa
    WHEN _isoa  IS NULL THEN _nista
    ELSE ROUND(((_nista + _isoa) / 2.0)::numeric, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.calcular_delta_anterior(_seg uuid, _ordem int, _score numeric)
RETURNS NUMERIC LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN _score IS NULL THEN NULL
    ELSE _score - (
      SELECT score FROM public.maturidade
       WHERE segmento_id = _seg AND periodo_ordem < _ordem AND score IS NOT NULL
       ORDER BY periodo_ordem DESC LIMIT 1
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.recalcular_maturidade_segmento(_seg uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  base_score NUMERIC;
  prev_score NUMERIC;
  cur_score NUMERIC;
BEGIN
  DELETE FROM public.maturidade WHERE segmento_id = _seg;

  -- ordenação determinística por periodo_ordem, depois created_at
  base_score := NULL;
  prev_score := NULL;

  FOR r IN
    SELECT id, periodo, periodo_ordem, nota_nist, nota_iso, created_at
      FROM public.segmentos_notas
     WHERE segmento_id = _seg
     ORDER BY periodo_ordem ASC, created_at ASC
  LOOP
    cur_score := public.calcular_score(r.nota_nist, r.nota_iso);
    IF base_score IS NULL AND cur_score IS NOT NULL THEN
      base_score := cur_score;
    END IF;

    INSERT INTO public.maturidade
      (segmento_id, periodo, periodo_ordem, nota_nist, nota_iso, score, delta_anterior, delta_total, updated_at)
    VALUES (
      _seg, r.periodo, r.periodo_ordem, r.nota_nist, r.nota_iso, cur_score,
      CASE WHEN cur_score IS NULL OR prev_score IS NULL THEN NULL ELSE ROUND((cur_score - prev_score)::numeric, 2) END,
      CASE WHEN cur_score IS NULL OR base_score IS NULL OR base_score = 0 THEN NULL
           ELSE ROUND((((cur_score - base_score) / base_score) * 100)::numeric, 2) END,
      now()
    );

    IF cur_score IS NOT NULL THEN
      prev_score := cur_score;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalcular_maturidade_segmento(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_segmentos_notas_sync()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalcular_maturidade_segmento(OLD.segmento_id);
    RETURN OLD;
  ELSE
    PERFORM public.recalcular_maturidade_segmento(NEW.segmento_id);
    RETURN NEW;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.trg_segmentos_notas_sync() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_segmentos_notas_after_iud
AFTER INSERT OR UPDATE OR DELETE ON public.segmentos_notas
FOR EACH ROW EXECUTE FUNCTION public.trg_segmentos_notas_sync();

-- Permissões do módulo segmentos
INSERT INTO public.module_permissions (module_slug, action, label, sort_order) VALUES
  ('segmentos','view',  'Visualizar', 1),
  ('segmentos','create','Criar',      2),
  ('segmentos','edit',  'Editar',     3),
  ('segmentos','delete','Excluir',    4)
ON CONFLICT DO NOTHING;

-- Garante view para o módulo maturidade
INSERT INTO public.module_permissions (module_slug, action, label, sort_order) VALUES
  ('maturidade','view','Visualizar', 1)
ON CONFLICT DO NOTHING;

-- Concede todos os admins globais como module_admin de segmentos
INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'segmentos', ur.user_id
  FROM public.user_roles ur WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

-- SEEDS ---------------------------------------------------------------------

INSERT INTO public.segmentos (nome, is_bernoulli) VALUES
  ('Bernoulli', true),
  ('Educação', false),
  ('Governo', false),
  ('Seguros', false),
  ('Varejo', false),
  ('Saúde', false),
  ('Agro', false),
  ('Indústria', false),
  ('Serviços', false),
  ('Tecnologia', false),
  ('Telecom', false),
  ('Financeiro', false),
  ('Energia/Óleo/Gás', false),
  ('Mobilidade', false),
  ('Governos', false),
  ('Manufatura', false),
  ('Construção', false),
  ('Alimentos', false),
  ('Produtos', false),
  ('Energia', false),
  ('Softwares', false),
  ('Varejo/Atacado', false),
  ('Transporte', false)
ON CONFLICT (nome) DO NOTHING;

-- Notas do Bernoulli (5 períodos)
WITH s AS (SELECT id FROM public.segmentos WHERE nome='Bernoulli')
INSERT INTO public.segmentos_notas (segmento_id, periodo, periodo_ordem, nota_nist, nota_iso) VALUES
  ((SELECT id FROM s), 'Fev 2025', 1, 0.60, 0.25),
  ((SELECT id FROM s), 'Ago 2025', 2, 1.63, 0.97),
  ((SELECT id FROM s), 'Nov 2025', 3, 2.17, 1.62),
  ((SELECT id FROM s), 'Mar 2026', 4, 2.33, 1.75),
  ((SELECT id FROM s), 'Mai 2026', 5, 2.41, NULL)
ON CONFLICT DO NOTHING;

-- Notas atuais de cada segmento de mercado (período único "Atual")
INSERT INTO public.segmentos_notas (segmento_id, periodo, periodo_ordem, nota_nist, nota_iso)
SELECT s.id, 'Atual', 1, v.nist, v.iso FROM public.segmentos s
JOIN (VALUES
  ('Educação',         0.99, 1.24),
  ('Governo',          1.05, NULL),
  ('Seguros',          1.28, 1.73),
  ('Varejo',           1.30, NULL),
  ('Saúde',            1.34, 0.38),
  ('Agro',             1.40, NULL),
  ('Indústria',        1.41, NULL),
  ('Serviços',         1.55, 0.90),
  ('Tecnologia',       1.71, NULL),
  ('Telecom',          2.11, NULL),
  ('Financeiro',       2.46, NULL),
  ('Energia/Óleo/Gás', 2.47, NULL),
  ('Mobilidade',       2.74, NULL),
  ('Governos',         NULL, 0.76),
  ('Manufatura',       NULL, 0.76),
  ('Construção',       NULL, 0.84),
  ('Alimentos',        NULL, 1.01),
  ('Produtos',         NULL, 1.21),
  ('Energia',          NULL, 1.70),
  ('Softwares',        NULL, 1.78),
  ('Varejo/Atacado',   NULL, 1.81),
  ('Transporte',       NULL, 1.83)
) AS v(nome, nist, iso) ON v.nome = s.nome
ON CONFLICT DO NOTHING;

-- REALTIME
ALTER PUBLICATION supabase_realtime ADD TABLE public.maturidade;
ALTER PUBLICATION supabase_realtime ADD TABLE public.segmentos_notas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.segmentos;
