import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission, requireGlobalAdminRole } from "@/lib/authz";
import { logAudit } from "@/lib/audit-log.functions";
import { notifyIndisponibilidadeChanged } from "@/lib/disponibilidade-notifications.server";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type IndisponibilidadeRow = {
  id: string;
  ativo_id: string;
  ativo_nome: string;
  ativo_tipo: string;
  inicio: string;
  fim: string | null;
  duracao_min: number | null;
  motivo: string | null;
  observacao: string | null;
  created_at: string;
  updated_at: string;
};

export const listIndisponibilidades = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "disponibilidade", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("indisponibilidades")
      .select("id, ativo_id, inicio, fim, duracao_min, motivo, observacao, created_at, updated_at")
      .order("inicio", { ascending: false });
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = Array.from(new Set(rows.map((r) => r.ativo_id)));
    let ativos: Record<string, { nome: string; tipo: string }> = {};
    if (ids.length > 0) {
      const { data: a } = await sb.from("cmdb_ativos").select("id, nome, tipo").in("id", ids);
      ativos = Object.fromEntries((a ?? []).map((x) => [x.id, { nome: x.nome, tipo: x.tipo }]));
    }
    return rows.map((r) => ({
      ...r,
      ativo_nome: ativos[r.ativo_id]?.nome ?? "—",
      ativo_tipo: ativos[r.ativo_id]?.tipo ?? "—",
    })) as IndisponibilidadeRow[];
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  ativo_id: z.string().uuid(),
  inicio: z.string().min(1),
  fim: z.string().optional().nullable(),
  motivo: z.string().max(500).optional().nullable(),
  observacao: z.string().max(2000).optional().nullable(),
});

export const upsertIndisponibilidade = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "disponibilidade", data.id ? "edit" : "create");
    const sb = admin();
    const payload = {
      ativo_id: data.ativo_id,
      inicio: new Date(data.inicio).toISOString(),
      fim: data.fim ? new Date(data.fim).toISOString() : null,
      motivo: data.motivo?.trim() || null,
      observacao: data.observacao?.trim() || null,
    };
    if (data.id) {
      const { error } = await sb.from("indisponibilidades").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);

      // Auditoria: quem tem permissão de edição pode alterar o registro de
      // QUALQUER ativo, não só o que criou — loga + alerta pra dar
      // rastreabilidade (mesmo padrão de create/edit de DNS na Cloudflare).
      const [{ data: profile }, { data: ativo }] = await Promise.all([
        sb.from("profiles").select("email").eq("id", context.userId).maybeSingle(),
        sb.from("cmdb_ativos").select("nome").eq("id", data.ativo_id).maybeSingle(),
      ]);
      const actorEmail = profile?.email ?? null;
      const ativoNome = ativo?.nome ?? data.ativo_id;
      await Promise.all([
        logAudit({
          userId: context.userId,
          modulo: "disponibilidade",
          acao: "editar_indisponibilidade",
          descricao: `Indisponibilidade de "${ativoNome}" editada`,
          detalhes: { indisponibilidade_id: data.id, ...payload },
        }),
        notifyIndisponibilidadeChanged(sb, { kind: "update", ativoNome, actorEmail }),
      ]);

      return { ok: true, id: data.id };
    }
    // created_by nunca vem do cliente: esse insert usa o client service-role
    // (bypassa RLS), então a proteção tem que ser aqui -- não dá pra confiar
    // em data.created_by pra dizer quem registrou a indisponibilidade manual.
    const { data: inserted, error } = await sb
      .from("indisponibilidades")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteIndisponibilidade = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "disponibilidade", "delete");
    // Excluir é destrutivo e irreversível — exige perfil global admin/super
    // admin, além da permissão granular (mesmo padrão de Cloudflare Rules).
    await requireGlobalAdminRole(context.supabase, context.userId);
    const sb = admin();

    const { data: existing } = await sb.from("indisponibilidades").select("ativo_id").eq("id", data.id).maybeSingle();

    const { error } = await sb.from("indisponibilidades").delete().eq("id", data.id);
    if (error) throw new Error(error.message);

    const [{ data: profile }, { data: ativo }] = await Promise.all([
      sb.from("profiles").select("email").eq("id", context.userId).maybeSingle(),
      existing?.ativo_id
        ? sb.from("cmdb_ativos").select("nome").eq("id", existing.ativo_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const actorEmail = profile?.email ?? null;
    const ativoNome = ativo?.nome ?? existing?.ativo_id ?? data.id;
    await Promise.all([
      logAudit({
        userId: context.userId,
        modulo: "disponibilidade",
        acao: "excluir_indisponibilidade",
        descricao: `Indisponibilidade de "${ativoNome}" excluída`,
        detalhes: { indisponibilidade_id: data.id, ativo_id: existing?.ativo_id ?? null },
      }),
      notifyIndisponibilidadeChanged(sb, { kind: "delete", ativoNome, actorEmail }),
    ]);

    return { ok: true };
  });

export type CmdbAtivoMin = {
  id: string;
  nome: string;
  tipo: string;
  ip_hostname: string | null;
  criticidade: string | null;
};

export const listCmdbAtivosMin = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "disponibilidade", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("cmdb_ativos")
      .select("id, nome, tipo, ip_hostname, criticidade")
      .order("nome");
    if (error) throw new Error(error.message);
    return (data ?? []) as CmdbAtivoMin[];
  });

