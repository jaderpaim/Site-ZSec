import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { usePermissions } from "@/lib/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import {
  getDisponibilidadeNotifConfig,
  saveDisponibilidadeNotifConfig,
  testTeamsWebhook,
  testTelegramWebhook,
} from "@/lib/disponibilidade-webhook.functions";
import { runCmdbDeviceAlertsNow } from "@/lib/cmdb-alerts.functions";
import {
  ALERT_MODULES,
  getAlertModulesConfig,
  setAlertModuleEnabled,
} from "@/lib/alert-modules.functions";
import {
  Check,
  Cloud,
  Code2,
  Database,
  Lock,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  ShieldCheck,
} from "lucide-react";

type Channel = "Teams" | "Telegram";

// Agrupamento dos eventos por módulo (pelo prefixo da chave em ALERT_MODULES)
const GROUPS: Array<{
  prefix: string;
  name: string;
  sub: string;
  icon: React.ComponentType<{ size?: number }>;
  color: string;
}> = [
  {
    prefix: "cloudflare_",
    name: "Cloudflare",
    sub: "Mudanças em DNS e regras das zonas",
    icon: Cloud,
    color: "oklch(0.7 0.16 55)",
  },
  {
    prefix: "cmdb_",
    name: "CMDB",
    sub: "Cobertura de monitoramento dos ativos",
    icon: Database,
    color: "var(--v2-high)",
  },
  {
    prefix: "sophos_",
    name: "Sophos",
    sub: "Ações registradas no Audit Log",
    icon: ShieldCheck,
    color: "oklch(0.62 0.15 250)",
  },
  {
    prefix: "sast_",
    name: "SAST",
    sub: "Triagem de achados das esteiras CI/CD",
    icon: Code2,
    color: "var(--v2-accent)",
  },
  {
    prefix: "ssl_",
    name: "SSL",
    sub: "Ciclo de vida dos certificados",
    icon: Lock,
    color: "var(--v2-ok)",
  },
];
// "Cloudflare — Novo Registro DNS" → "Novo Registro DNS"
const shortLabel = (label: string) => label.replace(/^[^—]+—\s*/, "");

const CSS = `
  .al-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .al-root * { box-sizing:border-box; }
  .al-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .al-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .al-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .al-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .al-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .al-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .al-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .al-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); margin-left:4px; }
  .al-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .al-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .al-sec h2 { margin:0; font-size:16px; font-weight:600; }
  .al-sec p { margin:2px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .al-chans { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; }
  @media (max-width: 900px) { .al-chans { grid-template-columns:minmax(0, 1fr); } }
  .al-ch { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:grid; min-width:0; }
  .al-ch-h { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--v2-line); }
  .al-ic { width:36px; height:36px; border-radius:9px; display:grid; place-items:center; background:color-mix(in oklch, var(--c) 16%, transparent); color:var(--c); flex:none; }
  .al-ch-h b, .al-evg-h b { display:block; font-size:14px; font-weight:600; }
  .al-ch-h small, .al-evg-h small { display:block; font-size:12.5px; color:var(--v2-fg-3); }
  .al-ch-h .right { margin-left:auto; display:flex; align-items:center; gap:10px; }
  .al-ch-b { display:grid; gap:12px; padding:14px 18px 16px; }
  .al-field { display:grid; gap:6px; min-width:0; }
  .al-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .al-field label small { font-weight:400; color:var(--v2-ok); margin-left:6px; }
  .al-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 560px) { .al-row2 { grid-template-columns:1fr; } }
  .al-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  .al-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .al-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .al-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .al-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .al-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .al-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .al-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .al-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .al-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }

  .al-evgrid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:16px; align-items:start; }
  .al-evg { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .al-evg.wide { grid-column:1 / -1; }
  @media (max-width: 1000px) { .al-evgrid { grid-template-columns:minmax(0, 1fr); } .al-evg.wide { grid-column:auto; } }
  .al-evg-h { display:flex; align-items:center; gap:12px; padding:14px 18px; border-bottom:1px solid var(--v2-line); background:color-mix(in oklch, var(--c) 6%, var(--v2-surface)); }
  .al-evg-h .cnt { margin-left:auto; font:500 12.5px var(--font-data); color:var(--v2-fg-2); white-space:nowrap; }
  .al-evg-h .cnt.part { color:color-mix(in oklch, var(--v2-med) 80%, var(--v2-fg)); }
  .al-evg-b { display:grid; }
  .al-evg.wide .al-evg-b { grid-template-columns:repeat(2, minmax(0, 1fr)); }
  .al-ev { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:4px 16px; align-items:center; padding:12px 18px; border-top:1px solid var(--v2-line); }
  .al-evg-b .al-ev:first-child { border-top:0; }
  .al-evg.wide .al-evg-b .al-ev:nth-child(-n+2) { border-top:0; }
  .al-evg.wide .al-evg-b .al-ev:nth-child(odd) { border-right:1px solid var(--v2-line); }
  @media (max-width: 1000px) {
    .al-evg.wide .al-evg-b { grid-template-columns:minmax(0, 1fr); }
    .al-evg.wide .al-evg-b .al-ev:nth-child(odd) { border-right:0; }
    .al-evg.wide .al-evg-b .al-ev:nth-child(2) { border-top:1px solid var(--v2-line); }
  }
  .al-ev b { font-size:13.5px; font-weight:500; }
  .al-ev p { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); line-height:1.45; }
  .al-chs { display:flex; gap:4px; flex-wrap:wrap; margin-top:8px; }
  .al-tag { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12px; color:var(--v2-fg-2); white-space:nowrap; }
  .al-tag.off { opacity:.55; text-decoration:line-through; }
  .al-warn { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; background:color-mix(in oklch, var(--v2-med) 16%, transparent); color:color-mix(in oklch, var(--v2-med) 75%, var(--v2-fg)); white-space:nowrap; }

  .al-mail { display:grid; grid-template-columns:36px minmax(0, 1fr) auto; gap:14px; align-items:center; padding:16px 18px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }
  .al-mail b { display:block; font-size:14px; font-weight:600; }
  .al-mail p { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-2); line-height:1.5; }
  .al-mail small { display:block; margin-top:4px; font-size:12px; color:var(--v2-fg-3); }
  @media (max-width: 700px) { .al-mail { grid-template-columns:36px minmax(0, 1fr); } .al-mail .al-btn { grid-column:1 / -1; justify-self:start; } }
  @keyframes al-spin { to { transform:rotate(360deg) } }
  .al-spin { animation:al-spin .8s linear infinite; }
`;

