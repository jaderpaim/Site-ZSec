/**
 * Fontes de cobertura de monitoramento que o cliente tem ligadas. Uma fonte
 * ausente ou desligada não conta para o status do ativo: sem ela, "não
 * aparece no Zabbix" não é falha, é só uma ferramenta que o cliente não usa.
 */
export type MonitoringSources = { siem: boolean; zabbix: boolean };

export const MONITORING_SOURCE_LABEL: Record<keyof MonitoringSources, string> = {
  siem: "SIEM",
  zabbix: "Zabbix",
};

/**
 * Status de cobertura de um ativo considerando só as fontes ligadas:
 * todas cobrem → "Ativo"; parte → "Alerta"; nenhuma → "Inativo".
 * Sem nenhuma fonte ligada não há como avaliar → null.
 */
export function coverageStatus(
  sources: MonitoringSources,
  covered: MonitoringSources,
): "Ativo" | "Alerta" | "Inativo" | null {
  const checks = (Object.keys(sources) as (keyof MonitoringSources)[]).filter((k) => sources[k]);
  if (checks.length === 0) return null;
  const hits = checks.filter((k) => covered[k]).length;
  return hits === checks.length ? "Ativo" : hits > 0 ? "Alerta" : "Inativo";
}

/** Fontes ligadas em que o ativo não aparece (ex.: ["Zabbix"]). */
export function missingSources(sources: MonitoringSources, covered: MonitoringSources): string[] {
  return (Object.keys(sources) as (keyof MonitoringSources)[])
    .filter((k) => sources[k] && !covered[k])
    .map((k) => MONITORING_SOURCE_LABEL[k]);
}
