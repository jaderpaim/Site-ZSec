import * as React from "react";
import { APP_NAME } from "@/lib/brand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Settings2, ShieldAlert } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/lib/use-permissions";
import {
  acknowledgeAuditAlert,
  getGuardSettingsFn,
  listAuditAlerts,
  removeRecordFromAlert,
  saveGuardSettings,
  type AuditAlert,
} from "@/lib/cloudflare.guard.functions";
import { Badge, Block, Empty, Kpi, Note } from "./cf-ui";
import { fmtDateTime, timeAgo } from "./change-utils";
import { CfNavContext } from "./shared-zone";

const SEV: Record<AuditAlert["severity"], { label: string; color: string }> = {
  critical: { label: "Crítico", color: "var(--v2-crit)" },
  warning: { label: "Atenção", color: "var(--v2-high)" },
  info: { label: "Info", color: "var(--v2-accent)" },
};

// Alertas de criação: cada registro pode ser removido direto daqui (admin).
const CREATE_RULES = ["dns_create_sensitive", "dns_create_outside_flow", "volume_create"];
type CreateEvent = {
  record: string;
  name?: string;
  record_id: string | null;
  reason?: string | null;
  actor?: string;
  removed_at?: string;
  removed_by?: string | null;
};

// Detalhe legível do alerta a partir de details (formato varia por regra).
function detailLine(a: AuditAlert): string {
  const d = a.details ?? {};
  if (CREATE_RULES.includes(a.rule) && Array.isArray(d.events) && d.events.length) {
    const e = d.events[0];
    const reasons = [...new Set(d.events.map((x: any) => x.reason).filter(Boolean))];
    return `${reasons.length ? `${reasons.join("; ")} · ` : ""}${e.actor}${e.ip ? ` · IP ${e.ip}` : ""}${e.interface ? ` · ${e.interface}` : ""}`;
  }
  if (Array.isArray(d.events) && d.events.length) {
    const e = d.events[0];
    return `${d.events
      .map((x: any) => x.record)
      .slice(0, 3)
      .join(
        "; ",
      )}${d.events.length > 3 ? ` (+${d.events.length - 3})` : ""} · ${e.actor}${e.ip ? ` · IP ${e.ip}` : ""}${e.interface ? ` · ${e.interface}` : ""}`;
  }
  if (Array.isArray(d.records)) return d.records.slice(0, 4).join("; ");
  if (d.error) return String(d.error);
  if (d.user_email) return `${d.user_email} · ${d.used} de ${d.max}`;
  if (d.before != null && d.after != null && typeof d.before === "number")
    return `${d.before} → ${d.after} registros`;
  return a.zoneName ?? "";
}

