import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { osFilterGroup } from "@/lib/cmdb-os";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Server function agregadora do Painel Executivo.
 * Módulo RBAC normal: exige a permissão `painel-executivo:view`
 * (admin global passa automaticamente via has_module_permission).
 * Cada bloco é resiliente — falha de uma fonte vira `null` sem derrubar o painel.
 */
export const getExecutiveOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;

    // Gate RBAC — exige permissão de visualização do módulo (admin global incluído).
    await requirePermission(supabase, userId, "painel-executivo", "view");

    const now = new Date();
    const since7 = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const since30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const since60 = new Date(now.getTime() - 60 * 86400_000).toISOString();
    const since90 = new Date(now.getTime() - 90 * 86400_000).toISOString();
    const since180 = new Date(now.getTime() - 180 * 86400_000).toISOString();
    const since365 = new Date(now.getTime() - 365 * 86400_000).toISOString();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    // safe wrapper — qualquer rejeição vira null
    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch (e) {
        console.error("[exec-overview] block failed:", (e as Error)?.message);
        return null;
      }
    };

    const [
      cloudflare,
      dominios,
      sophos,
      eps,
      mttr,
      vulns,
      phishing,
      treinamentos,
      wsus,
      disponibilidade,
      ia,
      comites,
      nps,
      pilulas,
      naoConformidades,
      maturidade,
      firewall,
      bloqueios30d,
    ] = await Promise.all([
      // === CLOUDFLARE: últimos 7d via snapshots + firewall_events ==========
      safe(async () => {
        const sb = supabaseAdmin as any;
        const [{ data: zones }, { data: snaps }, { data: fwTop }] = await Promise.all([
          sb.from("cloudflare_zones").select("id,name,status").eq("status", "active"),
          sb
            .from("cloudflare_snapshots")
            .select("zone_id,range_days,payload,captured_at")
            .order("captured_at", { ascending: false })
            .limit(200),
          sb
            .from("cloudflare_firewall_events")
            .select("host,action,datetime")
            // Janela de 7 dias para casar com os snapshots (range_days: 7) — assim o
            // card inteiro do Cloudflare reflete a MESMA janela.
            .gte("datetime", since7)
            // FIX: token real é "js_challenge" (com underscore), igual ao módulo Cloudflare
            .in("action", ["block", "challenge", "managed_challenge", "js_challenge"]),
        ]);

        // snaps vem ordenado por captured_at desc. Por zona, prefere o snapshot
        // mais recente COM dados (requests > 0) — um sync que falhou e gravou
        // zeros não deve apagar os números do card. Cai no mais recente absoluto
        // só se a zona não tiver nenhum snapshot com dados.
        const latestByZone = new Map<string, any>();
        const fallbackByZone = new Map<string, any>();
        (snaps ?? []).forEach((s: any) => {
          if (!fallbackByZone.has(s.zone_id)) fallbackByZone.set(s.zone_id, s);
          const req = Number((s.payload as any)?.totals?.requests ?? 0);
          if (req > 0 && !latestByZone.has(s.zone_id)) latestByZone.set(s.zone_id, s);
        });
        for (const [zoneId, s] of fallbackByZone) {
          if (!latestByZone.has(zoneId)) latestByZone.set(zoneId, s);
        }

        let requests = 0;
        let mitigated = 0;
        for (const s of latestByZone.values()) {
          const p: any = s.payload ?? {};
          requests += Number(p?.totals?.requests ?? 0);
          mitigated += Number(p?.totals?.mitigated ?? p?.totals?.threats ?? 0);
        }

        // Série diária de mitigações (7 dias) a partir dos firewall_events reais —
        // os snapshots de cron guardam só `totals` (sem série), então o sparkline
        // antigo (que lia payload.series) ficava sempre vazio.
        const tsMap = new Map<string, number>();
        const hostCounts = new Map<string, number>();
        (fwTop ?? []).forEach((e: any) => {
          const d = (e.datetime ?? "").toString().slice(0, 10);
          if (d) tsMap.set(d, (tsMap.get(d) ?? 0) + 1);
          if (e.host) hostCounts.set(e.host, (hostCounts.get(e.host) ?? 0) + 1);
        });
        const timeseries = Array.from(tsMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([date, m]) => ({ date, mitigated: m }));
        // FIX: campo renomeado para `count` para consistência com o componente
        const topHosts = Array.from(hostCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([host, count]) => ({ host, count }));

        return {
          requests,
          mitigated,
          // mitigationRate já é fração 0–1 (calculado aqui, não vem do banco)
          mitigationRate: requests > 0 ? mitigated / requests : 0,
          zones: (zones ?? []).length,
          timeseries,
          topHosts,
        };
      }),

      // === DOMÍNIOS / SSL ====================================================
      safe(async () => {
        const [{ count: domainCount }, { data: ssl }] = await Promise.all([
          supabaseAdmin.from("domains").select("*", { count: "exact", head: true }),
          supabaseAdmin.from("ssl_certificates").select("status,valid_to"),
        ]);
        const totalCerts = (ssl ?? []).length;
        // FIX: status real da tabela é "ativo" (minúsculo), não "ok"/"valid"/"active"
        const validCerts = (ssl ?? []).filter((c: any) =>
          ["ok", "valid", "active", "ativo"].includes(c.status ?? ""),
        ).length;
        return {
          totalDomains: domainCount ?? 0,
          totalCerts,
          validCerts,
          pendingCerts: totalCerts - validCerts,
          allTls: totalCerts > 0 && validCerts === totalCerts,
        };
      }),

      // === SOPHOS ============================================================
      safe(async () => {
        const [{ data: alerts }, { data: endpoints }] = await Promise.all([
          // 60 dias para permitir comparar últimos 30d vs os 30d anteriores ("melhoria")
          supabaseAdmin
            .from("sophos_alerts")
            .select("raised_at,severity,description,category,type,managed_agent_name,person_name")
            .gte("raised_at", since60),
          supabaseAdmin.from("sophos_endpoints").select("type,encrypted,health_overall"),
        ]);
        const since30Ms = new Date(since30).getTime();
        const last30 = (alerts ?? []).filter((a: any) => new Date(a.raised_at ?? 0).getTime() >= since30Ms);
        const prev30 = (alerts ?? []).filter((a: any) => new Date(a.raised_at ?? 0).getTime() < since30Ms);
        const blocked = last30.length;
        const blockedPrev = prev30.length;
        // "Failed to protect computer" (Event::Endpoint::NotProtected) NÃO é ameaça
        // contida — é falha de cobertura do agente. Antes entrava no mesmo balde de
        // "incidentes críticos / graves" e inflava o número do card Defesa Ativa · Interno.
        const isSemProtecao = (a: any) => /notprotected/i.test(String(a.type ?? ""));

        // Limpezas do dado cru do Sophos: "DOMINIO\usuario" → "usuario"; "n/a" → nulo.
        const cleanPerson = (v: any): string | null => {
          const s = String(v ?? "").trim();
          if (!s || /^n\/?a$/i.test(s)) return null;
          return s.replace(/^[^\\]+\\/, "").trim() || null;
        };
        // A descrição costuma terminar com ": <máquina>", que já aparece ao lado.
        const cleanDesc = (d: any, device: string | null): string => {
          const s = String(d ?? "").trim();
          if (!s) return "Alerta sem descrição";
          if (device) {
            const suf = `: ${device}`.toLowerCase();
            if (s.toLowerCase().endsWith(suf)) return s.slice(0, s.length - suf.length).trim() || s;
          }
          return s;
        };

        const criticos = last30.filter(
          (a: any) => ["critical", "high"].includes((a.severity ?? "").toLowerCase()) && !isSemProtecao(a),
        );
        const critical = criticos.length;
        // Detalhamento do badge "N seriam incidentes críticos / graves" no card
        // Defesa Ativa · Interno. Mais recentes primeiro, no máximo 10 (o resto vai
        // como contagem no rodapé do tooltip).
        const criticalList = criticos
          .sort((a: any, b: any) => new Date(b.raised_at ?? 0).getTime() - new Date(a.raised_at ?? 0).getTime())
          .slice(0, 10)
          .map((a: any) => {
            const device = String(a.managed_agent_name ?? "").trim() || null;
            const person = cleanPerson(a.person_name);
            return {
              at: a.raised_at ?? null,
              sev: (a.severity ?? "").toLowerCase() === "critical" ? "critical" : "high",
              desc: cleanDesc(a.description ?? a.category, device),
              who: [device, person].filter(Boolean).join(" · ") || null,
            };
          });

        const dayMap = new Map<string, number>();
        last30.forEach((a: any) => {
          const d = (a.raised_at ?? "").slice(0, 10);
          if (!d) return;
          dayMap.set(d, (dayMap.get(d) ?? 0) + 1);
        });
        const series = Array.from(dayMap.entries())
          .sort()
          .map(([date, count]) => ({ date, count }));

        // Somente endpoints, ignora servers
        const eps = (endpoints ?? []).filter((e: any) => (e.type ?? "").toLowerCase() !== "server");
        const encrypted = eps.filter((e: any) => e.encrypted === true).length;
        const unencrypted = eps.filter((e: any) => e.encrypted === false).length;
        // FIX: rate retornado como fração 0–1 (o componente usa fmtPct que multiplica por 100)
        const rate = eps.length > 0 ? encrypted / eps.length : 0;

        return {
          blocked,
          blockedPrev,
          critical,
          criticalList,
          series,
          encryption: { encrypted, unencrypted, total: eps.length, rate },
        };
      }),

      // === EPS (QRadar) ======================================================
      safe(async () => {
        const { data: samples } = await supabaseAdmin
          .from("qradar_eps_samples")
          .select("total_eps,licensed_eps,sampled_at")
          .gte("sampled_at", since30)
          .order("sampled_at", { ascending: true });
        if (!samples?.length) return null;
        // EPS ATUAL: agrupa as amostras por HORA (média simples dentro de cada hora) e
        // usa o ÚLTIMO bucket — mesma lógica do KPI "EPS Atual" do módulo SOC
        // (SocReal.tsx), para os dois módulos mostrarem sempre o mesmo número.
        const byHour = new Map<string, { sum: number; count: number }>();
        for (const s of samples as any[]) {
          const d = new Date(s.sampled_at);
          if (!Number.isFinite(d.getTime())) continue;
          const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
          const cur = byHour.get(key) ?? { sum: 0, count: 0 };
          cur.sum += Number(s.total_eps ?? 0);
          cur.count += 1;
          byHour.set(key, cur);
        }
        const hourlyKeys = [...byHour.keys()].sort();
        const lastHour = byHour.get(hourlyKeys[hourlyKeys.length - 1])!;
        const avg = lastHour.sum / lastHour.count;
        const peak = Math.max(...samples.map((s: any) => Number(s.total_eps ?? 0)));
        // Licença contratada de EPS = 2000 (valor fixo, igual ao SOC / Não Conformidade).
        // Ignora o licensed_eps do banco, que pode estar defasado (1500).
        const licensed = 2000;
        // pctUse e overrun são frações 0–1 (o componente usa fmtPct)
        const pctUse = licensed > 0 ? avg / licensed : 0;
        const peakPct = licensed > 0 ? peak / licensed : 0;
        const overrun = licensed > 0 && avg > licensed ? (avg - licensed) / licensed : 0;
        return {
          avg: Math.round(avg),
          peak: Math.round(peak),
          licensed,
          pctUse,
          peakPct,
          overrun,
          samples: samples.map((s: any) => ({
            t: s.sampled_at,
            v: Number(s.total_eps ?? 0),
          })),
        };
      }),

      // === MTTR ==============================================================
      safe(async () => {
        // Busca offenses fechados nos últimos 6 meses (uma query serve para o
        // headline dos 30 dias E para a série mensal de melhoria).
        const [{ data: closed }, { count: openCount }] = await Promise.all([
          supabaseAdmin
            .from("qradar_offenses")
            .select("start_time,closed_at")
            .not("closed_at", "is", null)
            .gte("closed_at", since180),
          supabaseAdmin.from("qradar_offenses").select("*", { count: "exact", head: true }).is("closed_at", null),
        ]);
        if (!closed?.length) return { avgHours: 0, openCount: openCount ?? 0, sampleSize: 0, series: [] };

        const since30Ms = now.getTime() - 30 * 86400_000;
        // tempo de resolução (horas) por offense + chave do mês de fechamento (UTC)
        const resolved = closed
          .map((o: any) => {
            const start = new Date(o.start_time).getTime();
            const end = new Date(o.closed_at).getTime();
            return {
              hours: (end - start) / 3_600_000,
              endMs: end,
              month: String(o.closed_at).slice(0, 7),
            };
          })
          .filter((r) => Number.isFinite(r.hours) && r.hours >= 0);

        // avgHours = média dos últimos 30 dias (mantém o significado/headline atual)
        const last30 = resolved.filter((r) => r.endMs >= since30Ms).map((r) => r.hours);
        const avg = last30.length ? last30.reduce((a, b) => a + b, 0) / last30.length : 0;

        // série mensal (6 meses): MTTR médio por mês, só meses com dados, ordenado
        const byMonth = new Map<string, { sum: number; n: number }>();
        for (const r of resolved) {
          const m = byMonth.get(r.month) ?? { sum: 0, n: 0 };
          m.sum += r.hours;
          m.n += 1;
          byMonth.set(r.month, m);
        }
        const series = Array.from(byMonth.entries())
          .map(([t, { sum, n }]) => ({ t, v: Math.round((sum / n) * 100) / 100 }))
          .sort((a, b) => a.t.localeCompare(b.t));

        const mttrResult = {
          avgHours: Math.round(avg * 10) / 10,
          openCount: openCount ?? 0,
          sampleSize: last30.length,
          series,
        };
        // PROVISÓRIO (2026-08-05): valor estático de 3h15min até decidirmos como tratar
        // fechamentos automáticos do The Hive no cálculo do MTTR. Comentar a linha abaixo
        // para voltar ao cálculo real (mttrResult.avgHours já calculado acima).
        mttrResult.avgHours = 3.15; // 3h15min
        return mttrResult;
      }),

      // === VULNERABILIDADES (somente APLICAÇÃO, igual ao padrão do módulo) ====
      safe(async () => {
        // Agregação feita em SQL (get_exec_vulnerabilities_overview) em vez de paginar
        // a tabela inteira e contar em JS — mesmo problema de performance já corrigido
        // no Ranking de IA (ver 20260618210000_fix_ranking_ia_rpc_perf.sql).
        const [{ data: snaps }, { data: agg, error: aggErr }] = await Promise.all([
          supabaseAdmin.from("vuln_snapshots").select("*").order("snapshot_date", { ascending: true }).limit(24),
          supabase.rpc(
            "get_exec_vulnerabilities_overview" as never,
            {
              p_since30: since30,
              p_since60: since60,
            } as never,
          ),
        ]);
        if (aggErr) throw aggErr;
        const { current, fixed30d, fixedPrev30d, fixedSeries } = agg as any;

        // Baseline do evolutivo: snapshot mais recente com data <= 90 dias atrás;
        // se a série não chega a 90 dias, usa o mais antigo disponível.
        const snapsArr = snaps ?? []; // ascending por snapshot_date
        const since90Time = new Date(since90).getTime();
        const baseline =
          [...snapsArr].reverse().find((s: any) => new Date(s.snapshot_date).getTime() <= since90Time) ??
          snapsArr[0] ??
          null;
        // Tendência por CRÍTICAS + ALTAS ABERTAS (o snapshot grava criticas/altas já
        // como abertas-por-severidade, app-only — mesma base do `current`). É o sinal
        // que a equipe controla; o total de "abertas" cresce com a descoberta contínua.
        const previous = baseline
          ? {
              criticasAltas: Number(baseline.criticas ?? 0) + Number(baseline.altas ?? 0),
              date: baseline.snapshot_date as string,
            }
          : null;
        // Histórico para o gráfico evolutivo (críticas + altas abertas por snapshot)
        const history = snapsArr.map((s: any) => ({
          d: s.snapshot_date as string,
          criticasAltas: Number(s.criticas ?? 0) + Number(s.altas ?? 0),
        }));

        return { current, previous, history, fixed30d, fixedPrev30d, fixedSeries };
      }),

      // === PHISHING ==========================================================
      safe(async () => {
        // gophish_cache tem uma linha por `key` ("overview"/"operations"/
        // "campaigns"). O overview pré-computado fica em key="overview" — sem
        // esse filtro, a query pegava outra linha e o card caía em "Fonte indisponível".
        const { data: cache } = await (supabaseAdmin as any)
          .from("gophish_cache")
          .select("data")
          .eq("key", "overview")
          .maybeSingle();
        if (!cache) return null;
        const payload: any = (cache as any).data ?? (cache as any).payload ?? cache;
        if (!payload?.kpis && payload?.compromisePct == null) return null;

        // compromisePct/reportRate ficam dentro de kpis e em escala 0–100 (ex:
        // 23.4). O componente usa fmtPct() que multiplica por 100, então /100 aqui.
        // reportRate ainda não é calculado no overview → null (badge fica oculto).
        const k: any = payload?.kpis ?? {};
        const rawCompromise = k.compromisePct ?? payload?.compromisePct ?? payload?.compromise_pct ?? 0;
        const rawReport = k.reportRate ?? payload?.reportRate ?? payload?.report_rate ?? null;

        return {
          compromisePct: rawCompromise / 100,
          reportRate: rawReport == null ? null : rawReport / 100,
          // Top 5 departamentos por nº de pessoas comprometidas (forneceram dados).
          // Deriva de byDepartmentSubmitted, que o sync já calcula e ordena desc.
          topDeptsCompromise: (payload?.byDepartmentSubmitted ?? [])
            .slice(0, 5)
            .map((d: any) => ({ name: d.dept, count: d.total })),
          topDeptsReport: payload?.topDeptsReport ?? [],
        };
      }),

      // === TREINAMENTOS (policies) ==========================================
      safe(async () => {
        const { data: pols } = await supabaseAdmin.from("policies").select("status,trained_count,target_count");
        const list = pols ?? [];
        const trained = list.reduce((a: number, p: any) => a + Number(p.trained_count ?? 0), 0);
        const target = list.reduce((a: number, p: any) => a + Number(p.target_count ?? 0), 0);
        // Políticas publicadas vs total (mesma base do módulo Políticas: status "Publicada"
        // sobre TODAS as linhas — Política + Processo).
        const totalPolicies = list.length;
        const publishedPolicies = list.filter(
          (p: any) => (p.status ?? "").toString().trim().toLowerCase() === "publicada",
        ).length;
        // trainedPct é fração 0–1 (componente usa fmtPct)
        return {
          trainedPct: target > 0 ? trained / target : 0,
          trained,
          target,
          policies: totalPolicies,
          publishedPolicies,
          totalPolicies,
        };
      }),

      // === WSUS ==============================================================
      // Espelha getWsusOverview (wsus.functions.ts): cobertura = servidores do CMDB
      // (tipo ILIKE %servidor%, status Ativo, SO Windows, com hostname) que casam com algum
      // computer_name de wsus_servers. `failed` = servidores com failed > 0.
      safe(async () => {
        const [{ data: wsusRows }, { data: cmdb }] = await Promise.all([
          supabaseAdmin.from("wsus_servers").select("computer_name,failed"),
          supabaseAdmin
            .from("cmdb_ativos")
            .select("ip_hostname,nome,tipo,status,sistema_operacional")
            .eq("status", "Ativo")
            .ilike("tipo", "%servidor%"),
        ]);
        const rows = (wsusRows ?? []) as Array<{ computer_name: string; failed: number | null }>;
        const cmdbList = (cmdb ?? []).filter(
          (c: any) =>
            (c.ip_hostname ?? c.nome ?? "").trim() !== "" && osFilterGroup(c.sistema_operacional) === "Windows",
        );
        const cmdbServers = cmdbList.length;
        const wsusNameSet = new Set(rows.map((r) => (r.computer_name ?? "").toLowerCase().trim()));
        const covered = cmdbList.filter((c: any) =>
          [c.ip_hostname, c.nome].filter(Boolean).some((v: string) => wsusNameSet.has(v.toLowerCase().trim())),
        ).length;
        const failed = rows.filter((r) => Number(r.failed ?? 0) > 0).length;
        // coverage é fração 0–1 (componente usa fmtPct)
        const coverage = cmdbServers > 0 ? covered / cmdbServers : 0;
        return { total: covered, failed, cmdbServers, coverage };
      }),

      // === DISPONIBILIDADE ==================================================
      safe(async () => {
        const [{ count: total }, { count: openIndisp }] = await Promise.all([
          // Denominador = TODOS os ativos do CMDB, igual ao módulo Disponibilidade
          // (que não filtra por status ao calcular a % de disponibilidade geral).
          supabaseAdmin.from("cmdb_ativos").select("*", { count: "exact", head: true }),
          supabaseAdmin.from("indisponibilidades").select("*", { count: "exact", head: true }).is("fim", null),
        ]);
        const t = total ?? 0;
        const o = openIndisp ?? 0;
        // availablePct é fração 0–1 (componente usa fmtPct)
        return {
          total: t,
          open: o,
          availablePct: t > 0 ? (t - o) / t : 1,
        };
      }),

      // === IA ===============================================================
      safe(async () => {
        // Agregação feita em SQL (get_exec_ia_overview) em vez de paginar a tabela
        // inteira e contar em JS — mesmo problema de performance já corrigido no
        // Ranking de IA (ver 20260618210000_fix_ranking_ia_rpc_perf.sql). A normalização
        // (trim + lowercase) de user_name é feita dentro da função SQL.
        const { data, error } = await supabase.rpc(
          "get_exec_ia_overview" as never,
          {
            p_since: since30,
          } as never,
        );
        if (error) throw error;
        const { activeUsers, totalEvents, topTools } = data as any;
        return { activeUsers, totalEvents, topTools };
      }),

      // === COMITÊS ==========================================================
      safe(async () => {
        const { data } = await supabaseAdmin.from("comites").select("id,data,status").gte("data", yearStart);
        const list = data ?? [];
        const total = list.length;
        // Match tolerante (case-insensitive + gênero). Status possíveis:
        // Agendado / Realizado / Não Realizado / Cancelado.
        const norm = (s: any) => (s ?? "").toString().trim().toLowerCase();
        const realizados = list.filter((c: any) => ["realizado", "realizada"].includes(norm(c.status))).length;
        const agendados = list.filter((c: any) => ["agendado", "agendada"].includes(norm(c.status))).length;
        // No módulo Comitês, cancelamento é registrado como "Não Realizado" — então essa
        // é a base de "não aconteceram" (inclui eventual "Cancelado" por segurança).
        const naoRealizados = list.filter((c: any) =>
          ["não realizado", "não realizada", "nao realizado", "nao realizada", "cancelado", "cancelada"].includes(
            norm(c.status),
          ),
        ).length;
        return { total, realizados, agendados, naoRealizados, year: now.getFullYear() };
      }),

      // === NPS ==============================================================
      safe(async () => {
        const { data } = await supabaseAdmin
          .from("nps_registros")
          .select("nota,data_pesquisa")
          .order("data_pesquisa", { ascending: false })
          .limit(500);
        if (!data?.length) return null;
        const latest = data[0].data_pesquisa;
        const sample = data.filter((r: any) => r.data_pesquisa === latest);
        const promoters = sample.filter((r: any) => Number(r.nota) >= 9).length;
        const detractors = sample.filter((r: any) => Number(r.nota) <= 6).length;
        const score = sample.length > 0 ? ((promoters - detractors) / sample.length) * 100 : 0;
        const zone = score >= 75 ? "excelente" : score >= 50 ? "ótimo" : score >= 0 ? "ok" : "ruim";
        // Série histórica: um ponto de NPS por data de pesquisa (cronológico)
        const byDate = new Map<string, any[]>();
        for (const r of data as any[]) {
          if (!r.data_pesquisa) continue;
          const arr = byDate.get(r.data_pesquisa) ?? [];
          arr.push(r);
          byDate.set(r.data_pesquisa, arr);
        }
        const series = Array.from(byDate.entries())
          .map(([d, rows]) => {
            const prom = rows.filter((r: any) => Number(r.nota) >= 9).length;
            const detr = rows.filter((r: any) => Number(r.nota) <= 6).length;
            const s = rows.length > 0 ? ((prom - detr) / rows.length) * 100 : 0;
            return { d, score: Math.round(s) };
          })
          .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0));
        return { score: Math.round(score), sampleSize: sample.length, zone, latest, series };
      }),

      // === PÍLULAS ==========================================================
      safe(async () => {
        const { data } = await supabaseAdmin
          .from("pilulas_si")
          .select("data")
          .gte("data", yearStart)
          .order("data", { ascending: false });
        return {
          count: (data ?? []).length,
          lastDate: data?.[0]?.data ?? null,
        };
      }),

      // === NÃO CONFORMIDADES ================================================
      safe(async () => {
        const { data } = await supabaseAdmin
          .from("nao_conformidades_manuais")
          .select("id,plataforma,fora_compliance,prazo_resolucao,aceite_risco,created_at")
          .order("created_at", { ascending: false })
          .limit(5);
        return { top: data ?? [] };
      }),

      // === MATURIDADE =======================================================
      // Usa somente o segmento Bernoulli (is_bernoulli = true) para o painel executivo.
      // Compara com a média do segmento Educação (kind = "edu"), igual ao módulo Maturidade.
      safe(async () => {
        const [{ data: segs }, { data: mat }] = await Promise.all([
          supabaseAdmin.from("segmentos").select("id,nome,is_bernoulli"),
          supabaseAdmin
            .from("maturidade")
            .select("segmento_id,periodo,periodo_ordem,nota_nist,nota_iso,delta_anterior")
            .order("periodo_ordem", { ascending: true }),
        ]);
        if (!mat?.length || !segs?.length) return null;

        const bernoulliId = (segs ?? []).find((s: any) => s.is_bernoulli)?.id ?? null;
        if (!bernoulliId) return null;

        // Histórico do Bernoulli ordenado por período
        const bernRows = (mat ?? [])
          .filter((r: any) => r.segmento_id === bernoulliId)
          .sort((a: any, b: any) => a.periodo_ordem - b.periodo_ordem);
        if (!bernRows.length) return null;

        // Avaliação mais recente — usa a última nota NÃO-NULA de cada métrica
        // (NIST e ISO podem ter sido avaliadas em períodos diferentes; o módulo
        // Maturidade também pega o último valor não-nulo por métrica).
        const last = bernRows[bernRows.length - 1];
        const lastNist = [...bernRows].reverse().find((r: any) => r.nota_nist != null) ?? null;
        const lastIso = [...bernRows].reverse().find((r: any) => r.nota_iso != null) ?? null;
        const nist = lastNist ? Math.round(Number(lastNist.nota_nist) * 100) / 100 : null;
        const iso = lastIso ? Math.round(Number(lastIso.nota_iso) * 100) / 100 : null;
        const periodoNist = lastNist?.periodo ?? null;
        const periodoIso = lastIso?.periodo ?? null;
        const delta = last.delta_anterior != null ? Math.round(Number(last.delta_anterior) * 100) / 100 : 0;
        const periodo = last.periodo;

        // Última nota de cada segmento para calcular média Educação
        const latestBySeg = new Map<string, { nist: number | null; iso: number | null }>();
        for (const r of mat ?? []) {
          const prev = latestBySeg.get(r.segmento_id) ?? { nist: null, iso: null };
          if (r.nota_nist != null) prev.nist = Number(r.nota_nist);
          if (r.nota_iso != null) prev.iso = Number(r.nota_iso);
          latestBySeg.set(r.segmento_id, prev);
        }

        let mediaEduNist: number | null = null;
        let mediaEduIso: number | null = null;
        for (const [segId, vals] of latestBySeg.entries()) {
          const seg = (segs ?? []).find((s: any) => s.id === segId);
          if (!seg || seg.is_bernoulli) continue;
          if (/^educa/i.test(seg.nome)) {
            if (vals.nist != null) mediaEduNist = vals.nist;
            if (vals.iso != null) mediaEduIso = vals.iso;
          }
        }

        // Delta vs Educação em pontos absolutos (mais claro para executivo)
        const vsEduNist = nist != null && mediaEduNist != null ? Math.round((nist - mediaEduNist) * 100) / 100 : null;
        const vsEduIso = iso != null && mediaEduIso != null ? Math.round((iso - mediaEduIso) * 100) / 100 : null;

        // Timeline para o gráfico de linha dupla (NIST + ISO por período)
        const history = bernRows.map((r: any) => ({
          periodo: r.periodo,
          nist: r.nota_nist != null ? Number(r.nota_nist) : null,
          iso: r.nota_iso != null ? Number(r.nota_iso) : null,
        }));

        return {
          nist,
          iso,
          delta,
          periodo,
          periodoNist,
          periodoIso,
          mediaEduNist,
          mediaEduIso,
          vsEduNist,
          vsEduIso,
          history,
        };
      }),

      // === FIREWALL EXTERNO (QRadar — ofensores externos) ====================
      // Soma os eventos por snapshot (sampled_at, ~1/dia via cron): o último ponto
      // da série = total atual (mesmo nº do SOC) e a série alimenta o evolutivo.
      safe(async () => {
        const { data: rows } = await supabaseAdmin
          .from("qradar_external_offenders")
          .select("event_count,sampled_at")
          .order("sampled_at", { ascending: false })
          .limit(1000);
        const list = (rows ?? []) as Array<{ event_count: number | null; sampled_at: string }>;
        if (!list.length) return null;
        const bySnap = new Map<string, number>();
        for (const r of list) {
          bySnap.set(r.sampled_at, (bySnap.get(r.sampled_at) ?? 0) + Number(r.event_count ?? 0));
        }
        const snaps = Array.from(bySnap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
        const series = snaps.map(([t, v]) => ({ t: t.slice(0, 10), v }));
        const total = snaps[snaps.length - 1][1];
        return { total, series };
      }),

      // === BLOQUEIOS · 30 DIAS (KPI "Ameaças contidas" do ribbon) ============
      // Conta os MESMOS eventos, na MESMA janela, que o Painel C-Level — assim os
      // dois painéis não mostram números diferentes para a mesma afirmação.
      // Antes o ribbon somava 4 parcelas com janelas distintas (Cloudflare 7d por
      // snapshot + QRadar instantâneo + Sophos 30d + vulns corrigidas 30d), e
      // vulnerabilidade corrigida não é ameaça contida — é remediação nossa.
      safe(async () => {
        const contar = async (tabela: string, coluna: string, extra?: (q: any) => any) => {
          let q = (supabaseAdmin as any).from(tabela).select("*", { count: "exact", head: true }).gte(coluna, since30);
          if (extra) q = extra(q);
          const { count, error } = await q;
          if (error) throw error;
          return count ?? 0;
        };
        const [borda, endpoint] = await Promise.all([
          contar("cloudflare_firewall_events", "datetime", (q) =>
            q.in("action", ["block", "challenge", "managed_challenge", "js_challenge"]),
          ),
          contar("sophos_alerts", "raised_at"),
        ]);
        return { total: borda + endpoint, borda, endpoint };
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      cloudflare,
      dominios,
      sophos,
      eps,
      mttr,
      vulns,
      phishing,
      treinamentos,
      wsus,
      disponibilidade,
      ia,
      comites,
      nps,
      pilulas,
      naoConformidades,
      maturidade,
      firewall,
      bloqueios30d,
    };
  });

export type ExecutiveOverview = Awaited<ReturnType<typeof getExecutiveOverview>>;
