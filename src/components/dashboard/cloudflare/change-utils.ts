import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getZoneChanges, type ZoneChange } from "@/lib/cloudflare.hosts.functions";

// ── Leitura dos registros de audit_logs gravados pelo módulo ─────────────────
export type ChangeArea = "DNS" | "Regras" | "Cache" | "Load Balancing" | "Outros";
type Diff = { path: string; before: unknown; after: unknown };
type Details = {
  name?: string;
  type?: string;
  content?: string;
  hostnames?: string[];
  files?: string[];
  purge_everything?: boolean;
  resourceType?: string;
  description?: string;
  category?: string;
  enabled?: boolean | null;
  changes?: Diff[];
};

// Ação feita no painel da Cloudflare (log de auditoria da conta)
function cfArea(resource: string, type: string): ChangeArea {
  const r = `${resource} ${type}`.toLowerCase();
  if (/dns|rec_/.test(r)) return "DNS";
  if (/purge|cache/.test(r)) return "Cache";
  if (/load_?balanc|pool|monitor/.test(r)) return "Load Balancing";
  if (/rule|firewall|waf|ruleset|page_?rule|filter/.test(r)) return "Regras";
  return "Outros";
}
const CF_VERB: Record<string, string> = {
  rec_add: "criou o registro",
  rec_set: "editou o registro",
  rec_del: "excluiu o registro",
  purge: "limpou o cache",
  create: "criou",
  add: "criou",
  update: "alterou",
  change: "alterou",
  delete: "excluiu",
  remove: "excluiu",
};

export function changeArea(c: ZoneChange): ChangeArea {
  if (c.action.startsWith("cf:"))
    return cfArea(changeDetails(c).resourceType ?? "", c.action.slice(3));
  if (c.action.endsWith("_dns")) return "DNS";
  if (c.action.endsWith("_rule")) return "Regras";
  if (c.action === "purge_cache") return "Cache";
  if (c.action === "update_managed") return "Regras";
  if (c.action === "update_lb") return "Load Balancing";
  return "Outros";
}
export function changeDetails(c: ZoneChange): Details {
  return (
    c.details && typeof c.details === "object" && !Array.isArray(c.details) ? c.details : {}
  ) as Details;
}
export function changeWho(c: ZoneChange): string {
  return c.userEmail ? c.userEmail.split("@")[0].replace(/[._]/g, " ") : "Sistema";
}
export function changeInitials(c: ZoneChange): string {
  const parts = changeWho(c).split(" ").filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}
/** Hosts que a alteração afeta (para cruzar com o host aberto) */
export function changeHosts(c: ZoneChange): string[] {
  const d = changeDetails(c);
  if (d.name) return [String(d.name).toLowerCase()];
  if (Array.isArray(d.hostnames) && d.hostnames.length)
    return d.hostnames.map((h) => String(h).toLowerCase());
  if (Array.isArray(d.files))
    return [
      ...new Set(
        d.files.map((u) => {
          try {
            return new URL(u).hostname.toLowerCase();
          } catch {
            return "";
          }
        }),
      ),
    ].filter(Boolean);
  return [];
}
export function changeText(c: ZoneChange): { verb: string; target: string } {
  const d = changeDetails(c);
  if (c.action.startsWith("cf:")) {
    const type = c.action.slice(3);
    const res = (d.resourceType ?? "").replace(/[._]/g, " ");
    const verb = CF_VERB[type] ?? CF_VERB[type.split("_").pop() ?? ""] ?? `alterou (${type})`;
    return {
      verb: res && !type.startsWith("rec_") ? `${verb} ${res}` : verb,
      target: d.name ?? "",
    };
  }
  switch (c.action) {
    case "create_dns":
      return { verb: "criou o registro", target: `${d.name ?? ""} (${d.type ?? ""})` };
    case "update_dns":
      return { verb: "editou o registro", target: `${d.name ?? ""} (${d.type ?? ""})` };
    case "purge_cache":
      return d.purge_everything
        ? { verb: "limpou todo o cache da zona", target: "" }
        : d.files?.length
          ? { verb: `limpou o cache de ${d.files.length} URL(s)`, target: d.files.join(", ") }
          : { verb: "limpou o cache de", target: (d.hostnames ?? []).join(", ") };
    case "update_managed":
      return { verb: "alterou o managed ruleset", target: `“${d.description ?? ""}”` };
    case "update_lb":
      return { verb: "alterou a pool", target: `“${d.description ?? ""}”` };
    case "create_rule":
      return { verb: "criou a regra", target: `“${d.description ?? ""}”` };
    case "update_rule":
      return { verb: "editou a regra", target: `“${d.description ?? ""}”` };
    case "toggle_rule":
      return {
        verb: d.enabled ? "habilitou a regra" : "desabilitou a regra",
        target: `“${d.description ?? ""}”`,
      };
    case "delete_rule":
      return { verb: "excluiu a regra", target: `“${d.description ?? ""}”` };
    default:
      return { verb: c.action.replace(/_/g, " "), target: "" };
  }
}
export function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
export const fmtVal = (v: unknown) =>
  v === null || v === undefined || v === ""
    ? "vazio"
    : typeof v === "object"
      ? JSON.stringify(v)
      : String(v);

export function useZoneChanges(zoneId: string | null, days: number, enabled: boolean) {
  const fetchChanges = useServerFn(getZoneChanges);
  return useQuery({
    queryKey: ["cf-zone-changes", zoneId, days],
    enabled: !!zoneId && enabled,
    queryFn: () => fetchChanges({ data: { zoneId: zoneId!, days } }),
    refetchInterval: 60_000,
  });
}