export function AuditAlertsView({ zoneId }: { zoneId: string }) {
  const { isAdmin, can } = usePermissions();
  const canRemove = isAdmin && can("cloudflare-waf", "manage_aprovar_exclusao_dns");
  const nav = React.useContext(CfNavContext);
  const qc = useQueryClient();
  const fetchAlerts = useServerFn(listAuditAlerts);
  const ack = useServerFn(acknowledgeAuditAlert);
  const [days, setDays] = React.useState(7);
  const [removing, setRemoving] = React.useState<{ alertId: string; ev: CreateEvent } | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["cf-audit-alerts", zoneId, days],
    queryFn: () => fetchAlerts({ data: { zoneId, days } }),
    refetchInterval: 60_000,
  });
  const alerts: AuditAlert[] = (data as any)?.alerts ?? [];
  const watch = (data as any)?.watch as
    | {
        lastOkAt: string | null;
        lastRunAt: string | null;
        lastError: string | null;
        ignoredToday: number;
      }
    | undefined;
  const stale = !watch?.lastOkAt || Date.now() - new Date(watch.lastOkAt).getTime() > 30 * 60_000;
  const openCritical = alerts.filter((a) => a.severity === "critical" && !a.acknowledgedAt).length;

  return (
    <div className="cfx-col">
      <div className="cfx-kpis" style={{ gridTemplateColumns: "repeat(4,minmax(0,1fr))" }}>
        <Kpi
          label="Última leitura"
          value={watch?.lastOkAt ? timeAgo(watch.lastOkAt) : "nunca"}
          sub={stale ? "monitor parado ou sem permissão" : "a cada 5 min"}
          color={stale ? "var(--v2-crit)" : undefined}
        />
        <Kpi
          label="Críticos abertos"
          value={String(openCritical)}
          sub="não reconhecidos"
          color="var(--v2-crit)"
        />
        <Kpi
          label={`Atenção (${days} d)`}
          value={String(alerts.filter((a) => a.severity === "warning").length)}
          sub="volume, proteção, limites"
          color="var(--v2-high)"
        />
        <Kpi
          label="Automáticas ignoradas (hoje)"
          value={String(watch?.ignoredToday ?? 0)}
          sub="validação de certificado (ACME / System)"
        />
      </div>
      {watch?.lastError && (
        <Note color="var(--v2-crit)" icon={AlertTriangle}>
          <b>Última leitura do log falhou:</b> {watch.lastError}
        </Note>
      )}
      <Block
        title="Alertas de auditoria"
        icon={ShieldAlert}
        extra={
          <div className="cfx-grp">
            {[7, 30, 90].map((d) => (
              <button
                key={d}
                className={`cfx-day${days === d ? " on" : ""}`}
                onClick={() => setDays(d)}
              >
                {d} DIAS
              </button>
            ))}
          </div>
        }
      >
        {isLoading ? (
          <Empty>Carregando alertas…</Empty>
        ) : error ? (
          <Empty>{(error as Error).message}</Empty>
        ) : alerts.length === 0 ? (
          <Empty>Nenhum alerta no período.</Empty>
        ) : (
          alerts.map((a) => (
            <div
              key={a.id}
              style={{
                display: "grid",
                gridTemplateColumns: "4px minmax(0,1fr) auto",
                gap: "0 12px",
                border: "1px solid var(--v2-line)",
                borderRadius: 8,
                overflow: "hidden",
                opacity: a.acknowledgedAt ? 0.65 : 1,
              }}
            >
              <i style={{ background: SEV[a.severity].color }} />
              <div
                style={{
                  padding: "10px 0",
                  display: "flex",
                  flexDirection: "column",
                  gap: 3,
                  minWidth: 0,
                }}
              >
                <b style={{ fontSize: 12.5 }}>{a.title}</b>
                <span className="cfx-muted" style={{ fontSize: 11.5, overflowWrap: "anywhere" }}>
                  {detailLine(a)}
                </span>
                {CREATE_RULES.includes(a.rule) &&
                  ((a.details?.events ?? []) as CreateEvent[]).slice(0, 10).map((ev, i) => (
                    <div
                      key={`${ev.record_id ?? "x"}-${i}`}
                      style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}
                    >
                      <span
                        style={{
                          fontFamily: "var(--font-data)",
                          fontSize: 11.5,
                          overflowWrap: "anywhere",
                          textDecoration: ev.removed_at ? "line-through" : undefined,
                        }}
                      >
                        {ev.record}
                      </span>
                      {ev.removed_at ? (
                        <span className="cfx-muted" style={{ fontSize: 11 }}>
                          removido por {ev.removed_by ?? "—"}
                        </span>
                      ) : (
                        canRemove &&
                        ev.record_id && (
                          <button
                            className="cfx-btn sm"
                            style={{ color: "var(--v2-crit)" }}
                            onClick={() => setRemoving({ alertId: a.id, ev })}
                          >
                            Remover
                          </button>
                        )
                      )}
                    </div>
                  ))}
                {CREATE_RULES.includes(a.rule) && (a.details?.events?.length ?? 0) > 10 && (
                  <span className="cfx-muted" style={{ fontSize: 11 }}>
                    +{a.details!.events.length - 10} registro(s) — veja em Ações › Backups de DNS
                    (comparar com a Cloudflare)
                  </span>
                )}
                <span
                  className="cfx-muted"
                  style={{ fontSize: 11 }}
                  title={fmtDateTime(a.createdAt)}
                >
                  {timeAgo(a.createdAt)}
                  {a.acknowledgedAt && ` · reconhecido por ${a.acknowledgedByEmail ?? "—"}`}
                </span>
              </div>
              <div
                style={{
                  padding: "10px 12px 10px 0",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "flex-end",
                }}
              >
                <Badge label={SEV[a.severity].label} color={SEV[a.severity].color} />
                {!a.acknowledgedAt && a.severity !== "info" && isAdmin && (
                  <button
                    className="cfx-btn sm"
                    onClick={async () => {
                      const res: any = await ack({ data: { id: a.id } });
                      if (res?.ok) toast.success("Alerta reconhecido.");
                      else toast.error(res?.error ?? "Falha ao reconhecer.");
                      qc.invalidateQueries({ queryKey: ["cf-audit-alerts"] });
                      qc.invalidateQueries({ queryKey: ["cf-guard-status"] });
                    }}
                  >
                    Reconhecer
                  </button>
                )}
                {a.rule === "dns_delete_outside_flow" && nav && (
                  <button className="cfx-btn sm" onClick={() => nav?.("dns-backups")}>
                    Restaurar do backup
                  </button>
                )}
              </div>
            </div>
          ))
        )}
        <span className="cfx-muted" style={{ fontSize: 11 }}>
          O monitor lê o log de auditoria da conta a cada 5 min e vale para qualquer origem: painel,
          API ou Terraform. "Reconhecer" tira o ponto vermelho da aba Histórico e registra quem viu;
          o alerta continua na lista.
        </span>
      </Block>
      {isAdmin && <SettingsCard />}
      <RemoveDialog
        target={removing}
        onClose={() => setRemoving(null)}
        onDone={() => {
          qc.invalidateQueries({ queryKey: ["cf-audit-alerts"] });
          qc.invalidateQueries({ queryKey: ["cf-guard-status"] });
        }}
      />
    </div>
  );
}