export type SiemSource = { name: string; status: string; synced_at?: string | null };

export const listSiemSources = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "disponibilidade", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("qradar_log_sources")
      .select("name, status")
      .or("name.ilike.%FGT%,name.ilike.%WinCollect%");
    if (error) throw new Error(error.message);
    return (data ?? []) as SiemSource[];
  });

// Cron qradar-sync roda a cada 2h — se a última sincronização bem-sucedida de
// qradar_log_sources for mais antiga que isso (com folga), o "success"
// congelado ali não é mais uma confirmação confiável de cobertura SIEM.
// Baseado em synced_at (só avança quando o upsert realmente roda com sucesso)
// em vez de cron_job_runs porque essa função roda NO MEIO do próprio sync
// (chamada por runQradarSync logo após syncLogSources) — nesse instante
// cron_job_runs.last_ok ainda está null (recordCronAttemptStart marca isso
// antes do sync começar), então usar o status do cron aqui sempre daria
// falso "desatualizado" em toda execução, mesmo as bem-sucedidas.
const SIEM_SYNC_STALE_MS = 5 * 60 * 60 * 1000; // 2h de ciclo + folga
function isSiemDataStale(sources: SiemSource[]): boolean {
  if (sources.length === 0) return false;
  const newest = Math.max(...sources.map((s) => (s.synced_at ? new Date(s.synced_at).getTime() : 0)));
  return newest === 0 || Date.now() - newest > SIEM_SYNC_STALE_MS;
}

// ── Regra de status do CMDB (Ativo/Alerta/Inativo) — mesma regra do CmdbReal,
// baseada na cobertura SIEM (qradar_log_sources) e Zabbix ────────────────────
function buildSiemSetsServer(sources: SiemSource[]) {
  const hosts = new Set<string>();
  const ips = new Set<string>();
  sources
    .filter((s) => !s.status || s.status === "success")
    .forEach(({ name }) => {
      if (name.toLowerCase().includes("wincollect")) {
        const parts = name.split(" - ");
        const host = (parts[parts.length - 1] ?? "").trim().toLowerCase();
        if (host) hosts.add(host);
      } else if (name.toLowerCase().includes("fgt")) {
        const atIdx = name.lastIndexOf(" @ ");
        if (atIdx >= 0) {
          const ip = name
            .slice(atIdx + 3)
            .trim()
            .toLowerCase();
          if (ip) ips.add(ip);
        } else {
          hosts.add(name.trim().toLowerCase());
        }
      }
    });
  return { hosts, ips };
}

function isInSiemServer(
  a: { nome: string; tipo: string | null; ip_hostname: string | null },
  hosts: Set<string>,
  ips: Set<string>,
) {
  const isFw = (a.tipo ?? "").toLowerCase().includes("firewall");
  const cand = [a.nome, a.ip_hostname].filter(Boolean) as string[];
  return cand.some((v) => {
    const val = v.trim().toLowerCase();
    if (isFw) return ips.has(val) || hosts.has(val);
    return hosts.has(val);
  });
}

function isInZabbixServer(a: { nome: string; ip_hostname: string | null }, hosts: Set<string>, ips: Set<string>) {
  const cand = [a.nome, a.ip_hostname].filter(Boolean) as string[];
  return cand.some((v) => {
    const val = v.trim().toLowerCase();
    return hosts.has(val) || ips.has(val);
  });
}

/**
 * Lógica núcleo do sync — pode ser chamada diretamente de outros módulos server-side
 * (ex: qradar.server.ts) sem passar pelo wrapper createServerFn.
 *
 * Indisponível = ativo do CMDB sem cobertura SIEM e sem cobertura Zabbix (status "Inativo").
 */
