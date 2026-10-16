// Vínculo entre cron jobs e módulos — usado no Cron Jobs (link "Abrir
// módulo" + quem pode disparar) e na etiqueta de sincronização do cabeçalho
// de cada módulo. Seguro para client e servidor (só dados).

/**
 * Quem pode disparar o job manualmente — espelha a regra que cada módulo já
 * aplicava no próprio botão "Sincronizar":
 * - execute: permissão "Executar" do módulo (admin e admin do módulo incluídos)
 * - analista: papel global admin, super admin ou analista
 * - module_admin: admin global ou admin do módulo
 */
export type CronRunRule = "execute" | "analista" | "module_admin";

export const CRON_JOB_MODULE: Record<
  string,
  { module: string; moduleLabel: string; rule: CronRunRule }
> = {
  "cloudflare-daily-sync": {
    module: "cloudflare-waf",
    moduleLabel: "Cloudflare WAF",
    rule: "execute",
  },
  "sophos-sync": { module: "sophos-xdr", moduleLabel: "Sophos XDR", rule: "analista" },
  "sophos-audit-sync": { module: "sophos-xdr", moduleLabel: "Sophos XDR", rule: "analista" },
  "qradar-sync": { module: "soc", moduleLabel: "SOC", rule: "analista" },
  "sek-zendesk-sync": { module: "soc", moduleLabel: "SOC", rule: "analista" },
  "gophish-sync": { module: "phishing", moduleLabel: "Phishing", rule: "analista" },
  "ranking-ia-sync": { module: "ranking-ia", moduleLabel: "Ranking IA", rule: "analista" },
  "sophos-ia-sync": { module: "ranking-ia", moduleLabel: "Ranking IA", rule: "analista" },
  "sast-sync": { module: "sast", moduleLabel: "SAST", rule: "module_admin" },
  "privacy-tools-sync": {
    module: "privacy-tools",
    moduleLabel: "Privacy Tools",
    rule: "module_admin",
  },
  "dlp-sync": { module: "dlp", moduleLabel: "DLP", rule: "module_admin" },
  "leakradar-sync": {
    module: "threat-intel",
    moduleLabel: "Threat Intelligence",
    rule: "module_admin",
  },
  "ad-status-sync": {
    module: "threat-intel",
    moduleLabel: "Threat Intelligence",
    rule: "module_admin",
  },
  "cti-monitor-run": {
    module: "threat-intel",
    moduleLabel: "Threat Intelligence",
    rule: "module_admin",
  },
  "vuln-snapshot": {
    module: "vulnerabilidades",
    moduleLabel: "Vulnerabilidades",
    rule: "module_admin",
  },
  "cmdb-device-alerts": { module: "cmdb", moduleLabel: "CMDB", rule: "module_admin" },
  "cmdb-dns-cache-refresh": { module: "cmdb", moduleLabel: "CMDB", rule: "module_admin" },
  "ssl-expiry-check": {
    module: "dominios-ssl",
    moduleLabel: "Domínios e SSL",
    rule: "module_admin",
  },
  "domains-expiry-check": {
    module: "dominios-ssl",
    moduleLabel: "Domínios e SSL",
    rule: "module_admin",
  },
  "fornecedores-check": {
    module: "fornecedores",
    moduleLabel: "Fornecedores",
    rule: "module_admin",
  },
  "zabbix-cache-refresh": {
    module: "disponibilidade",
    moduleLabel: "Disponibilidade",
    rule: "module_admin",
  },
  "gmud-escalate-inactive": { module: "gmud", moduleLabel: "GMUD", rule: "module_admin" },
  "dast-schedules-run": {
    module: "dast-scanner",
    moduleLabel: "DAST Scanner",
    rule: "module_admin",
  },
  "dast-stale-scan-sweep": {
    module: "dast-scanner",
    moduleLabel: "DAST Scanner",
    rule: "module_admin",
  },
};

/** Jobs exibidos na etiqueta de cada módulo (um job pode aparecer em mais de um). */
export const MODULE_CRON_JOBS: Record<string, string[]> = {
  "cloudflare-waf": ["cloudflare-daily-sync"],
  "sophos-xdr": ["sophos-sync", "sophos-audit-sync"],
  soc: ["qradar-sync", "sek-zendesk-sync"],
  phishing: ["gophish-sync"],
  "ranking-ia": ["ranking-ia-sync", "sophos-ia-sync"],
  sast: ["sast-sync"],
  "privacy-tools": ["privacy-tools-sync"],
  dlp: ["dlp-sync"],
  "threat-intel": ["leakradar-sync", "ad-status-sync", "cti-monitor-run"],
  vulnerabilidades: ["vuln-snapshot"],
  cmdb: ["cmdb-device-alerts", "cmdb-dns-cache-refresh"],
  "dominios-ssl": ["ssl-expiry-check", "domains-expiry-check"],
  fornecedores: ["fornecedores-check"],
  disponibilidade: ["zabbix-cache-refresh", "qradar-sync"],
  gmud: ["gmud-escalate-inactive"],
  "dast-scanner": ["dast-schedules-run", "dast-stale-scan-sweep"],
};

export const CRON_RULE_LABEL: Record<CronRunRule, string> = {
  execute: "Admin, admin do módulo ou permissão Executar",
  analista: "Admin ou Analista",
  module_admin: "Admin ou admin do módulo",
};
