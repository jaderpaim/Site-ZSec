// Agrupamento do campo sistema_operacional do CMDB em famílias. Usado no filtro
// de SO do CMDB e na cobertura do WSUS (que só conta servidores Windows).
// FreeBSD conta como Fortigate (o FortiOS é base FreeBSD).
export type OsFilterGroup = "Windows" | "Linux" | "Fortigate" | "Outros";

export function osFilterGroup(so: string | null | undefined): OsFilterGroup {
  const v = (so ?? "").trim().toLowerCase();
  if (v.startsWith("windows")) return "Windows";
  if (v === "fortigate" || v === "freebsd" || v.startsWith("fortios")) return "Fortigate";
  if (["ubuntu", "debian", "red hat", "rhel", "centos", "linux"].some((k) => v.includes(k))) return "Linux";
  return "Outros";
}
