# Novo módulo: Benchmark (Governança)

Cria o módulo **Benchmark** em Governança, reproduzindo as comparações dos slides Vultus: maturidade da Bernoulli frente ao mercado (por faturamento e por número de funcionários) e o percentual de investimento em cibersegurança frente à receita — com todos os valores de referência editáveis por admin no banco.

## O que o usuário verá

Sidebar → Governança → **Benchmark**, com duas abas:

**Aba Dashboard**
- Texto de destaque: "O nível de maturidade NIST alcançado posiciona a Bernoulli acima das referências de mercado no que tange número de funcionários e receita anual."
- Gráfico 1 — Maturidade média por faixa de faturamento: barras das faixas de mercado + barra destacada da Bernoulli (cor de destaque + label).
- Gráfico 2 — Maturidade média por faixa de funcionários: mesmo formato.
- Bloco de investimento: KPI com o % atual (ex.: 0,075% em 2025) comparado à faixa de referência, com alerta visual de "abaixo do mercado".
- Tabela "Percentual médio de investimento em Segurança Cibernética" com as 4 linhas de referência (média global 0,5–1,2%; empresas maduras em TI 1,5–3%; setores críticos 2–5%; maturidade baixa < 0,5%).

**Aba Operações** (admin / permissão de edição)
- CRUD das faixas de referência de maturidade (rótulo, tipo faturamento/funcionários, valor de referência, ordem).
- CRUD das faixas de investimento de referência (tipo de organização, faixa mínima/máxima, observação).
- Formulário do ano corrente da Bernoulli: ano, score de maturidade, faturamento, investimento em cibersegurança (o % é calculado).

Visual e estrutura seguem o padrão do módulo GMUD (abas, tokens de cor, recharts).

## Detalhes técnicos

**Banco (uma migração)**
- `benchmark_maturidade_ref`: `tipo` ('faturamento' | 'funcionarios'), `faixa` (texto), `valor` (numeric), `ordem` (int), `fonte`/`ano` opcionais, `is_bernoulli` (bool) para a barra destacada.
- `benchmark_investimento_ref`: `tipo_organizacao`, `pct_min`, `pct_max`, `observacao`, `ordem`.
- `benchmark_empresa`: `ano` (unique), `score_maturidade`, `faturamento_anual`, `investimento_ciber`; percentual derivado no app.
- Para cada tabela: GRANT em `authenticated` (+ `service_role`), RLS habilitada, leitura para admin/module admin/`benchmark`+view, escrita restrita a admin/module admin/`benchmark`+manage; triggers de `updated_at`.
- INSERTs de seed com os valores dos slides (0,92 / 1,32 / 1,50 / 1,33 / 2,17 Bernoulli / 1,52 / 2,23 por faturamento; 2,45 / 1,40 / 1,45 / 2,17 Bernoulli / 1,60 / 2,73 por funcionários; as 4 faixas de investimento; 2025 com 0,075%).
- `INSERT` das linhas de permissão do módulo em `module_permissions` (`benchmark` × view/manage).

**Código**
- `src/lib/benchmark.functions.ts` — server functions com `requireSupabaseAuth` + checagem de permissão para listar e para criar/editar/excluir.
- `src/components/dashboard/Benchmark.tsx` + `benchmark/DashboardTab.tsx` e `benchmark/OperationsTab.tsx`.
- Registro em `src/lib/modules.ts` (grupo Governança, slug `benchmark`, ícone `BarChart3`, header sem período/departamento/export) e em `src/components/dashboard/dashboards.tsx`.

Nenhum módulo existente é alterado além dos dois registros.
