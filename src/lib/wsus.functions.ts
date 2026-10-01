import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { osFilterGroup } from "@/lib/cmdb-os";

export type WsusDetailRow = {
  computer_name: string;
  needed: number;
  installed_or_na: number;
  failed: number;
  no_status: number;
  not_installed: number;
  has_alert: boolean;
  last_report_at: string | null;
  matched_in_cmdb: boolean;
};

export type WsusOverview = {
  totalServers: number;
  serversWithFailures: number;
  totalUpdatesNotInstalled: number;
  serversWithAlerts: number;
  top15: Array<{ computer_name: string; not_installed: number }>;
  cmdbActiveServers: number;
  coveredCount: number;
  coveragePct: number;
  details: WsusDetailRow[];
};

export const getWsusOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<WsusOverview> => {
    const { supabase } = context;

    const { data: wsus, error } = await supabase
      .from("wsus_servers" as any)
      .select("computer_name, needed, installed_or_na, failed, no_status, not_installed, has_alert, last_report_at")
      .order("not_installed", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (wsus ?? []) as unknown as Array<{
      computer_name: string;
      needed: number;
      installed_or_na: number;
      failed: number;
      no_status: number;
      not_installed: number;
      has_alert: boolean;
      last_report_at: string | null;
    }>;

    const { data: cmdb } = await supabase
      .from("cmdb_ativos")
      .select("ip_hostname, nome, tipo, status, sistema_operacional")
      .eq("status", "Ativo")
      .ilike("tipo", "%servidor%");

    const cmdbList = (cmdb ?? []).filter((c) => (c.ip_hostname ?? c.nome ?? "").trim() !== "");
    // WSUS só gerencia Windows — a cobertura considera apenas servidores com SO Windows
    // no CMDB. Servidor sem SO preenchido fica de fora do denominador.
    const cmdbWindowsList = cmdbList.filter((c) => osFilterGroup(c.sistema_operacional) === "Windows");
    const cmdbActiveServers = cmdbWindowsList.length;

    const wsusNameSet = new Set(rows.map((r) => r.computer_name.toLowerCase().trim()));
    const coveredCount = cmdbWindowsList.filter((c) => {
      const candidates = [c.ip_hostname, c.nome].filter(Boolean) as string[];
      return candidates.some((v) => wsusNameSet.has(v.toLowerCase().trim()));
    }).length;
    const coveragePct = cmdbActiveServers > 0 ? (coveredCount / cmdbActiveServers) * 100 : 0;

    const cmdbHostSet = new Set(
      cmdbList.flatMap((c) => [c.ip_hostname, c.nome].filter(Boolean) as string[]).map((v) => v.toLowerCase().trim()),
    );

    const details: WsusDetailRow[] = rows.map((r) => ({
      computer_name: r.computer_name,
      needed: r.needed,
      installed_or_na: r.installed_or_na,
      failed: r.failed,
      no_status: r.no_status,
      not_installed: r.not_installed,
      has_alert: r.has_alert,
      last_report_at: r.last_report_at,
      matched_in_cmdb: cmdbHostSet.has(r.computer_name.toLowerCase().trim()),
    }));

    return {
      totalServers: rows.length,
      serversWithFailures: rows.filter((r) => r.failed > 0).length,
      totalUpdatesNotInstalled: rows.reduce((acc, r) => acc + (r.not_installed ?? 0), 0),
      serversWithAlerts: rows.filter((r) => r.has_alert).length,
      top15: rows.slice(0, 15).map((r) => ({ computer_name: r.computer_name, not_installed: r.not_installed })),
      cmdbActiveServers,
      coveredCount,
      coveragePct,
      details,
    };
  });

export const deleteWsusServers = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ computerNames: z.array(z.string().min(1).max(255)).min(1).max(1000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    if (roleRow?.role !== "admin" && roleRow?.role !== "super_admin") {
      throw new Error("Forbidden: apenas admin global pode excluir servidores WSUS");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("wsus_servers" as any)
      .delete()
      .in("computer_name", data.computerNames);
    if (error) throw new Error(error.message);
    return { ok: true, deleted: data.computerNames.length };
  });
