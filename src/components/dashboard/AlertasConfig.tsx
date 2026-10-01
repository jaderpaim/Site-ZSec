import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/lib/use-permissions";
import {
  getDisponibilidadeNotifConfig,
  saveDisponibilidadeNotifConfig,
  testTeamsWebhook,
  testTelegramWebhook,
} from "@/lib/disponibilidade-webhook.functions";
import { runCmdbDeviceAlertsNow } from "@/lib/cmdb-alerts.functions";
import { ALERT_MODULES, getAlertModulesConfig, setAlertModuleEnabled } from "@/lib/alert-modules.functions";
import { Mail, MessageSquare, Send, Bell, Globe, CheckCircle2, AlertCircle, Save, RefreshCw } from "lucide-react";

// ── Design Tokens (espelho dos módulos Integrações de API / Cron Jobs) ─────────
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",
  accent: "#3B82F6",
  accentSoft: "rgba(59,130,246,0.08)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

const CARD_ACCENT = {
  cmdbSmtp: { color: T.accent, bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.25)" },
  teams: { color: "#6264A7", bg: "rgba(98,100,167,0.12)", border: "rgba(98,100,167,0.3)" },
  telegram: { color: "#26A5E4", bg: "rgba(38,165,228,0.10)", border: "rgba(38,165,228,0.25)" },
  cmdbDevice: { color: T.warning, bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)" },
  cloudflareDns: { color: "#F6821F", bg: "rgba(246,130,31,0.10)", border: "rgba(246,130,31,0.25)" },
} as const;

