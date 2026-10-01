import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server function do Painel C-Level.
 *
 * Regra de ouro deste painel: **todo número exibido tem fonte no banco**. O que
 * não tem fonte não é estimado nem ilustrado — vira lacuna explícita na tela.
 * Os números institucionais (alunos, colégios, cadastros de menores) NÃO são
 * deriváveis da telemetria de segurança: vêm da tabela `clevel_contexto`,
 * mantida pela área. Enquanto essa tabela não existir, o bloco devolve `null`
 * e a tela pede o cadastro em vez de inventar valor.
 *
 * Módulo EXCLUSIVO (`painel-c-level`): admin não tem bypass automático —
 * has_module_permission já resolve super_admin / module_admin / permissão
 * explícita (ver exclusive-modules.ts e a migration 20260904143743).
 *
 * Cada bloco é resiliente: falha de uma fonte vira `null` sem derrubar o painel.
 */

// Ações do Cloudflare que representam bloqueio/desafio na borda — mesma lista
// usada pelo módulo Cloudflare e pelo Painel Executivo.
const CF_ACTIONS = ["block", "challenge", "managed_challenge", "js_challenge"];

export const getCLevelOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, "painel-c-level", "view");

    const now = new Date();
    const since30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const since60 = new Date(now.getTime() - 60 * 86400_000).toISOString();

    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        console.error("[c-level] block failed:", (e as Error)?.message);
        return null;
      }
    };

    // Contagem com head:true — não traz linhas, só o total.
    const contar = async (tabela: string, coluna: string, de: string, ate: string | null, extra?: (q: any) => any) => {
      let q = (supabaseAdmin as any).from(tabela).select("*", { count: "exact", head: true }).gte(coluna, de);
      if (ate) q = q.lt(coluna, ate);
      if (extra) q = extra(q);
      const { count, error } = await q;
      if (error) throw error;
      return count ?? 0;
    };

    const [
      contexto,
      cobertura,
      bloqueios,
      vulns,
      tratamento,
      naoConformidades,
      maturidade,
      politicas,
      phishing,
      investimento,
    ] = await Promise.all([
      // === CONTEXTO INSTITUCIONAL (cadastro da área) =======================
      // Tabela pode ainda não existir: o safe() isola a falha para não
      // contaminar o resto do payload.
      //
      // ⚠️ `colaboradores` e `colaboradores_corporativos` são de EXIBIÇÃO
      // APENAS (decisão do usuário, 07/09/2026): entram na faixa de contexto
      // do painel para dar tamanho ao que é protegido e NÃO devem alimentar
      // nenhum cálculo, rateio ou "por pessoa". Só `alunos` é divisor
      // (custo por aluno).
      safe(async () => {
        const { data, error } = await (supabaseAdmin as any)
          .from("clevel_contexto")
          .select(
            "alunos,colegios,cadastros_menores,colaboradores,colaboradores_corporativos,fonte,referencia,updated_at",
          )
          .eq("id", 1)
          .maybeSingle();
        if (error) throw error;
        return (data ?? null) as {
          alunos: number | null;
          colegios: number | null;
          cadastros_menores: number | null;
          colaboradores: number | null;
          colaboradores_corporativos: number | null;
          fonte: string | null;
          referencia: string | null;
          updated_at: string | null;
        } | null;
      }),

      // === COBERTURA (o que limita qualquer afirmação de ausência) =========
      // ⚠️ Criptografia vem da RPC `sophos_encryption_summary`, que agrega NO
      // BANCO. Um `.from("sophos_endpoints").select(...)` puro é cortado em
      // 1000 linhas pelo PostgREST e produz número truncado (foi o bug que dava
      // "684 de 893" aqui contra "1419 de 1873" no módulo Sophos). Mesma fonte
      // do módulo, para os números baterem.
      safe(async () => {
        const [{ count: ativos }, { count: indispAbertas }] = await Promise.all([
          supabaseAdmin.from("cmdb_ativos").select("*", { count: "exact", head: true }),
          supabaseAdmin.from("indisponibilidades").select("*", { count: "exact", head: true }).is("fim", null),
        ]);
        const total = ativos ?? 0;
        const abertas = indispAbertas ?? 0;

        // Bloco de criptografia é tolerante: se a RPC falhar, o resto da
        // cobertura (disponibilidade, ativos) continua servindo a tela.
        let cripto: {
          endpoints: number;
          servidores: number;
          dispositivos: number;
          criptografados: number;
          criptografiaPct: number;
        } | null = null;
        try {
          const { data: encRows, error: encErr } = await (supabaseAdmin as any).rpc("sophos_encryption_summary");
          if (encErr) throw encErr;
          const rows = (encRows ?? []) as Array<{
            category: string;
            encrypted: boolean | null;
            total: number;
          }>;
          // Igual ao módulo: todo dispositivo entra no total; só `encrypted=true`
          // conta como criptografado (qualquer outro status vira "sem cripto").
          const soma = (cat: string, pred: (e: boolean | null) => boolean) =>
            rows.filter((r) => r.category === cat && pred(r.encrypted)).reduce((s, r) => s + Number(r.total ?? 0), 0);
          const epEnc = soma("endpoint", (e) => e === true);
          const epTot = epEnc + soma("endpoint", (e) => e !== true);
          const svEnc = soma("server", (e) => e === true);
          const svTot = svEnc + soma("server", (e) => e !== true);
          // A métrica de criptografia do painel é SÓ de endpoints (computadores
          // de equipe) — decisão do usuário: criptografia de disco é o controle
          // que protege máquina perdida/roubada, e servidor não entra nessa
          // conta. `servidores` continua exposto porque a frase de cobertura
          // do bloco 1 cita os dois.
          if (epTot > 0) {
            cripto = {
              endpoints: epTot,
              servidores: svTot,
              dispositivos: epTot,
              criptografados: epEnc,
              criptografiaPct: epEnc / epTot,
            };
          }
        } catch (e) {
          console.error("[c-level] criptografia indisponível:", (e as Error)?.message);
        }

        return {
          endpoints: cripto?.endpoints ?? null,
          servidores: cripto?.servidores ?? null,
          dispositivos: cripto?.dispositivos ?? null,
          criptografados: cripto?.criptografados ?? null,
          criptografiaPct: cripto?.criptografiaPct ?? null,
          ativosMonitorados: total,
          indisponibilidadesAbertas: abertas,
          // Fração 0–1, igual ao módulo Disponibilidade.
          disponibilidadePct: total > 0 ? (total - abertas) / total : 1,
        };
      }),

      // === BLOQUEIOS · 30 DIAS ============================================
      // Janela única de 30 dias para os dois lados (borda e endpoint), para o
      // número não misturar períodos diferentes.
      safe(async () => {
        const [bordaAgora, bordaAntes, endpointAgora, endpointAntes] = await Promise.all([
          contar("cloudflare_firewall_events", "datetime", since30, null, (q) => q.in("action", CF_ACTIONS)),
          contar("cloudflare_firewall_events", "datetime", since60, since30, (q) => q.in("action", CF_ACTIONS)),
          contar("sophos_alerts", "raised_at", since30, null),
          contar("sophos_alerts", "raised_at", since60, since30),
        ]);
        const total = bordaAgora + endpointAgora;
        const anterior = bordaAntes + endpointAntes;
        return {
          total,
          anterior,
          borda: bordaAgora,
          endpoint: endpointAgora,
          // Fração 0–1; null quando não há base de comparação.
          variacao: anterior > 0 ? (total - anterior) / anterior : null,
        };
      }),

      // === VULNERABILIDADES ===============================================
      // Mesma RPC do Painel Executivo, para os dois painéis não divergirem.
      safe(async () => {
        const { data, error } = await (supabaseAdmin as any).rpc("get_exec_vulnerabilities_overview", {
          p_since30: since30,
          p_since60: since60,
        });
        if (error) throw error;
        const atual = (data as any)?.current ?? {};
        return {
          criticas: Number(atual.criticas ?? 0),
          altas: Number(atual.altas ?? 0),
          corrigidas30d: Number((data as any)?.fixed30d?.total ?? 0),
        };
      }),

      // === EM TRATAMENTO COM PRAZO (o que precisa de decisão) =============
      safe(async () => {
        const campos = "id,fqdn,vuln_type,severity,treatment_due_date,responsible";
        const consulta = (tabela: string) =>
          (supabaseAdmin as any)
            .from(tabela)
            .select(campos)
            .eq("status", "Em tratamento")
            .in("severity", ["Crítica", "Alta"])
            .not("treatment_due_date", "is", null)
            .order("treatment_due_date", { ascending: true })
            .limit(10);
        const [app, infra] = await Promise.all([
          consulta("vulnerabilities_aplicacao"),
          consulta("vulnerabilities_infra"),
        ]);
        if (app.error) throw app.error;
        const linhas = [
          ...(app.data ?? []).map((r: any) => ({ ...r, origem: "Aplicação" })),
          ...(infra.error ? [] : (infra.data ?? []).map((r: any) => ({ ...r, origem: "Infraestrutura" }))),
        ];
        const hoje = new Date().toISOString().slice(0, 10);
        const itens = linhas
          .sort((a: any, b: any) => String(a.treatment_due_date).localeCompare(String(b.treatment_due_date)))
          .map((r: any) => ({
            id: r.id as string,
            alvo: (r.fqdn ?? "—") as string,
            tipo: (r.vuln_type ?? null) as string | null,
            severidade: r.severity as string,
            prazo: r.treatment_due_date as string,
            responsavel: (r.responsible ?? null) as string | null,
            origem: r.origem as string,
            atrasada: String(r.treatment_due_date) < hoje,
          }));
        return {
          itens: itens.slice(0, 6),
          total: itens.length,
          atrasadas: itens.filter((i) => i.atrasada).length,
        };
      }),

      // === NÃO CONFORMIDADES SEM ACEITE DE RISCO ==========================
      safe(async () => {
        const { data, error } = await supabaseAdmin
          .from("nao_conformidades_manuais")
          .select("id,plataforma,fora_compliance,prazo_resolucao,aceite_risco,created_at")
          .order("created_at", { ascending: false })
          .limit(50);
        if (error) throw error;
        const todas = data ?? [];
        // "Pendente de decisão" = risco não aceito (ou em branco) — é o que
        // precisa subir para a diretoria.
        const pendentes = todas.filter((n: any) => {
          const a = (n.aceite_risco ?? "").toString().trim().toLowerCase();
          return a === "" || a === "não aceito" || a === "nao aceito";
        });
        return {
          total: todas.length,
          pendentes: pendentes.length,
          semPrazo: pendentes.filter((n: any) => !n.prazo_resolucao).length,
          itens: pendentes.slice(0, 4).map((n: any) => ({
            id: n.id as string,
            plataforma: (n.plataforma ?? "—") as string,
            descricao: (n.fora_compliance ?? "") as string,
            prazo: (n.prazo_resolucao ?? null) as string | null,
          })),
        };
      }),

      // === MATURIDADE (NIST + ISO + média do segmento Educação) ===========
      // Lógica idêntica à do Painel Executivo: segmento is_bernoulli, última
      // nota NÃO-NULA por métrica, e a média do segmento cujo nome casa /^educa/i.
      safe(async () => {
        const [{ data: segs }, { data: mat }] = await Promise.all([
          supabaseAdmin.from("segmentos").select("id,nome,is_bernoulli"),
          supabaseAdmin
            .from("maturidade")
            .select("segmento_id,periodo,periodo_ordem,nota_nist,nota_iso")
            .order("periodo_ordem", { ascending: true }),
        ]);
        if (!mat?.length || !segs?.length) return null;
        const bernoulliId = (segs ?? []).find((s: any) => s.is_bernoulli)?.id ?? null;
        if (!bernoulliId) return null;

        const bern = (mat ?? [])
          .filter((r: any) => r.segmento_id === bernoulliId)
          .sort((a: any, b: any) => Number(a.periodo_ordem) - Number(b.periodo_ordem));
        if (!bern.length) return null;

        const r2 = (v: any) => Math.round(Number(v) * 100) / 100;
        // NIST e ISO podem ter sido avaliados em períodos diferentes — cada um
        // pega a sua última nota NÃO-NULA, igual ao Painel Executivo.
        const ultNist = [...bern].reverse().find((r: any) => r.nota_nist != null) ?? null;
        const ultIso = [...bern].reverse().find((r: any) => r.nota_iso != null) ?? null;
        const nist = ultNist ? r2(ultNist.nota_nist) : null;
        const iso = ultIso ? r2(ultIso.nota_iso) : null;

        // Média do segmento Educação (última nota não-nula de cada métrica).
        let mediaEdu: number | null = null;
        let mediaEduIso: number | null = null;
        for (const seg of segs ?? []) {
          if ((seg as any).is_bernoulli || !/^educa/i.test((seg as any).nome ?? "")) continue;
          const doSeg = (mat ?? []).filter((r: any) => r.segmento_id === (seg as any).id);
          const uN = [...doSeg].reverse().find((r: any) => r.nota_nist != null);
          const uI = [...doSeg].reverse().find((r: any) => r.nota_iso != null);
          if (uN) mediaEdu = r2((uN as any).nota_nist);
          if (uI) mediaEduIso = r2((uI as any).nota_iso);
        }

        return {
          nist,
          periodo: (ultNist as any)?.periodo ?? null,
          mediaEdu,
          vsEdu: nist != null && mediaEdu != null ? r2(nist - mediaEdu) : null,
          iso,
          periodoIso: (ultIso as any)?.periodo ?? null,
          mediaEduIso,
          vsEduIso: iso != null && mediaEduIso != null ? r2(iso - mediaEduIso) : null,
          // Escala e meta são do módulo Maturidade — não converter para 0–100.
          // A escala das avaliações vai de 0 a 5 (mesma faixa validada no
          // Benchmark, `score_maturidade` 0–5); a meta interna é 3,0
          // (META_NIST/META_ISO em maturidade/MaturidadeExecutive.tsx).
          escalaMax: 5,
          meta: 3,
          historico: bern
            .filter((r: any) => r.nota_nist != null || r.nota_iso != null)
            .map((r: any) => ({
              periodo: r.periodo as string,
              nist: r.nota_nist != null ? Number(r.nota_nist) : null,
              iso: r.nota_iso != null ? Number(r.nota_iso) : null,
            })),
        };
      }),

      // === POLÍTICAS E TREINAMENTOS (módulo Políticas) ====================
      // Evidência de GESTÃO — é o que sustenta a nota de maturidade (a ISO 27001
      // mede exatamente isso). Mesma base do Painel Executivo: status
      // "Publicada" sobre TODAS as linhas de `policies` (Política + Processo).
      safe(async () => {
        const { data, error } = await supabaseAdmin.from("policies").select("status,trained_count,target_count");
        if (error) throw error;
        const lista = data ?? [];
        if (!lista.length) return null;
        const publicadas = lista.filter(
          (p: any) => (p.status ?? "").toString().trim().toLowerCase() === "publicada",
        ).length;
        const treinados = lista.reduce((a: number, p: any) => a + Number(p.trained_count ?? 0), 0);
        const alvo = lista.reduce((a: number, p: any) => a + Number(p.target_count ?? 0), 0);
        return {
          total: lista.length,
          publicadas,
          publicadasPct: publicadas / lista.length,
          // `treinados` é a soma dos contadores POR POLÍTICA — são treinamentos
          // concluídos, não pessoas distintas (o modelo não tem registro por
          // pessoa). Não rotular como "colaboradores treinados".
          treinados,
          alvo,
          // Percentual só existe se houver meta cadastrada. Com alvo = 0 isso
          // devolve null e a tela mostra a lacuna em vez de um "0%" que
          // pareceria desempenho ruim.
          treinadosPct: alvo > 0 ? treinados / alvo : null,
        };
      }),

      // === PHISHING (SIMULAÇÃO interna, não ataque barrado) ===============
      safe(async () => {
        const { data: cache } = await (supabaseAdmin as any)
          .from("gophish_cache")
          .select("data")
          .eq("key", "overview")
          .maybeSingle();
        if (!cache) return null;
        const payload: any = (cache as any).data ?? cache;
        const k: any = payload?.kpis ?? {};
        const bruto = k.compromisePct ?? payload?.compromisePct ?? null;
        if (bruto == null) return null;
        // Vem em escala 0–100; devolvido como fração 0–1.
        return { comprometimentoPct: Number(bruto) / 100 };
      }),

      // === INVESTIMENTO (reaproveita o cadastro do módulo Benchmark) =======
      // O piso de mercado sai da primeira faixa de referência por ordem — a
      // mesma que o Benchmark usa como mínimo. Não há número inventado aqui:
      // se o cadastro estiver vazio, o bloco devolve null e a tela omite.
      safe(async () => {
        const [empresa, ref] = await Promise.all([
          (supabaseAdmin as any)
            .from("benchmark_empresa")
            .select("ano,faturamento_anual,investimento_ciber")
            .order("ano", { ascending: false })
            .limit(1)
            .maybeSingle(),
          (supabaseAdmin as any)
            .from("benchmark_investimento_ref")
            .select("pct_min,pct_max")
            .order("ordem", { ascending: true })
            .limit(1)
            .maybeSingle(),
        ]);
        if (empresa.error) throw empresa.error;
        const e = empresa.data;
        if (!e || e.investimento_ciber == null) return null;
        const investimento = Number(e.investimento_ciber);
        const faturamento = e.faturamento_anual != null ? Number(e.faturamento_anual) : null;
        const pisoPct = !ref.error && ref.data?.pct_min != null ? Number(ref.data.pct_min) : null;
        return {
          ano: e.ano as number,
          investimento,
          faturamento,
          // Fração 0–1 (a tela multiplica por 100).
          pctReceita: faturamento && faturamento > 0 ? investimento / faturamento : null,
          pisoPct,
          investimentoNoPiso: faturamento && pisoPct != null ? (pisoPct / 100) * faturamento : null,
        };
      }),
    ]);

    return {
      contexto,
      cobertura,
      bloqueios,
      vulns,
      tratamento,
      naoConformidades,
      maturidade,
      politicas,
      phishing,
      investimento,
    };
  });