type AtivoRow = { id: string; nome: string; tipo: string | null; ip_hostname: string | null };
type OpenRecord = { id: string; ativo_id: string; inicio: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function syncIndisponibilidadesCore(sb: any): Promise<{ created: number; closed: number }> {
  const { getZabbixCreds, listMonitoredHosts } = await import("./zabbix.server");
  const { loadMonitoringSources } = await import("./monitoring.server");
  const { coverageStatus } = await import("./monitoring");

  const [sources, ativosRes, siemRes, openRes] = await Promise.all([
    loadMonitoringSources(sb),
    sb.from("cmdb_ativos").select("id, nome, tipo, ip_hostname"),
    sb.from("qradar_log_sources").select("name, status, synced_at").or("name.ilike.%FGT%,name.ilike.%WinCollect%"),
    sb.from("indisponibilidades").select("id, ativo_id, inicio").is("fim", null),
  ]);

  const ativos: AtivoRow[] = ativosRes.data ?? [];
  const siemSources: SiemSource[] = siemRes.data ?? [];
  const openRecords: OpenRecord[] = openRes.data ?? [];

  // Sync do QRadar desatualizado → não confia no "success" congelado: o SIEM
  // fica de fora desta rodada (decide só o Zabbix, se ligado).
  const siemStale = isSiemDataStale(siemSources);
  const { hosts: siemHosts, ips: siemIps } = buildSiemSetsServer(siemStale ? [] : siemSources);
  let zbxFailed = false;

  const zbxHosts = new Set<string>();
  const zbxIps = new Set<string>();
  try {
    const creds = await getZabbixCreds();
    if (creds) {
      // listMonitoredHosts retorna { available, unknown } — inclui ambos (mesmo critério do CmdbReal)
      const { available: zbxAvail, unknown: zbxUnk } = await listMonitoredHosts(creds);
      for (const h of [...zbxAvail, ...zbxUnk]) {
        if (h.host) zbxHosts.add(h.host.trim().toLowerCase());
        if (h.name) zbxHosts.add(h.name.trim().toLowerCase());
        for (const i of h.interfaces ?? []) {
          if (i.ip) zbxIps.add(i.ip.trim().toLowerCase());
          if (i.dns) zbxHosts.add(i.dns.trim().toLowerCase());
        }
      }
    }
  } catch {
    // Zabbix fora do ar — fica de fora desta rodada (decide só o SIEM, se ligado)
    zbxFailed = true;
  }

  // Só as fontes ligadas e respondendo contam. Se a fonte ligada não pôde ser
  // lida, a rodada não mexe em nada: encerrar ou abrir registros aqui seria
  // palpite. Sem nenhuma fonte ligada, nada fica indisponível (registros
  // abertos antes são encerrados abaixo).
  const usable = { siem: sources.siem && !siemStale, zabbix: sources.zabbix && !zbxFailed };
  if ((sources.siem || sources.zabbix) && !usable.siem && !usable.zabbix) {
    return { created: 0, closed: 0 };
  }
  const unavailableIds = new Set<string>(
    ativos
      .filter(
        (a) =>
          coverageStatus(usable, {
            siem: isInSiemServer(a, siemHosts, siemIps),
            zabbix: isInZabbixServer(a, zbxHosts, zbxIps),
          }) === "Inativo",
      )
      .map((a) => a.id),
  );

  const openByAtivo = new Map<string, OpenRecord>(openRecords.map((r) => [r.ativo_id, r]));
  const now = new Date().toISOString();

  const toCreate = [...unavailableIds].filter((id) => !openByAtivo.has(id));
  if (toCreate.length > 0) {
    await sb
      .from("indisponibilidades")
      .insert(toCreate.map((ativo_id) => ({ ativo_id, inicio: now })))
      .throwOnError();

    // Notifica Teams/Telegram para cada novo ativo que ficou indisponível
    try {
      const { notifyNewIndisponibilidades } = await import("./disponibilidade-notifications.server");
      const newAtivos = ativos.filter((a) => toCreate.includes(a.id));
      await notifyNewIndisponibilidades(sb, newAtivos);
    } catch {
      // notificações não bloqueiam o sync
    }
  }

  const toClose = [...openByAtivo.keys()].filter((id) => !unavailableIds.has(id));
  for (const ativoId of toClose) {
    const record = openByAtivo.get(ativoId)!;
    await sb.from("indisponibilidades").update({ fim: now }).eq("id", record.id).throwOnError();
  }

  return { created: toCreate.length, closed: toClose.length };
}

/**
 * Endpoint HTTP para chamada client-side (ex: Disponibilidade.tsx).
 */
export const syncIndisponibilidades = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "disponibilidade", "edit");
    return syncIndisponibilidadesCore(admin());
  });