// Ordem de exibição: Cloudflare e CMDB (webhook) na mesma linha do grid.
const MODULE_CARDS_ORDER = [...ALERT_MODULES].sort((a, b) =>
  a.key === "cloudflare_dns_created" ? -1 : b.key === "cloudflare_dns_created" ? 1 : 0,
);

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .al-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .al-root * { box-sizing:border-box; }

  /* ── Page header ── */
  .al-page-header {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between;
    flex-wrap:wrap; gap:12px;
  }
  .al-page-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .al-page-sub { font-size:12px; color:${T.textMuted}; margin-top:3px; line-height:1.5; }
  .al-status-bar { display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; }
  .al-status-pill {
    display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
    border-radius:5px; font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .al-status-pill.ok  { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .al-status-pill.off { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }
  .al-status-dot { width:5px; height:5px; border-radius:50%; background:currentColor; }

  /* ── Grid ── */
  .al-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:16px; }
  @media (max-width: 900px) { .al-grid { grid-template-columns:1fr; } }

  /* ── Card ── */
  .al-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    overflow:hidden; display:flex; flex-direction:column;
    transition:border-color 0.2s, box-shadow 0.2s;
  }
  .al-card:hover { border-color:${T.borderHi}; box-shadow:0 8px 32px rgba(0,0,0,0.3); }

  .al-card-header {
    padding:16px 20px 14px; background:${T.surfaceAlt};
    border-bottom:1px solid ${T.border};
    display:flex; align-items:center; justify-content:space-between; gap:10px;
    position:relative; overflow:hidden;
  }
  .al-card-header::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--card-color, ${T.accent});
  }
  .al-card-header-left { display:flex; align-items:center; gap:10px; min-width:0; }
  .al-icon-wrap {
    width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center;
    background:var(--card-bg, ${T.accentSoft}); border:1px solid var(--card-border, rgba(59,130,246,0.2));
    flex-shrink:0;
  }
  .al-card-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; white-space:nowrap;
    overflow:hidden; text-overflow:ellipsis;
  }
  .al-card-sub {
    font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    margin-top:2px; letter-spacing:0.03em;
  }

  .al-badge {
    display:inline-flex; align-items:center; gap:4px; padding:3px 8px; flex-shrink:0;
    border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .al-badge.yes { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .al-badge.no  { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }

  /* ── Card body ── */
  .al-card-body { padding:18px 20px; display:flex; flex-direction:column; gap:14px; flex:1; }

  .al-toggle-row {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 14px; background:${T.surfaceAlt}; border-radius:7px;
    border:1px solid ${T.border};
  }
  .al-toggle-label { font-size:12px; font-weight:600; color:${T.textSecondary}; }
  .al-toggle-hint  { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:1px; }

  .al-field { display:flex; flex-direction:column; gap:5px; }
  .al-field-label {
    font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
  }
  .al-field-helper { font-size:10px; color:${T.textSubtle}; line-height:1.5; margin-top:1px; }

  .al-root input[type="text"],
  .al-root input[type="password"],
  .al-root input[type="url"],
  .al-root input:not([type]) {
    background:${T.surface} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important;
    font-size:12px !important; border-radius:6px !important;
    transition:border-color 0.15s, box-shadow 0.15s !important;
  }
  .al-root input:focus {
    border-color:rgba(59,130,246,0.5) !important; outline:none !important;
    box-shadow:0 0 0 2px rgba(59,130,246,0.1) !important;
  }
  .al-root input::placeholder { color:${T.textSubtle} !important; }

  .al-chip-row { display:flex; gap:6px; flex-wrap:wrap; }
  .al-chip {
    font-size:9px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase;
    border-radius:4px; padding:3px 7px; font-family:'IBM Plex Mono',monospace;
    background:${T.accentSoft}; color:${T.textMuted}; border:1px solid ${T.border};
  }

  .al-actions { display:flex; gap:8px; margin-top:4px; }
  .al-btn {
    display:inline-flex; align-items:center; justify-content:center; gap:7px;
    flex:1; padding:10px 16px; border-radius:7px;
    background:var(--card-bg, ${T.accentSoft});
    border:1px solid var(--card-border, rgba(59,130,246,0.35));
    color:var(--card-color, ${T.accent});
    font-size:12px; font-weight:700; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.15s;
  }
  .al-btn:hover:not(:disabled) { filter:brightness(1.15); box-shadow:0 0 20px rgba(0,0,0,0.2); }
  .al-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .al-btn.outline { background:transparent; }

  @keyframes al-spin { to{transform:rotate(360deg)} }
  .al-spin { animation:al-spin 0.7s linear infinite; }

  .al-root ::-webkit-scrollbar { width:4px; height:4px; }
  .al-root ::-webkit-scrollbar-track { background:transparent; }
  .al-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }
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

  // Optimistic enabled state per módulo de alerta
  const [pendingModuleToggles, setPendingModuleToggles] = React.useState<Record<string, boolean>>({});

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
  const runCmdbFn = useServerFn(runCmdbDeviceAlertsNow);

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
        toast.success(
          res.detail && res.detail !== "1" ? `Teams respondeu: ${res.detail}` : "Mensagem de teste enviada ao Teams",
        );
      } else {
        toast.error(`Falha no Teams: ${res.error}`);
      }
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setTestingTeams(false);
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
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setRunningCmdb(false);
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

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Você não tem permissão para acessar este módulo.
      </p>
    );
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-10 text-center">Carregando...</p>;
  }

  const teamsConfigured = !!teamsUrl;
  const telegramConfigured = !!(cfg?.telegram_bot_token_set || telegramToken) && !!telegramChatId;
  const channelsActive = (teamsEnabled ? 1 : 0) + (telegramEnabled ? 1 : 0);
  const modulesActive = ALERT_MODULES.filter((m) => getModuleEnabled(m.key)).length;

  function cssVarsFor(accent: { color: string; bg: string; border: string }): React.CSSProperties {
    return {
      "--card-color": accent.color,
      "--card-bg": accent.bg,
      "--card-border": accent.border,
    } as React.CSSProperties;
  }

  return (
    <div className="al-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ── */}
      <div className="al-page-header">
        <div>
          <div className="al-page-title">Alertas</div>
          <div className="al-page-sub">Canais de notificação e módulos que enviam alertas automáticos para o time.</div>
        </div>
        <div className="al-status-bar">
          <span className="al-status-pill ok">
            <span className="al-status-dot" />
            {channelsActive} canal(is) ativo(s)
          </span>
          <span className="al-status-pill ok">
            <span className="al-status-dot" />
            {modulesActive} módulo(s) com webhook ativo(s)
          </span>
        </div>
      </div>

      <div className="al-grid">
        {/* ── Microsoft Teams ── */}
        <div className="al-card" style={cssVarsFor(CARD_ACCENT.teams)}>
          <div className="al-card-header">
            <div className="al-card-header-left">
              <div className="al-icon-wrap">
                <MessageSquare size={16} style={{ color: CARD_ACCENT.teams.color }} />
              </div>
              <div>
                <div className="al-card-title">Microsoft Teams</div>
                <div className="al-card-sub">Incoming Webhook</div>
              </div>
            </div>
            <span className={`al-badge ${teamsConfigured ? "yes" : "no"}`}>
              {teamsConfigured ? (
                <>
                  <CheckCircle2 size={10} /> Configurado
                </>
              ) : (
                <>
                  <AlertCircle size={10} /> Pendente
                </>
              )}
            </span>
          </div>
          <div className="al-card-body">
            <div className="al-toggle-row">
              <div>
                <div className="al-toggle-label">Canal ativo</div>
                <div className="al-toggle-hint">{teamsEnabled ? "Recebendo alertas" : "Desabilitado"}</div>
              </div>
              <Switch checked={teamsEnabled} onCheckedChange={setTeamsEnabled} />
            </div>

            <div className="al-field">
              <span className="al-field-label">Webhook URL do canal</span>
              <Input
                type="url"
                placeholder="https://outlook.office.com/webhook/..."
                value={teamsUrl}
                onChange={(e) => setTeamsUrl(e.target.value)}
              />
            </div>

            <div className="al-actions">
              <button className="al-btn" disabled={saving} onClick={handleSave}>
                <Save size={13} className={saving ? "al-spin" : ""} />
                {saving ? "Salvando…" : "Salvar"}
              </button>
              <button className="al-btn outline" disabled={testingTeams || !teamsUrl} onClick={handleTestTeams}>
                <Send size={13} />
                {testingTeams ? "Enviando…" : "Testar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Telegram ── */}
        <div className="al-card" style={cssVarsFor(CARD_ACCENT.telegram)}>
          <div className="al-card-header">
            <div className="al-card-header-left">
              <div className="al-icon-wrap">
                <Send size={16} style={{ color: CARD_ACCENT.telegram.color }} />
              </div>
              <div>
                <div className="al-card-title">Telegram</div>
                <div className="al-card-sub">Bot API</div>
              </div>
            </div>
            <span className={`al-badge ${telegramConfigured ? "yes" : "no"}`}>
              {telegramConfigured ? (
                <>
                  <CheckCircle2 size={10} /> Configurado
                </>
              ) : (
                <>
                  <AlertCircle size={10} /> Pendente
                </>
              )}
            </span>
          </div>
          <div className="al-card-body">
            <div className="al-toggle-row">
              <div>
                <div className="al-toggle-label">Canal ativo</div>
                <div className="al-toggle-hint">{telegramEnabled ? "Recebendo alertas" : "Desabilitado"}</div>
              </div>
              <Switch checked={telegramEnabled} onCheckedChange={setTelegramEnabled} />
            </div>

            <div className="al-field">
              <span className="al-field-label">
                Token do Bot
                {cfg?.telegram_bot_token_set && !telegramToken && (
                  <span style={{ color: T.success, fontWeight: 400, marginLeft: 6 }}>
                    configurado ({cfg.telegram_bot_token_masked})
                  </span>
                )}
              </span>
              <Input
                type="password"
                placeholder={cfg?.telegram_bot_token_set ? "Deixe em branco para manter" : "123456789:ABCdef…"}
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                autoComplete="off"
              />
            </div>

            <div className="al-field">
              <span className="al-field-label">Chat ID ou @canal</span>
              <Input
                type="text"
                placeholder="-100123456789 ou @meucanal"
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
              />
            </div>

            <div className="al-actions">
              <button className="al-btn" disabled={saving} onClick={handleSave}>
                <Save size={13} className={saving ? "al-spin" : ""} />
                {saving ? "Salvando…" : "Salvar"}
              </button>
              <button
                className="al-btn outline"
                disabled={testingTelegram || (!cfg?.telegram_bot_token_set && !telegramToken) || !telegramChatId}
                onClick={handleTestTelegram}
              >
                <Send size={13} />
                {testingTelegram ? "Enviando…" : "Testar"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Módulos com alerta via webhook (Cloudflare e CMDB na mesma linha) ── */}
        {MODULE_CARDS_ORDER.map((m) => {
          const enabled = getModuleEnabled(m.key);
          const accent = m.key === "cloudflare_dns_created" ? CARD_ACCENT.cloudflareDns : CARD_ACCENT.cmdbDevice;
          const Icon = m.key === "cloudflare_dns_created" ? Globe : Bell;
          return (
            <div key={m.key} className="al-card" style={cssVarsFor(accent)}>
              <div className="al-card-header">
                <div className="al-card-header-left">
                  <div className="al-icon-wrap">
                    <Icon size={16} style={{ color: accent.color }} />
                  </div>
                  <div>
                    <div className="al-card-title">{m.label}</div>
                    <div className="al-card-sub">Alerta via webhook</div>
                  </div>
                </div>
                <span className={`al-badge ${enabled ? "yes" : "no"}`}>
                  {enabled ? (
                    <>
                      <CheckCircle2 size={10} /> Ativo
                    </>
                  ) : (
                    <>
                      <AlertCircle size={10} /> Inativo
                    </>
                  )}
                </span>
              </div>
              <div className="al-card-body">
                <div className="al-toggle-row">
                  <div>
                    <div className="al-toggle-label">Alerta ativo</div>
                    <div className="al-toggle-hint">
                      {enabled ? "Enviando para os canais" : "Webhook não será enviado"}
                    </div>
                  </div>
                  <Switch checked={enabled} onCheckedChange={(v) => handleToggleModule(m.key, m.label, v)} />
                </div>
                <p className="al-field-helper">{m.description}</p>
                <div className="al-chip-row">
                  {m.channels.map((c) => (
                    <span key={c} className="al-chip">
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}

        {/* ── CMDB — Alertas SMTP (última linha) ── */}
        <div className="al-card" style={cssVarsFor(CARD_ACCENT.cmdbSmtp)}>
          <div className="al-card-header">
            <div className="al-card-header-left">
              <div className="al-icon-wrap">
                <Mail size={16} style={{ color: CARD_ACCENT.cmdbSmtp.color }} />
              </div>
              <div>
                <div className="al-card-title">CMDB — Alertas SMTP</div>
                <div className="al-card-sub">Diário · 07h BRT</div>
              </div>
            </div>
          </div>
          <div className="al-card-body">
            <p className="al-field-helper">
              Verifica todos os ativos do CMDB e envia e-mail para os administradores com os dispositivos em status{" "}
              <span style={{ color: T.warning, fontWeight: 600 }}>Alerta</span> (cobertura parcial) e{" "}
              <span style={{ color: "#EF4444", fontWeight: 600 }}>Inativo</span> (sem cobertura SIEM nem Zabbix).
            </p>
            <div className="al-actions">
              <button className="al-btn" disabled={runningCmdb} onClick={handleRunCmdb}>
                <RefreshCw size={13} className={runningCmdb ? "al-spin" : ""} />
                {runningCmdb ? "Verificando…" : "Executar verificação agora"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
