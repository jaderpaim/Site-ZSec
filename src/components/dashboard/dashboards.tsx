import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";
import { KpiCard, Panel, Badge } from "./primitives";
import { CloudflareDashboardReal } from "./CloudflareReal";
import { SophosRealDashboard } from "./SophosReal";
import { PoliticasDashboardImpl } from "./PoliticasDashboardImpl";
import { MaturidadeExecutive } from "./maturidade/MaturidadeExecutive";
import { WsusDashboard } from "./WsusReal";
import { DisponibilidadeDashboard } from "./Disponibilidade";
import { VulnerabilidadesRealDashboard } from "./VulnerabilidadesReal";
import { DepartamentosDashboard } from "./Departamentos";
import { UploadDashboard } from "./Upload";
import { IntegracoesDashboard } from "./Integracoes";
import { LogsDashboard } from "./Logs";
import { GmudDashboard } from "./GmudReal";
import { SmtpConfigDashboard } from "./SmtpConfig";
import { DadosOrganizacaoDashboard } from "./DadosOrganizacao";
import { UsersManagementDashboard } from "./UsersManagement";
import { DominiosSslDashboard } from "./DominiosSsl";
import { AprovadoresDashboard } from "./Aprovadores";
import { FornecedoresDashboard } from "./Fornecedores";
import { NpsDashboard } from "./NpsReal";
import { CmdbDashboard } from "./CmdbReal";
import { AplicacoesDashboard } from "./Aplicacoes";
import { PilulasSiDashboard } from "./PilulasSi";
import { TreinamentosDashboard } from "./Treinamentos";
import { BenchmarkDashboard } from "./Benchmark";
import { ComitesDashboard } from "./Comites";
import { PhishingDashboard } from "./Phishing";
import { NaoConformidadeDashboard } from "./NaoConformidade";
import { PainelExecutivoDashboard } from "./PainelExecutivo";
import { SophosExcecoesDashboard } from "./SophosExcecoes";
import { SsoLdapDashboard } from "./SsoLdap";
import { AlertasConfigDashboard } from "./AlertasConfig";
import { CronJobsDashboard } from "./CronJobs";
import { PrivacyToolsRealDashboard } from "./PrivacyToolsReal";
import { DastScannerDashboard } from "./DastScanner";
import { ShadowItDashboard } from "./ShadowIt";
import { SastDashboard } from "./Sast";
import { DlpDashboard } from "./Dlp";
import { ThreatIntelDashboard } from "./ThreatIntel";

const C = {
  primary: "oklch(0.66 0.18 254)",
  success: "oklch(0.70 0.16 160)",
  warning: "oklch(0.78 0.16 75)",
  danger: "oklch(0.65 0.22 25)",
  purple: "oklch(0.62 0.18 300)",
  grid: "oklch(0.30 0.014 250)",
  axis: "oklch(0.66 0.02 250)",
};
const palette = [C.primary, C.success, C.warning, C.danger, C.purple];

const tooltipStyle = {
  contentStyle: {
    background: "oklch(0.20 0.014 250)",
    border: "1px solid oklch(0.30 0.014 250)",
    borderRadius: 6,
    fontSize: 12,
    color: "oklch(0.96 0.005 250)",
  },
  cursor: { fill: "oklch(0.27 0.014 250 / 0.4)" },
};

function Grid({ children, cols = 4 }: { children: React.ReactNode; cols?: number }) {
  const c =
    { 2: "md:grid-cols-2", 3: "md:grid-cols-3", 4: "md:grid-cols-4", 5: "md:grid-cols-5" }[cols] ?? "md:grid-cols-4";
  return <div className={`grid grid-cols-1 ${c} gap-4`}>{children}</div>;
}