// ── Cadastro do contexto institucional (aba Operações) ───────────────────────
// Linha única (id = 1). Números que a área informa e que a telemetria de
// segurança não tem como derivar.
const ContextoSchema = z.object({
  alunos: z.number().int().min(0).max(100_000_000).optional().nullable(),
  colegios: z.number().int().min(0).max(1_000_000).optional().nullable(),
  cadastros_menores: z.number().int().min(0).max(100_000_000).optional().nullable(),
  colaboradores: z.number().int().min(0).max(1_000_000).optional().nullable(),
  colaboradores_corporativos: z.number().int().min(0).max(1_000_000).optional().nullable(),
  fonte: z.string().max(200).optional().nullable(),
  referencia: z.string().max(200).optional().nullable(),
});

export const upsertCLevelContexto = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => ContextoSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "painel-c-level", "manage");
    const { error } = await (supabaseAdmin as any).from("clevel_contexto").upsert(
      {
        id: 1,
        alunos: data.alunos ?? null,
        colegios: data.colegios ?? null,
        cadastros_menores: data.cadastros_menores ?? null,
        colaboradores: data.colaboradores ?? null,
        colaboradores_corporativos: data.colaboradores_corporativos ?? null,
        fonte: data.fonte?.trim() || null,
        referencia: data.referencia?.trim() || null,
      },
      { onConflict: "id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
