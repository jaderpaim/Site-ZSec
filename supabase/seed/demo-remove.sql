-- =============================================================================
-- Remove os dados de DEMONSTRAÇÃO criados por supabase/seed/demo.sql.
--
-- Apaga só registros com id no padrão de demo "de______-0000-4000-8000-…";
-- dados reais não são tocados. Ordem: dependentes primeiro.
--
-- Exceção: vuln_infra_monthly_snapshot não tem id (a chave é o mês 'YYYY-MM').
-- São removidos os 12 meses que o seed preenche -- se você importou planilhas
-- reais de vulnerabilidade de infra nesses meses, comente esse bloco.
--
-- Como rodar: DBeaver (conexão do ambiente de TESTE) → selecionar tudo → Alt+X.
-- =============================================================================

DO $remove$
DECLARE
  pat constant text := 'de______-0000-4000-8000-%';
  t text;
  n bigint;
  total bigint := 0;
BEGIN
  -- Tabelas sem dependentes de demo vêm primeiro.
  FOREACH t IN ARRAY ARRAY[
    'treinamento_atribuicoes', 'treinamentos', 'colaboradores', 'pilulas_si', 'policies',
    'org_funcoes_criticas', 'org_treinamentos',
    'nao_conformidade_chamados', 'nao_conformidades_manuais',
    'nps_registros', 'nps_clientes', 'comites', 'benchmark_empresa', 'segmentos_notas',
    'gmud_aprovadores', 'gmuds', 'aprovadores', 'wsus_servers', 'fornecedores',
    'indisponibilidades', 'cmdb_ativos', 'vuln_snapshots',
    'vulnerabilities_infra', 'vulnerabilities_aplicacao', 'applications'
  ] LOOP
    EXECUTE format('DELETE FROM public.%I WHERE id::text LIKE %L', t, pat);
    GET DIAGNOSTICS n = ROW_COUNT;
    total := total + n;
    RAISE NOTICE '% → % removido(s)', t, n;
  END LOOP;
  --
  -- Organização SI: participantes (sem id próprio), responsável das áreas, membros e áreas.
  DELETE FROM public.org_treinamento_participantes WHERE membro_id::text LIKE pat OR treinamento_id::text LIKE pat;
  UPDATE public.org_areas SET responsavel_membro_id = NULL WHERE id::text LIKE pat;
  DELETE FROM public.org_membros WHERE id::text LIKE pat;
  DELETE FROM public.org_areas WHERE id::text LIKE pat;
  --
  -- Retrato mensal de infra: os 12 meses que o seed preenche (ver aviso no topo).
  DELETE FROM public.vuln_infra_monthly_snapshot
   WHERE month IN (SELECT to_char(date_trunc('month', current_date) - (x || ' months')::interval, 'YYYY-MM')
                     FROM generate_series(0, 11) x);
  --
  -- Departamentos criados pelo seed: só os que nada mais usa (ex.: seu usuário).
  FOR t IN SELECT id::text FROM public.departments WHERE id::text LIKE pat LOOP
    BEGIN
      DELETE FROM public.departments WHERE id = t::uuid;
    EXCEPTION WHEN foreign_key_violation THEN
      RAISE NOTICE 'departamento % mantido (em uso)', t;
    END;
  END LOOP;
  --
  RAISE NOTICE 'Dados de demonstração removidos (% registros principais).', total;
END $remove$;