/* ===== VULNERABILIDADES ===== */
export function VulnerabilidadesDashboard() {
  const monthly = [
    { m: "Jan", desc: 120, cor: 95, acc: 25 },
    { m: "Fev", desc: 140, cor: 130, acc: 35 },
    { m: "Mar", desc: 110, cor: 145, acc: 0 },
    { m: "Abr", desc: 160, cor: 140, acc: 20 },
    { m: "Mai", desc: 95, cor: 170, acc: -55 },
    { m: "Jun", desc: 80, cor: 180, acc: -100 },
  ];
  const crit = [
    { name: "Crítica", value: 42, fill: C.danger },
    { name: "Alta", value: 187, fill: C.warning },
    { name: "Média", value: 612, fill: C.primary },
    { name: "Baixa", value: 641, fill: C.success },
  ];
  const resp = [
    { name: "Infra", value: 45 },
    { name: "DevOps", value: 30 },
    { name: "Segurança", value: 15 },
    { name: "Cloud", value: 10 },
  ];
  const shodan = [
    { ip: "45.122.34.102", host: "vpn.corp.net", ports: "443,1194", svc: "OpenVPN", risk: "warning" },
    { ip: "182.16.0.42", host: "db-prod-01", ports: "5432", svc: "PostgreSQL", risk: "danger" },
    { ip: "91.203.4.15", host: "api.gateway.prod", ports: "80,443", svc: "HTTP/S", risk: "success" },
    { ip: "200.45.12.8", host: "mail.corp.net", ports: "25,465,587", svc: "SMTP", risk: "warning" },
  ];

  return (
    <div className="space-y-6">
      <Grid>
        <KpiCard
          label="Vulnerabilidades Ativas"
          value="1.482"
          delta={{ value: "1.8%", positive: true }}
          hint="vs ciclo anterior"
          accent="primary"
        />
        <KpiCard label="Ciclo Anterior" value="1.510" hint="meta: 1.200" />
        <KpiCard
          label="Críticas Pendentes"
          value="42"
          delta={{ value: "12%" }}
          hint="> 48h em aberto"
          accent="danger"
        />
        <KpiCard
          label="MTTR Médio"
          value="4.2d"
          delta={{ value: "1.1d", positive: true }}
          hint="SLA: 5.0d"
          accent="success"
        />
      </Grid>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Evolução Mensal" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis dataKey="m" stroke={C.axis} fontSize={11} />
              <YAxis stroke={C.axis} fontSize={11} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="desc" name="Descobertas" fill={C.danger} radius={[2, 2, 0, 0]} />
              <Bar dataKey="cor" name="Corrigidas" fill={C.success} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Por Criticidade">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={crit} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {crit.map((c, i) => (
                  <Cell key={i} fill={c.fill} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Vulnerabilidades por Responsável">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={resp} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis type="number" stroke={C.axis} fontSize={11} />
              <YAxis type="category" dataKey="name" stroke={C.axis} fontSize={11} width={80} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="value" fill={C.primary} radius={[0, 2, 2, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Shodan — Ativos Expostos" className="lg:col-span-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-mono-xs text-muted-foreground">
                <th className="text-left pb-2">IP</th>
                <th className="text-left pb-2">Host</th>
                <th className="text-left pb-2">Portas</th>
                <th className="text-left pb-2">Serviço</th>
                <th className="text-left pb-2">Risco</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {shodan.map((r) => (
                <tr key={r.ip} className="hover:bg-accent/40">
                  <td className="py-2.5 font-mono text-xs">{r.ip}</td>
                  <td className="py-2.5 text-muted-foreground">{r.host}</td>
                  <td className="py-2.5 font-mono text-xs">{r.ports}</td>
                  <td className="py-2.5 text-muted-foreground">{r.svc}</td>
                  <td className="py-2.5">
                    <Badge tone={r.risk as any}>
                      {r.risk === "danger" ? "Crítico" : r.risk === "warning" ? "Médio" : "Baixo"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}

/* ===== POLÍTICAS ===== */
export function PoliticasDashboard() {
  return <PoliticasDashboardImpl />;
}

/* ===== MATURIDADE ===== */
export function MaturidadeDashboard() {
  return <MaturidadeExecutive />;
}

/* ===== RANKING IA ===== */
import { RankingIaDashboard } from "./RankingIaReal";
export { RankingIaDashboard };

/* ===== ORGANIZAÇÃO ===== */
import { OrganizacaoDashboard } from "./OrganizacaoSI";
export { OrganizacaoDashboard };

/* ===== SOPHOS XDR ===== */
export function SophosDashboard() {
  const events = [
    { d: "01", blocked: 124, detected: 24 },
    { d: "05", blocked: 168, detected: 32 },
    { d: "10", blocked: 212, detected: 48 },
    { d: "15", blocked: 142, detected: 28 },
    { d: "20", blocked: 298, detected: 64 },
    { d: "25", blocked: 187, detected: 38 },
    { d: "30", blocked: 145, detected: 22 },
  ];
  const top = [
    { u: "j.silva@corp", t: 18 },
    { u: "m.santos@corp", t: 14 },
    { u: "p.lima@corp", t: 11 },
    { u: "a.costa@corp", t: 9 },
    { u: "r.alves@corp", t: 7 },
  ];
  const detectionTypes = [
    { name: "Malware", value: 1240, fill: C.danger },
    { name: "PUA", value: 642, fill: C.warning },
    { name: "Ransomware", value: 124, fill: C.purple },
    { name: "Exploit", value: 286, fill: C.primary },
    { name: "Web Threat", value: 555, fill: C.success },
  ];
  const deviceStatus = [
    { name: "Saudáveis", value: 1284, fill: C.success },
    { name: "Com alerta", value: 98, fill: C.warning },
    { name: "Comprometidos", value: 12, fill: C.danger },
    { name: "Offline", value: 26, fill: C.axis },
  ];
  const recentDetections = [
    {
      ts: "10:42",
      host: "DESKTOP-AC12",
      user: "j.silva",
      type: "Malware",
      threat: "Troj/Agent-BHX",
      action: "Bloqueado",
      sev: "danger",
    },
    {
      ts: "10:18",
      host: "NB-MARKETING-04",
      user: "m.santos",
      type: "PUA",
      threat: "PUA/CoinMiner-A",
      action: "Quarentena",
      sev: "warning",
    },
    {
      ts: "09:55",
      host: "SRV-FILE-02",
      user: "system",
      type: "Ransomware",
      threat: "Mal/Ransom-LKR",
      action: "Bloqueado",
      sev: "danger",
    },
    {
      ts: "09:31",
      host: "NB-FIN-12",
      user: "a.costa",
      type: "Web Threat",
      threat: "Mal/Phish-URL",
      action: "Bloqueado",
      sev: "warning",
    },
    {
      ts: "08:47",
      host: "DESKTOP-DV21",
      user: "p.lima",
      type: "Exploit",
      threat: "Exp/20240-A",
      action: "Bloqueado",
      sev: "danger",
    },
  ];

  return (
    <div className="space-y-6">
      <Grid cols={5}>
        <KpiCard label="Ameaças Bloqueadas" value="2.847" delta={{ value: "8%", positive: true }} accent="success" />
        <KpiCard label="Dispositivos Monitorados" value="1.420" hint="1.284 saudáveis" />
        <KpiCard label="Criptografia Ativa" value="98%" accent="success" hint="1.392 de 1.420" />
        <KpiCard label="Detecções 24h" value="42" accent="warning" />
        <KpiCard label="Usuários Afetados" value="59" accent="primary" />
      </Grid>
      <Panel title="Evolutivo — Ameaças Bloqueadas vs Detecções">
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={events}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
            <XAxis dataKey="d" stroke={C.axis} fontSize={11} />
            <YAxis stroke={C.axis} fontSize={11} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area
              type="monotone"
              dataKey="blocked"
              name="Bloqueadas"
              stroke={C.success}
              fill={C.success}
              fillOpacity={0.25}
            />
            <Area
              type="monotone"
              dataKey="detected"
              name="Detectadas"
              stroke={C.danger}
              fill={C.danger}
              fillOpacity={0.25}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Panel>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Panel title="Tipos de Detecção">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={detectionTypes} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85}>
                {detectionTypes.map((c, i) => (
                  <Cell key={i} fill={c.fill} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Status dos Dispositivos">
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={deviceStatus} dataKey="value" nameKey="name" innerRadius={45} outerRadius={85}>
                {deviceStatus.map((c, i) => (
                  <Cell key={i} fill={c.fill} />
                ))}
              </Pie>
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Top Usuários — Ameaças">
          <div className="space-y-2.5">
            {top.map((u) => (
              <div key={u.u} className="flex items-center justify-between text-sm">
                <span className="font-mono text-xs">{u.u}</span>
                <Badge tone="danger">{u.t}</Badge>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      <Panel title="Detecções Recentes">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-mono-xs text-muted-foreground">
              <th className="text-left pb-2">Hora</th>
              <th className="text-left pb-2">Dispositivo</th>
              <th className="text-left pb-2">Usuário</th>
              <th className="text-left pb-2">Tipo</th>
              <th className="text-left pb-2">Ameaça</th>
              <th className="text-left pb-2">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {recentDetections.map((d, i) => (
              <tr key={i} className="hover:bg-accent/40">
                <td className="py-2.5 font-mono text-xs">{d.ts}</td>
                <td className="py-2.5 font-mono text-xs">{d.host}</td>
                <td className="py-2.5 text-muted-foreground">{d.user}</td>
                <td className="py-2.5">{d.type}</td>
                <td className="py-2.5 font-mono text-xs text-muted-foreground">{d.threat}</td>
                <td className="py-2.5">
                  <Badge tone={d.sev as any}>{d.action}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-mono-xs text-muted-foreground mt-3">
          * Dados de exemplo — a integração real com a API Sophos Central será habilitada após o cadastro das
          credenciais em Integrações.
        </p>
      </Panel>
    </div>
  );
}

/* ===== PRIVACY TOOLS ===== (componente movido para ./PrivacyToolsReal) */

/* ===== CLOUDFLARE WAF ===== */
export function CloudflareDashboard() {
  return <CloudflareDashboardReal />;
}

/* ===== SOC ===== */
import { SocRealDashboard as SocDashboard } from "./SocReal";
export { SocDashboard };

/* ===== PHISHING → src/components/dashboard/Phishing.tsx ===== */

/* ===== WSUS (movido para ./WsusReal) ===== */

/* ===== COMITÊS (movido para ./Comites) ===== */

/* ===== NÃO CONFORMIDADE → src/components/dashboard/NaoConformidade.tsx ===== */

/* ===== DISPONIBILIDADE → src/components/dashboard/Disponibilidade.tsx ===== */

/* ===== Map slug → component ===== */
export const DASHBOARDS: Record<string, () => React.ReactElement> = {
  "painel-executivo": PainelExecutivoDashboard,
  "excecao-sophos": SophosExcecoesDashboard,
  vulnerabilidades: VulnerabilidadesRealDashboard,
  "dast-scanner": DastScannerDashboard,
  "shadow-it": ShadowItDashboard,
  sast: SastDashboard,
  dlp: DlpDashboard,
  "threat-intel": ThreatIntelDashboard,
  politicas: PoliticasDashboard,
  gmud: GmudDashboard,
  maturidade: MaturidadeDashboard,
  "ranking-ia": RankingIaDashboard,
  organizacao: OrganizacaoDashboard,
  "sophos-xdr": SophosRealDashboard,
  "privacy-tools": PrivacyToolsRealDashboard,
  "cloudflare-waf": CloudflareDashboard,
  soc: SocDashboard,
  phishing: PhishingDashboard,
  wsus: WsusDashboard,
  comites: ComitesDashboard,
  "nao-conformidade": NaoConformidadeDashboard,
  disponibilidade: DisponibilidadeDashboard,
  departamentos: DepartamentosDashboard,
  integracoes: IntegracoesDashboard,
  upload: UploadDashboard,
  logs: LogsDashboard,
  smtp: SmtpConfigDashboard,
  "dados-organizacao": DadosOrganizacaoDashboard,
  usuarios: UsersManagementDashboard,
  "dominios-ssl": DominiosSslDashboard,
  aprovadores: AprovadoresDashboard,
  fornecedores: FornecedoresDashboard,
  nps: NpsDashboard,
  cmdb: CmdbDashboard,
  aplicacoes: AplicacoesDashboard,
  "pilulas-si": PilulasSiDashboard,
  treinamentos: TreinamentosDashboard,
  "sso-ldap": SsoLdapDashboard,
  alertas: AlertasConfigDashboard,
  "cron-jobs": CronJobsDashboard,
  benchmark: BenchmarkDashboard,
};