export function AlertasConfigDashboard() {
  const { isAdmin, isModuleAdmin } = usePermissions();
  const canManage = isAdmin || isModuleAdmin("disponibilidade");
  const queryClient = useQueryClient();
  const getFn = useServerFn(getDisponibilidadeNotifConfig);
  const saveFn = useServerFn(saveDisponibilidadeNotifConfig);
  const testTeamsFn = useServerFn(testTeamsWebhook);
  const testTelegramFn = useServerFn(testTelegramWebhook);
  const getAlertModulesFn = useServerFn(getAlertModulesConfig);
  const setAlertModuleFn = useServerFn(setAlertModuleEnabled);
  const runCmdbFn = useServerFn(runCmdbDeviceAlertsNow);

  const { data: cfg, isLoading } = useQuery({
    queryKey: ["disponibilidade", "notif-config"],
    queryFn: () => getFn(),
    enabled: canManage,
  });
  const { data: moduleStatus } = useQuery({
    queryKey: ["alert-modules-config"],
    queryFn: () => getAlertModulesFn(),
    enabled: canManage,
  });
  // Última execução do relatório por e-mail do CMDB (registro do cron)
  const { data: cmdbRun } = useQuery({
    queryKey: ["cron-job-run", "cmdb-device-alerts"],
    enabled: canManage,
    queryFn: async () => {
      const { data } = await supabase
        .from("cron_job_runs")
        .select("last_attempt_at, last_ok, last_error")
        .eq("job_name", "cmdb-device-alerts")
        .maybeSingle();
      return data;
    },
  });

  // Estado otimista do liga/desliga de cada evento
  const [pendingModuleToggles, setPendingModuleToggles] = React.useState<Record<string, boolean>>(
    {},
  );
  function getModuleEnabled(key: string): boolean {
    if (key in pendingModuleToggles) return pendingModuleToggles[key];
    return moduleStatus?.[key] !== false;
  }
  async function handleToggleModule(key: string, label: string, newEnabled: boolean) {
    setPendingModuleToggles((p) => ({ ...p, [key]: newEnabled }));
    try {
      await setAlertModuleFn({ data: { key, enabled: newEnabled } });
      await queryClient.invalidateQueries({ queryKey: ["alert-modules-config"] });
      toast.success(`Alerta "${label}" ${newEnabled ? "ativado" : "desativado"}`);
    } catch (e: unknown) {
      setPendingModuleToggles((p) => {
        const next = { ...p };
        delete next[key];
        return next;
      });
      toast.error(String(e instanceof Error ? e.message : e));
    }
  }

  const [teamsUrl, setTeamsUrl] = React.useState("");
  const [teamsEnabled, setTeamsEnabled] = React.useState(false);
  const [telegramToken, setTelegramToken] = React.useState("");
  const [telegramChatId, setTelegramChatId] = React.useState("");
  const [telegramEnabled, setTelegramEnabled] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [testingTeams, setTestingTeams] = React.useState(false);
  const [testingTelegram, setTestingTelegram] = React.useState(false);
  const [runningCmdb, setRunningCmdb] = React.useState(false);

  React.useEffect(() => {
    if (!cfg) return;
    setTeamsUrl(cfg.teams_webhook_url ?? "");
    setTeamsEnabled(cfg.teams_enabled);
    setTelegramChatId(cfg.telegram_chat_id ?? "");
    setTelegramEnabled(cfg.telegram_enabled);
  }, [cfg]);

  async function handleSave() {
    setSaving(true);
    try {
      await saveFn({
        data: {
          teams_webhook_url: teamsUrl || null,
          teams_enabled: teamsEnabled,
          telegram_bot_token: telegramToken || undefined,
          telegram_chat_id: telegramChatId || null,
          telegram_enabled: telegramEnabled,
        },
      });
      setTelegramToken("");
      await queryClient.invalidateQueries({ queryKey: ["disponibilidade", "notif-config"] });
      toast.success("Configuração de alertas salva");
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  async function handleTestTeams() {
    setTestingTeams(true);
    try {
      const res = await testTeamsFn({ data: undefined });
      if (res.ok) {
        toast.success("Mensagem de teste enviada ao Teams");
      } else {
        toast.error(`Falha no Teams: ${res.error}`);
      }
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setTestingTeams(false);
    }
  }

  async function handleTestTelegram() {
    setTestingTelegram(true);
    try {
      const res = await testTelegramFn({ data: undefined });
      if (res.ok) toast.success("Mensagem de teste enviada ao Telegram");
      else toast.error(`Falha no Telegram: ${res.error}`);
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setTestingTelegram(false);
    }
  }

  async function handleRunCmdb() {
    setRunningCmdb(true);
    try {
      const res = await runCmdbFn({ data: undefined });
      const { alertCount, stoppedCount, notifiedRecipients } = res;
      if (alertCount === 0 && stoppedCount === 0) {
        toast.success("Nenhum ativo em Alerta ou Inativo — nenhum e-mail enviado");
      } else {
        toast.success(
          `E-mail enviado: ${alertCount} em Alerta, ${stoppedCount} Inativo(s) — ${notifiedRecipients} destinatário(s) notificado(s)`,
        );
      }
      queryClient.invalidateQueries({ queryKey: ["cron-job-run", "cmdb-device-alerts"] });
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setRunningCmdb(false);
    }
  }

  if (!canManage) {
    return (
      <div className="al-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div
          className="al-ch"
          style={{
            padding: "40px 16px",
            textAlign: "center",
            color: "var(--v2-fg-3)",
            fontSize: 13,
          }}
        >
          Você não tem permissão para acessar este módulo.
        </div>
      </div>
    );
  }
  if (isLoading) return <ModuleLoading />;

  const teamsConfigured = !!teamsUrl;
  const telegramConfigured = !!(cfg?.telegram_bot_token_set || telegramToken) && !!telegramChatId;
  const channelActive: Record<Channel, boolean> = {
    Teams: teamsEnabled && teamsConfigured,
    Telegram: telegramEnabled && telegramConfigured,
  };
  const channelsActive = Object.values(channelActive).filter(Boolean).length;
  const eventsOn = ALERT_MODULES.filter((m) => getModuleEnabled(m.key));
  const orphanEvents = eventsOn.filter(
    (m) => !(m.channels as readonly Channel[]).some((c) => channelActive[c]),
  ).length;
  const channelState = (configured: boolean, on: boolean) =>
    !configured ? "não configurado" : on ? "ligado" : "desligado";

  const ChannelStatus = ({ configured, on }: { configured: boolean; on: boolean }) =>
    !configured ? (
      <span className="al-pill" style={{ "--c": "var(--v2-med)" } as React.CSSProperties}>
        Não configurado
      </span>
    ) : on ? (
      <span className="al-pill" style={{ "--c": "var(--v2-ok)" } as React.CSSProperties}>
        Ativo
      </span>
    ) : (
      <span className="al-pill" style={{ "--c": "var(--v2-fg-3)" } as React.CSSProperties}>
        Desligado
      </span>
    );

  const groups = GROUPS.map((g) => ({
    ...g,
    items: ALERT_MODULES.filter((m) => m.key.startsWith(g.prefix)),
  }))
    .filter((g) => g.items.length > 0)
    .sort((a, b) => b.items.length - a.items.length);

  return (
    <div className="al-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div>
        <h1 className="al-ph-title">Alertas</h1>
        <p className="al-ph-sub">
          Canais que recebem as notificações e quais eventos de cada módulo disparam alerta para o
          time
        </p>
      </div>

      {/* ── KPIs ── */}
      <div className="al-kpis">
        <div className="al-kpi">
          <span className="al-kpi-label">Canais ativos</span>
          <span className="al-kpi-value">
            {channelsActive}
            <small>de 2</small>
          </span>
          <span className="al-kpi-foot">
            Teams {channelState(teamsConfigured, teamsEnabled)} · Telegram{" "}
            {channelState(telegramConfigured, telegramEnabled)}
          </span>
        </div>
        <div className="al-kpi">
          <span className="al-kpi-label">Eventos ligados</span>
          <span className="al-kpi-value">
            {eventsOn.length}
            <small>de {ALERT_MODULES.length}</small>
          </span>
          <span className="al-kpi-foot">em {groups.length} módulos</span>
        </div>
        <div className="al-kpi">
          <span className="al-kpi-label">
            {orphanEvents > 0 && <span className="al-sw" style={{ background: "var(--v2-med)" }} />}
            Eventos sem canal
          </span>
          <span className="al-kpi-value">{orphanEvents}</span>
          <span className="al-kpi-foot">
            {orphanEvents
              ? "ligados, mas nenhum canal deles está ativo"
              : "todos os eventos ligados têm canal ativo"}
          </span>
        </div>
      </div>

      {/* ── Canais ── */}
      <div className="al-sec">
        <h2>Canais</h2>
        <p>Para onde os alertas são enviados</p>
      </div>
      <div className="al-chans">
        <div className="al-ch">
          <div className="al-ch-h">
            <span
              className="al-ic"
              style={{ "--c": "oklch(0.62 0.12 280)" } as React.CSSProperties}
            >
              <MessageSquare size={18} />
            </span>
            <div>
              <b>Teams</b>
              <small>Incoming Webhook de um canal</small>
            </div>
            <div className="right">
              <ChannelStatus configured={teamsConfigured} on={teamsEnabled} />
              <Switch
                checked={teamsEnabled}
                onCheckedChange={setTeamsEnabled}
                aria-label="Ativar Teams"
              />
            </div>
          </div>
          <div className="al-ch-b">
            <div className="al-field">
              <label htmlFor="al-teams-url">Webhook URL do canal</label>
              <input
                id="al-teams-url"
                type="url"
                className="al-input"
                placeholder="https://…webhook.office.com/…"
                value={teamsUrl}
                onChange={(e) => setTeamsUrl(e.target.value)}
              />
            </div>
            <div className="al-actions">
              <button className="al-btn primary" disabled={saving} onClick={handleSave}>
                <Check size={14} /> {saving ? "Salvando…" : "Salvar"}
              </button>
              <button
                className="al-btn"
                disabled={testingTeams || !teamsUrl}
                onClick={handleTestTeams}
              >
                <Send size={14} /> {testingTeams ? "Enviando…" : "Enviar teste"}
              </button>
            </div>
          </div>
        </div>

        <div className="al-ch">
          <div className="al-ch-h">
            <span
              className="al-ic"
              style={{ "--c": "oklch(0.68 0.13 230)" } as React.CSSProperties}
            >
              <Send size={17} />
            </span>
            <div>
              <b>Telegram</b>
              <small>Bot API</small>
            </div>
            <div className="right">
              <ChannelStatus configured={telegramConfigured} on={telegramEnabled} />
              <Switch
                checked={telegramEnabled}
                onCheckedChange={setTelegramEnabled}
                aria-label="Ativar Telegram"
              />
            </div>
          </div>
          <div className="al-ch-b">
            <div className="al-row2">
              <div className="al-field">
                <label htmlFor="al-tg-token">
                  Token do bot
                  {cfg?.telegram_bot_token_set && !telegramToken && (
                    <small>configurado ({cfg.telegram_bot_token_masked})</small>
                  )}
                </label>
                <input
                  id="al-tg-token"
                  type="password"
                  className="al-input"
                  placeholder={
                    cfg?.telegram_bot_token_set
                      ? "Deixe em branco para manter"
                      : "123456789:ABCdef…"
                  }
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  autoComplete="off"
                />
              </div>
              <div className="al-field">
                <label htmlFor="al-tg-chat">Chat ID ou @canal</label>
                <input
                  id="al-tg-chat"
                  className="al-input"
                  placeholder="-100123456789 ou @meucanal"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                />
              </div>
            </div>
            <div className="al-actions">
              <button className="al-btn primary" disabled={saving} onClick={handleSave}>
                <Check size={14} /> {saving ? "Salvando…" : "Salvar"}
              </button>
              <button
                className="al-btn"
                disabled={
                  testingTelegram ||
                  (!cfg?.telegram_bot_token_set && !telegramToken) ||
                  !telegramChatId
                }
                onClick={handleTestTelegram}
              >
                <Send size={14} /> {testingTelegram ? "Enviando…" : "Enviar teste"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Eventos ── */}
      <div className="al-sec">
        <h2>Eventos que geram alerta</h2>
        <p>Ligue ou desligue cada evento; a mudança vale na hora</p>
      </div>
      <div className="al-evgrid">
        {groups.map((g) => {
          const on = g.items.filter((m) => getModuleEnabled(m.key)).length;
          const Icon = g.icon;
          return (
            <section
              key={g.prefix}
              className={`al-evg${g.items.length > 2 ? " wide" : ""}`}
              style={{ "--c": g.color } as React.CSSProperties}
              aria-label={g.name}
            >
              <div className="al-evg-h">
                <span className="al-ic">
                  <Icon size={17} />
                </span>
                <div>
                  <b>{g.name}</b>
                  <small>{g.sub}</small>
                </div>
                <span className={`cnt${on && on < g.items.length ? " part" : ""}`}>
                  {on} de {g.items.length} ligado{g.items.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="al-evg-b">
                {g.items.map((m) => {
                  const enabled = getModuleEnabled(m.key);
                  const chans = m.channels as readonly Channel[];
                  const reachable = chans.some((c) => channelActive[c]);
                  return (
                    <div key={m.key} className="al-ev">
                      <div style={{ minWidth: 0 }}>
                        <b>{shortLabel(m.label)}</b>
                        <p>{m.description}</p>
                        <div className="al-chs">
                          {chans.map((c) => (
                            <span
                              key={c}
                              className={`al-tag${channelActive[c] ? "" : " off"}`}
                              title={
                                channelActive[c]
                                  ? "Canal ativo"
                                  : "Canal desligado ou não configurado"
                              }
                            >
                              {c === "Teams" ? <MessageSquare size={12} /> : <Send size={12} />} {c}
                            </span>
                          ))}
                          {enabled && !reachable && (
                            <span
                              className="al-warn"
                              title="Nenhum dos canais deste evento está ativo: o alerta não chega a ninguém"
                            >
                              sem canal ativo
                            </span>
                          )}
                        </div>
                      </div>
                      <Switch
                        checked={enabled}
                        onCheckedChange={(v) => handleToggleModule(m.key, m.label, v)}
                        aria-label={`Ativar ${m.label}`}
                      />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* ── Verificações por e-mail ── */}
      <div className="al-sec">
        <h2>Verificações por e-mail</h2>
        <p>Relatórios enviados por SMTP aos administradores</p>
      </div>
      <div className="al-mail">
        <span className="al-ic" style={{ "--c": "var(--v2-accent)" } as React.CSSProperties}>
          <Mail size={17} />
        </span>
        <div style={{ minWidth: 0 }}>
          <b>CMDB · ativos sem cobertura</b>
          <p>
            Verifica todos os ativos do CMDB e envia e-mail aos administradores com os dispositivos
            em <span style={{ color: "var(--v2-med)", fontWeight: 600 }}>Alerta</span> (cobertura
            parcial) e <span style={{ color: "var(--v2-crit)", fontWeight: 600 }}>Inativo</span>{" "}
            (sem SIEM nem Zabbix).
          </p>
          <small>
            Automático todo dia às 07h
            {cmdbRun?.last_attempt_at &&
              ` · última execução ${new Date(cmdbRun.last_attempt_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
              })}${cmdbRun.last_ok === false ? " (falhou)" : ""}`}
          </small>
        </div>
        <button className="al-btn" disabled={runningCmdb} onClick={handleRunCmdb}>
          <RefreshCw size={14} className={runningCmdb ? "al-spin" : ""} />
          {runningCmdb ? "Verificando…" : "Executar agora"}
        </button>
      </div>
    </div>
  );
}