function RemoveDialog({
  target,
  onClose,
  onDone,
}: {
  target: { alertId: string; ev: CreateEvent } | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const remove = useServerFn(removeRecordFromAlert);
  const [why, setWhy] = React.useState("");
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const ev = target?.ev;
  React.useEffect(() => {
    setWhy("");
    setTyped("");
  }, [target?.alertId, ev?.record_id]);
  const name = ev?.name ?? "";
  const ok = why.trim().length >= 20 && !!name && typed.trim().toLowerCase() === name.toLowerCase();
  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover registro criado fora do fluxo?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {ev ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div
                  style={{
                    fontFamily: "var(--font-data)",
                    fontSize: 12.5,
                    wordBreak: "break-all",
                  }}
                >
                  <div>
                    Registro: <strong>{ev.record}</strong>
                  </div>
                  <div>
                    Criado por: <strong>{ev.actor ?? "—"}</strong>
                  </div>
                  {ev.reason && (
                    <div>
                      Motivo do alerta: <strong>{ev.reason}</strong>
                    </div>
                  )}
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in oklch, var(--v2-crit) 35%, transparent)",
                    background: "color-mix(in oklch, var(--v2-crit) 12%, transparent)",
                    color: "var(--v2-fg)",
                  }}
                >
                  <b style={{ color: "var(--v2-crit)" }}>
                    Apaga o registro na Cloudflare na hora,
                  </b>{" "}
                  sem pedido de aprovação (é a resposta a um incidente). Fica uma cópia em Backups
                  de DNS, uma linha no Histórico e o alerta vai para o Teams e o e-mail dos admins.
                </div>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                  htmlFor="rogue-why"
                >
                  <span style={{ color: "var(--v2-fg)" }}>Justificativa (mín. 20 caracteres)</span>
                  <Textarea
                    id="rogue-why"
                    value={why}
                    onChange={(e) => setWhy(e.target.value)}
                    rows={3}
                  />
                </label>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                  htmlFor="rogue-name"
                >
                  <span style={{ color: "var(--v2-fg)" }}>
                    Digite <b style={{ fontFamily: "var(--font-data)" }}>{name}</b> para
                    confirmar
                  </span>
                  <Input
                    id="rogue-name"
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div />
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ok || busy}
            style={{ background: "var(--v2-crit)" }}
            onClick={async (e) => {
              e.preventDefault();
              if (!target?.ev.record_id) return;
              setBusy(true);
              try {
                const res: any = await remove({
                  data: {
                    alertId: target.alertId,
                    recordId: target.ev.record_id,
                    justification: why.trim(),
                    confirmName: typed.trim(),
                  },
                });
                if (res?.ok) {
                  toast.success(
                    "Registro removido. Cópia guardada, alerta enviado e linha no Histórico.",
                  );
                  onClose();
                } else toast.error(res?.error ?? "Falha ao remover.");
              } catch (err: any) {
                toast.error(err?.message ?? "Falha ao remover.");
              } finally {
                setBusy(false);
                onDone();
              }
            }}
          >
            {busy ? "Removendo…" : "Remover na Cloudflare"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function SettingsCard() {
  const fetchSettings = useServerFn(getGuardSettingsFn);
  const save = useServerFn(saveGuardSettings);
  const { data } = useQuery({ queryKey: ["cf-guard-settings"], queryFn: () => fetchSettings() });
  const [form, setForm] = React.useState<{
    dw: number;
    dt: number;
    cw: number;
    ct: number;
    rw: number;
    rt: number;
    outside: boolean;
    hosts: string;
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (data && !form)
      setForm({
        dw: data.delete_window_min,
        dt: data.delete_threshold,
        cw: data.change_window_min,
        ct: data.change_threshold,
        rw: data.create_window_min,
        rt: data.create_threshold,
        outside: data.create_outside_flow,
        hosts: (data.critical_hosts ?? []).join(", "),
      });
  }, [data, form]);
  if (!form) return null;
  const num = (v: string) => Math.max(1, Math.min(1440, Number(v) || 1));
  const inp = { width: 64, textAlign: "right" as const };
  return (
    <Block title="Configurar alertas (admin)" icon={Settings2}>
      <div className="cfx-grp" style={{ fontSize: 12 }}>
        <span>Exclusões de DNS em</span>
        <input
          className="cfx-input"
          style={inp}
          value={form.dw}
          onChange={(e) => setForm({ ...form, dw: num(e.target.value) })}
          aria-label="Janela de exclusões em minutos"
        />
        <span>min ≥</span>
        <input
          className="cfx-input"
          style={inp}
          value={form.dt}
          onChange={(e) => setForm({ ...form, dt: num(e.target.value) })}
          aria-label="Quantidade de exclusões"
        />
        <span className="cfx-muted">→ atenção</span>
      </div>
      <div className="cfx-grp" style={{ fontSize: 12 }}>
        <span>Alterações de DNS em</span>
        <input
          className="cfx-input"
          style={inp}
          value={form.cw}
          onChange={(e) => setForm({ ...form, cw: num(e.target.value) })}
          aria-label="Janela de alterações em minutos"
        />
        <span>min ≥</span>
        <input
          className="cfx-input"
          style={inp}
          value={form.ct}
          onChange={(e) => setForm({ ...form, ct: num(e.target.value) })}
          aria-label="Quantidade de alterações"
        />
        <span className="cfx-muted">→ atenção</span>
      </div>
      <div className="cfx-grp" style={{ fontSize: 12 }}>
        <span>Criações de DNS em</span>
        <input
          className="cfx-input"
          style={inp}
          value={form.rw}
          onChange={(e) => setForm({ ...form, rw: num(e.target.value) })}
          aria-label="Janela de criações em minutos"
        />
        <span>min ≥</span>
        <input
          className="cfx-input"
          style={inp}
          value={form.rt}
          onChange={(e) => setForm({ ...form, rt: num(e.target.value) })}
          aria-label="Quantidade de criações"
        />
        <span className="cfx-muted">→ atenção</span>
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
        <input
          type="checkbox"
          checked={form.outside}
          onChange={(e) => setForm({ ...form, outside: e.target.checked })}
        />
        Alertar toda criação de DNS feita fora do {APP_NAME} (atenção)
      </label>
      <span className="cfx-muted" style={{ fontSize: 11.5 }}>
        Criação sensível fora do {APP_NAME} sempre gera alerta crítico, mesmo um registro só: NS em
        subdomínio, curinga (*), MX, CAA, SPF/DMARC/DKIM, TXT de verificação de domínio e hosts
        críticos.
      </span>
      <label
        style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 12 }}
        htmlFor="crit-hosts"
      >
        Hosts críticos (separados por vírgula; alterar um deles fora do {APP_NAME} gera alerta)
        <input
          id="crit-hosts"
          className="cfx-input"
          value={form.hosts}
          onChange={(e) => setForm({ ...form, hosts: e.target.value })}
          placeholder="www.exemplo.com.br, app.exemplo.com.br"
        />
      </label>
      <span className="cfx-muted" style={{ fontSize: 11.5 }}>
        Os alertas saem pelo Teams e por e-mail para os admins, como os alertas de DNS. Dá para
        ligar e desligar na configuração de alertas do sistema ("Cloudflare — Alerta de Auditoria").
      </span>
      <button
        className="cfx-btn sm solid"
        style={{ alignSelf: "flex-start" }}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res: any = await save({
              data: {
                deleteWindowMin: form.dw,
                deleteThreshold: form.dt,
                changeWindowMin: form.cw,
                changeThreshold: form.ct,
                createWindowMin: form.rw,
                createThreshold: form.rt,
                createOutsideFlow: form.outside,
                criticalHosts: form.hosts
                  .split(/[\s,;]+/)
                  .map((h) => h.trim())
                  .filter(Boolean),
              },
            });
            if (res?.ok) toast.success("Configuração de alertas salva.");
            else toast.error(res?.error ?? "Falha ao salvar.");
          } catch (e: any) {
            toast.error(e?.message ?? "Falha ao salvar.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Salvando…" : "Salvar"}
      </button>
    </Block>
  );
}
