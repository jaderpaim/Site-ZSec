import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Trash2,
  Ban,
  KeyRound,
  CheckCircle2,
  XCircle,
  Plus,
  ScanSearch,
  Settings2,
  ChevronUp,
  ChevronDown,
  Globe,
  Lock,
  Folder,
  ExternalLink,
  Monitor,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import {
  getShadowItAccess,
  listShadowItHosts,
  listShadowItFindings,
  listShadowItScans,
  startShadowItScan,
  cancelShadowItScan,
  deleteShadowItScan,
  setShadowItFindingStatus,
  saveShadowItSmbCredential,
  getShadowItSmbCredentialStatus,
  startShadowItDiscovery,
} from "@/lib/shadowit.functions";

// ── Design tokens — mesmos valores do DastScanner.tsx (T), pra manter o
// módulo com a mesma identidade visual, mesmo sendo domínio separado.
const T = {
  surface: "var(--v2-surface)",
  surfaceAlt: "var(--v2-surface-2)",
  border: "var(--v2-line)",
  borderHi: "var(--v2-line-strong)",
  accent: "var(--v2-accent)",
  accentBg: "color-mix(in oklch, var(--v2-accent) 14%, transparent)",
  critical: "var(--v2-crit)",
  high: "var(--v2-med)",
  success: "var(--v2-ok)",
  textPrimary: "var(--v2-fg)",
  textSecondary: "var(--v2-fg-2)",
  textMuted: "var(--v2-fg-3)",
  textSubtle: "var(--v2-fg-3)",
};
const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em execução",
  done: "Concluída",
  error: "Falhou",
  cancelled: "Cancelada",
};

const STATUS_TONE: Record<string, string> = {
  queued: T.textMuted,
  running: T.accent,
  done: T.success,
  error: T.critical,
  cancelled: T.textMuted,
};

const CLASS_TONE: Record<string, { label: string; color: string }> = {
  esperado: { label: "Esperado", color: T.success },
  revisar: { label: "Revisar", color: T.high },
  critico: { label: "Crítico", color: T.critical },
};

const KIND_LABEL: Record<string, string> = {
  smb_share: "SMB",
  ftp_banner: "FTP",
  http_title: "HTTP",
  netbios: "NetBIOS",
};

const CSS = `
  .swit-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .swit-root * { box-sizing:border-box; }
  .swit-root ::-webkit-scrollbar { width:6px; height:6px; }
  .swit-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .swit-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  @keyframes swit-spin { to { transform:rotate(360deg) } }
  @keyframes swit-pulse { 50% { opacity:.3 } }
  .swit-spin { animation:swit-spin 0.8s linear infinite; }
  .swit-mono { font-family:var(--font-data); font-size:12.5px; }
  .swit-dim { color:var(--v2-fg-3); }

  .swit-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .swit-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .swit-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .swit-ph-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .swit-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .swit-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font:500 13px var(--font-ui); color:var(--v2-fg-3); cursor:pointer; }
  .swit-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .swit-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .swit-subnav .n { font:500 12px var(--font-data); color:var(--v2-fg-3); }
  .swit-subnav .live { font:500 11.5px var(--font-data); padding:1px 7px; border-radius:99px; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }

  .swit-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .swit-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.swit-kpi { cursor:pointer; }
  button.swit-kpi:hover, .swit-kpi[aria-pressed="true"] { background:var(--v2-hover); }
  .swit-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .swit-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .swit-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .swit-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .swit-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .swit-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:8px 0 4px; }
  .swit-meter i { display:block; height:100%; border-radius:99px; }

  .swit-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .swit-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .swit-tbar > b { font-size:14px; font-weight:600; margin-right:4px; }
  .swit-tbar > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .swit-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .swit-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .swit-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }

  .swit-table { width:100%; border-collapse:collapse; font-size:13px; }
  .swit-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; border-bottom:1px solid var(--v2-line); white-space:nowrap; position:sticky; top:0; background:var(--v2-surface); z-index:1; }
  .swit-table th.sort { cursor:pointer; user-select:none; }
  .swit-table th[aria-sort] { color:var(--v2-fg); }
  .swit-table th svg { color:var(--v2-accent); }
  .swit-table td { padding:8px 12px; height:50px; border-bottom:1px solid var(--v2-line); color:var(--v2-fg); vertical-align:middle; }
  .swit-table th:first-child, .swit-table td:first-child { padding-left:18px; }
  .swit-table th:last-child, .swit-table td:last-child { padding-right:18px; }
  .swit-table tbody tr:hover td { background:var(--v2-hover); }
  .swit-table tbody tr:last-child td { border-bottom:none; }
  .swit-badge, .swit-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; font-family:var(--font-ui); background:color-mix(in oklch, var(--c, var(--v2-fg-3)) 14%, transparent); color:color-mix(in oklch, var(--c, var(--v2-fg-3)) 72%, var(--v2-fg)); }
  .swit-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c, var(--v2-fg-3)); }
  .swit-pill.live::before { animation:swit-pulse 1.6s infinite; }
  @media (prefers-reduced-motion: reduce) { .swit-pill.live::before { animation:none; } }
  .swit-tag { display:inline-flex; align-items:center; gap:4px; height:22px; padding:0 7px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:500 11.5px var(--font-data); color:var(--v2-fg-2); white-space:nowrap; }
  .swit-tag.tone { border-color:color-mix(in oklch, var(--c) 45%, transparent); color:color-mix(in oklch, var(--c) 75%, var(--v2-fg)); background:color-mix(in oklch, var(--c) 10%, transparent); }
  .swit-tags { display:flex; gap:4px; flex-wrap:wrap; }
  .swit-progress { display:grid; grid-template-columns:minmax(60px, 1fr) 38px; gap:8px; align-items:center; font:500 12px var(--font-data); min-width:120px; }
  .swit-progress .tr { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .swit-progress .tr i { display:block; height:100%; border-radius:99px; }

  .swit-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .swit-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .swit-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .swit-btn.pri { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .swit-btn.pri:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .swit-btn.gst { height:32px; padding:0 12px; }
  .swit-btn.sm { height:30px; padding:0 10px; }
  .swit-btn.dng { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .swit-btn.dng:hover:not(:disabled) { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .swit-icon-btn { width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); display:inline-grid; place-items:center; cursor:pointer; }
  .swit-icon-btn:hover:not(:disabled) { color:var(--v2-fg); background:var(--v2-hover); }
  .swit-icon-btn.danger:hover:not(:disabled) { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .swit-icon-btn:disabled { opacity:.35; cursor:not-allowed; }
  .swit-empty { padding:40px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .swit-row-clickable { cursor:pointer; }
  .swit-row-clickable.selected td { background:color-mix(in oklch, var(--v2-accent) 10%, transparent); }

  .swit-detail-wrap { display:flex; flex-direction:column; gap:20px; }
  .swit-section-hd { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); margin:0 0 10px; }
  .swit-card-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; }
  .swit-card { border:1px solid var(--v2-line); border-radius:10px; padding:12px 14px; display:flex; flex-direction:column; gap:8px; background:var(--v2-surface); }
  .swit-card-hd { display:flex; align-items:center; gap:8px; }
  .swit-card-icon { width:26px; height:26px; border-radius:7px; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); flex:none; }
  .swit-card-title { font-size:12.5px; color:var(--v2-fg-3); }
  .swit-card-hd .swit-pill { margin-left:auto; }
  .swit-netbios-name { font-size:15px; font-weight:600; }
  .swit-netbios-group { font-size:12.5px; color:var(--v2-fg-3); }
  .swit-netbios-group b { color:var(--v2-fg); font-weight:500; }
  .swit-http-title { font-size:13px; color:var(--v2-fg); line-height:1.4; }
  .swit-http-title.muted { color:var(--v2-fg-3); font-style:italic; }
  .swit-http-link { display:inline-flex; align-items:center; gap:5px; font:400 12px var(--font-data); color:var(--v2-accent); text-decoration:none; margin-top:auto; }
  .swit-http-link:hover { text-decoration:underline; }
  .swit-share-list { display:flex; flex-direction:column; gap:8px; }
  .swit-share-card { display:grid; grid-template-columns:32px minmax(0, 1fr) auto; gap:4px 12px; align-items:center; border:1px solid var(--v2-line); border-radius:10px; padding:11px 12px; --c:var(--v2-fg-3); }
  .swit-share-card.critico { --c:var(--v2-crit); border-color:color-mix(in oklch, var(--v2-crit) 40%, transparent); }
  .swit-share-card.revisar { --c:var(--v2-med); }
  .swit-share-card.esperado { --c:var(--v2-ok); }
  .swit-share-icon { width:32px; height:32px; border-radius:8px; display:grid; place-items:center; grid-row:span 2; background:color-mix(in oklch, var(--c) 14%, transparent); color:var(--c); }
  .swit-share-main { min-width:0; display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .swit-share-name { font-weight:600; font-size:13.5px; margin-right:2px; }
  .swit-share-acts { grid-row:span 2; grid-column:3; display:flex; gap:6px; align-items:center; }
  .swit-copy-btn { grid-column:2; display:inline-flex; align-items:center; gap:6px; background:none; border:none; padding:0; cursor:pointer; color:var(--v2-fg-3); font:400 12px var(--font-data); text-align:left; min-width:0; }
  .swit-copy-btn span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .swit-copy-btn:hover { color:var(--v2-accent); }
  .swit-netb { display:flex; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--v2-line); border-radius:10px; background:var(--v2-surface-2); }
  .swit-netb-ic { width:34px; height:34px; border-radius:8px; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); flex:none; }
  .swit-web { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  @media (max-width: 560px) { .swit-web { grid-template-columns:1fr; } }
  .swit-note { margin:0; font-size:13px; color:var(--v2-fg-3); }
  .swit-field { display:flex; flex-direction:column; gap:6px; font-family:var(--font-ui); }
  .swit-field-lbl { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
`;

function fmtRel(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso).getTime();
  const diffMin = Math.round((Date.now() - d) / 60000);
  if (diffMin < 1) return "agora";
  if (diffMin < 60) return `há ${diffMin}min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `há ${diffH}h`;
  return `há ${Math.round(diffH / 24)}d`;
}

function fmtDuration(startIso?: string | null, endIso?: string | null): string {
  if (!startIso) return "—";
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - new Date(startIso).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return m > 0 ? `${m}min${s}s` : `${s}s`;
}

// ── Ordem de colunas da tabela de Hosts (preferência por navegador, via
// localStorage -- não é dado de servidor, é só conveniência de exibição). ──
type HostColumnKey = "ip" | "services" | "risk" | "source" | "lastSeen" | "cmdb";
const HOST_COLUMN_LABEL: Record<HostColumnKey, string> = {
  ip: "Host",
  services: "Serviços",
  risk: "Risco",
  source: "Fonte",
  lastSeen: "Visto por último",
  cmdb: "CMDB",
};
const DEFAULT_HOST_COLUMN_ORDER: HostColumnKey[] = [
  "ip",
  "services",
  "risk",
  "cmdb",
  "source",
  "lastSeen",
];
const HOST_COLUMN_STORAGE_KEY = "shadowit-hosts-column-order";

function loadHostColumnOrder(): HostColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_HOST_COLUMN_ORDER; // SSR -- localStorage não existe no servidor
  try {
    const raw = localStorage.getItem(HOST_COLUMN_STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as string[]) : [];
    const valid = saved.filter((k): k is HostColumnKey =>
      (Object.keys(HOST_COLUMN_LABEL) as string[]).includes(k),
    );
    // Cobre o caso de coluna nova adicionada depois que o usuário já salvou uma ordem antiga.
    const missing = DEFAULT_HOST_COLUMN_ORDER.filter((k) => !valid.includes(k));
    return valid.length ? [...valid, ...missing] : DEFAULT_HOST_COLUMN_ORDER;
  } catch {
    return DEFAULT_HOST_COLUMN_ORDER;
  }
}

function ColumnOrderPicker({
  order,
  onChange,
}: {
  order: HostColumnKey[];
  onChange: (order: HostColumnKey[]) => void;
}) {
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="swit-btn gst" title="Reordenar colunas">
          <Settings2 size={14} /> Colunas
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        style={{
          background: T.surface,
          border: `1px solid ${T.borderHi}`,
          color: T.textPrimary,
          width: 240,
          fontFamily: "var(--font-ui)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            color: T.textMuted,
            marginBottom: 8,
          }}
        >
          Ordem das colunas (salva neste navegador)
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {order.map((key, i) => (
            <div
              key={key}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12.5,
                padding: "2px 0",
              }}
            >
              <span>{HOST_COLUMN_LABEL[key]}</span>
              <div style={{ display: "flex", gap: 2 }}>
                <button
                  className="swit-icon-btn"
                  aria-label="Subir"
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  className="swit-icon-btn"
                  aria-label="Descer"
                  disabled={i === order.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ChevronDown size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function CredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fetchStatus = useServerFn(getShadowItSmbCredentialStatus);
  const save = useServerFn(saveShadowItSmbCredential);
  const qc = useQueryClient();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  const statusQ = useQuery({
    queryKey: ["shadowit-cred-status"],
    queryFn: () => fetchStatus(),
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { username, password } }),
    onSuccess: () => {
      toast.success("Credencial salva");
      qc.invalidateQueries({ queryKey: ["shadowit-cred-status"] });
      setPassword("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao salvar credencial"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: T.textPrimary, fontFamily: "var(--font-ui)" }}>
            Credencial de domínio (SMB)
          </DialogTitle>
        </DialogHeader>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 12,
            color: T.textSecondary,
          }}
        >
          <p>
            Usada pra enumerar compartilhamento SMB dos hosts — sessão anônima está bloqueada nessa
            rede, então sem credencial essa parte da varredura fica vazia. Guardada cifrada
            (AES-256-GCM), nunca exibida de volta.
          </p>
          <p style={{ color: T.textMuted }}>
            {statusQ.isLoading
              ? "Verificando…"
              : statusQ.data?.configured
                ? `Configurada como: ${statusQ.data.username}`
                : "Nenhuma credencial configurada ainda."}
          </p>
          <div className="swit-field">
            <span className="swit-field-lbl">Usuário (DOMINIO\usuario)</span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="DOMINIO\svc-shadowit"
              autoComplete="off"
            />
          </div>
          <div className="swit-field">
            <span className="swit-field-lbl">Senha</span>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            className="swit-btn pri"
            disabled={!username || !password || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? (
              <Loader2 size={13} className="swit-spin" />
            ) : (
              <KeyRound size={13} />
            )}{" "}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubnetScanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const discover = useServerFn(startShadowItDiscovery);
  const qc = useQueryClient();
  const [subnet, setSubnet] = React.useState("");

  const mutation = useMutation({
    mutationFn: () => discover({ data: { subnet: subnet.trim() } }),
    onSuccess: () => {
      toast.success("Varredura de rede iniciada — acompanhe em Varreduras.");
      qc.invalidateQueries({ queryKey: ["shadowit-scans"] });
      qc.invalidateQueries({ queryKey: ["shadowit-hosts"] });
      setSubnet("");
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao iniciar varredura"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}
      >
        <DialogHeader>
          <DialogTitle style={{ color: T.textPrimary, fontFamily: "var(--font-ui)" }}>
            Varrer faixa de IP
          </DialogTitle>
        </DialogHeader>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 12,
            color: T.textSecondary,
          }}
        >
          <p>
            Faz o ping sweep da subnet — todo host encontrado (com ou sem hostname resolvido) cai
            automaticamente aqui, em Hosts. Não aparece no DAST Scanner. Só faixa privada (RFC1918).
          </p>
          <div className="swit-field">
            <span className="swit-field-lbl">Subnet (CIDR)</span>
            <Input
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="192.168.100.0/24"
            />
          </div>
        </div>
        <DialogFooter>
          <button
            className="swit-btn pri"
            disabled={!subnet.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? (
              <Loader2 size={13} className="swit-spin" />
            ) : (
              <ScanSearch size={13} />
            )}{" "}
            Iniciar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// UNC (\\ip\share) fica só como texto copiável de propósito -- um link
// clicável file://\\host\share dispararia autenticação forçada (vazamento
// de hash NTLM), navegador nenhum deveria navegar até lá sozinho.
async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // navigator.clipboard exige contexto seguro (HTTPS/localhost) e permissão
    // do navegador -- em HTTP simples ou túnel sem TLS ela nem existe/falha
    // direto. document.execCommand é depreciado mas não tem essa exigência,
    // funciona como fallback em praticamente qualquer contexto.
    try {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

function CopyableText({
  value,
  className = "swit-copy-btn",
}: {
  value: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      className={className}
      onClick={async () => {
        const ok = await copyToClipboard(value);
        if (ok) {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } else {
          toast.error("Não consegui copiar — copia manualmente.");
        }
      }}
      title="Copiar caminho"
    >
      <Folder size={11} />
      <span>{value}</span>
      {copied && <CheckCircle2 size={11} />}
    </button>
  );
}

function statusTone(statusCode: number | undefined): string {
  if (!statusCode) return T.textMuted;
  if (statusCode >= 500) return T.critical;
  if (statusCode >= 400) return T.high;
  return T.success;
}

// HTTP/HTTPS vira cartão com status code + título + link de verdade no
// rodapé (link normal de browser, diferente do UNC -- sem o risco de
// handshake forçado que o file://\\host\share teria).
function HttpCard({
  label,
  icon,
  finding,
  ip,
  port,
}: {
  label: string;
  icon: React.ReactNode;
  finding: any;
  ip: string;
  port: number;
}) {
  const url = finding.raw_output?.url ?? `${label.toLowerCase()}://${ip}:${port}/`;
  const statusCode = finding.raw_output?.status_code as number | undefined;
  const hasTitle = finding.value && !finding.value.startsWith("(sem <title>");
  const tone = statusTone(statusCode);
  return (
    <div className="swit-card">
      <div className="swit-card-hd">
        <div className="swit-card-icon">{icon}</div>
        <div className="swit-card-title">
          {label} · porta {port}
        </div>
        {statusCode && (
          <span className="swit-pill" style={{ "--c": tone } as React.CSSProperties}>
            {statusCode}
          </span>
        )}
      </div>
      <div className={`swit-http-title ${hasTitle ? "" : "muted"}`}>
        {hasTitle ? finding.value : "Sem <title> na página"}
      </div>
      <a className="swit-http-link" href={url} target="_blank" rel="noreferrer">
        {ip}:{port} <ExternalLink size={11} />
      </a>
    </div>
  );
}

// Pior classificação entre os compartilhamentos SMB abertos do host
function worstShare(
  findings: Array<{ kind: string; status: string; classification?: string | null }>,
): "critico" | "revisar" | null {
  const shares = findings.filter((f) => f.kind === "smb_share" && f.status === "open");
  if (shares.some((f) => f.classification === "critico")) return "critico";
  if (shares.some((f) => f.classification === "revisar")) return "revisar";
  return null;
}
const RISK_RANK = { critico: 0, revisar: 1 } as const;

function HostRow({
  host,
  findings,
  onVerify,
  verifying,
  selected,
  onSelect,
  columnOrder,
}: {
  host: any;
  findings: any[];
  onVerify: (ip: string) => void;
  verifying: boolean;
  selected: boolean;
  onSelect: (ip: string) => void;
  columnOrder: HostColumnKey[];
}) {
  const services = React.useMemo(() => {
    const kinds = new Set(
      findings.map((f) => (f.kind === "http_title" ? f.name : KIND_LABEL[f.kind])),
    );
    return [...kinds].filter(Boolean) as string[];
  }, [findings]);
  const shares = findings.filter((f) => f.kind === "smb_share" && f.status === "open");
  const hasDetail = findings.length > 0;
  const worst = worstShare(findings);

  const cell: Record<HostColumnKey, React.ReactNode> = {
    ip: (
      <>
        <div className="swit-mono" style={{ fontWeight: 500, fontSize: 13 }}>
          {host.ip}
        </div>
        <div className="swit-dim" style={{ fontSize: 12, marginTop: 1 }}>
          {host.hostname ?? <span style={{ fontStyle: "italic" }}>sem nome NetBIOS</span>}
        </div>
      </>
    ),
    cmdb: host.in_cmdb ? (
      <span className="swit-pill" style={{ "--c": T.success } as React.CSSProperties}>
        No CMDB
      </span>
    ) : (
      <span className="swit-pill" style={{ "--c": T.critical } as React.CSSProperties}>
        Fora do CMDB
      </span>
    ),
    services: (
      <div className="swit-tags">
        {services.map((s) => (
          <span key={s} className="swit-tag">
            {s}
          </span>
        ))}
        {shares.length > 0 && (
          <span
            className={`swit-tag${worst ? " tone" : ""}`}
            style={worst ? ({ "--c": CLASS_TONE[worst].color } as React.CSSProperties) : undefined}
          >
            <Folder size={11} /> SMB · {shares.length}
          </span>
        )}
        {services.length === 0 && shares.length === 0 && <span className="swit-dim">—</span>}
      </div>
    ),
    risk: worst ? (
      <span className="swit-pill" style={{ "--c": CLASS_TONE[worst].color } as React.CSSProperties}>
        {CLASS_TONE[worst].label}
      </span>
    ) : (
      <span className="swit-dim">—</span>
    ),
    source: <span className="swit-tag">{host.source ?? "—"}</span>,
    lastSeen: fmtRel(host.last_seen_at),
  };
  const cellStyle: Partial<Record<HostColumnKey, React.CSSProperties>> = {
    lastSeen: { color: T.textMuted, whiteSpace: "nowrap" },
  };

  return (
    <tr
      className={`swit-row-clickable ${selected ? "selected" : ""}`}
      onClick={() => hasDetail && onSelect(host.ip)}
    >
      {columnOrder.map((key) => (
        <td key={key} style={cellStyle[key]}>
          {cell[key]}
        </td>
      ))}
      <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
        <button
          className="swit-icon-btn"
          disabled={verifying}
          onClick={() => onVerify(host.ip)}
          title="Verificar só este host"
          aria-label="Verificar só este host"
        >
          {verifying ? <Loader2 size={14} className="swit-spin" /> : <RefreshCw size={14} />}
        </button>
      </td>
    </tr>
  );
}

// Painel lateral do host (padrão v2 do DetailSheet): identificação NetBIOS,
// serviços web e compartilhamentos SMB, com a verificação do host no rodapé.
function HostDetailsSheet({
  open,
  onOpenChange,
  host,
  findings,
  onSetStatus,
  onVerify,
  verifying,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  host: any | null;
  findings: any[];
  onSetStatus: (findingId: string, status: "resolved" | "false_positive") => void;
  onVerify: (ip: string) => void;
  verifying: boolean;
}) {
  // Mantém o último host exibido enquanto o painel anima a saída -- `host` vira
  // null no mesmo instante em que o fechamento começa.
  const [lastHost, setLastHost] = React.useState<any | null>(host);
  React.useEffect(() => {
    if (host) setLastHost(host);
  }, [host]);

  const host_ = host ?? lastHost;
  if (!host_) return null;

  const shares = findings.filter((f) => f.kind === "smb_share" && f.status === "open");
  const netbios = findings.find((f) => f.kind === "netbios");
  const http = findings.find((f) => f.kind === "http_title" && f.name === "HTTP");
  const https = findings.find((f) => f.kind === "http_title" && f.name === "HTTPS");
  const ftp = findings.find((f) => f.kind === "ftp_banner");
  const worst = worstShare(findings);

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      width={600}
      eyebrow={`Fonte ${host_.source ?? "—"} · visto ${fmtRel(host_.last_seen_at)}`}
      title={<span className="font-data">{host_.ip}</span>}
      badges={
        <>
          <span
            className="swit-pill"
            style={{ "--c": host_.in_cmdb ? T.success : T.critical } as React.CSSProperties}
          >
            {host_.in_cmdb ? "No CMDB" : "Fora do CMDB"}
          </span>
          {worst && (
            <span
              className="swit-pill"
              style={{ "--c": CLASS_TONE[worst].color } as React.CSSProperties}
            >
              Risco {CLASS_TONE[worst].label.toLowerCase()}
            </span>
          )}
        </>
      }
      footer={
        <>
          <button
            className="swit-btn dng"
            style={{ marginRight: "auto" }}
            onClick={() => onOpenChange(false)}
          >
            Fechar
          </button>
          <button className="swit-btn" disabled={verifying} onClick={() => onVerify(host_.ip)}>
            {verifying ? <Loader2 size={14} className="swit-spin" /> : <RefreshCw size={14} />}
            Verificar este host
          </button>
        </>
      }
    >
      <DetailSection title="Identificação (NetBIOS)">
        {netbios ? (
          <div className="swit-netb">
            <span className="swit-netb-ic">
              <Monitor size={17} />
            </span>
            <div>
              <div className="swit-netbios-name">{netbios.name}</div>
              <div className="swit-netbios-group">
                Grupo de trabalho/domínio <b>{netbios.value ?? "—"}</b>
              </div>
            </div>
          </div>
        ) : (
          <p className="swit-note">
            {host_.hostname ? `${host_.hostname} · ` : ""}O host não respondeu ao NetBIOS.
          </p>
        )}
      </DetailSection>

      <DetailSection title="Serviços web">
        {http || https ? (
          <div className="swit-web">
            {http ? (
              <HttpCard
                label="HTTP"
                icon={<Globe size={14} />}
                finding={http}
                ip={host_.ip}
                port={80}
              />
            ) : (
              <EmptyWebCard label="HTTP" icon={<Globe size={14} />} />
            )}
            {https ? (
              <HttpCard
                label="HTTPS"
                icon={<Lock size={14} />}
                finding={https}
                ip={host_.ip}
                port={443}
              />
            ) : (
              <EmptyWebCard label="HTTPS" icon={<Lock size={14} />} />
            )}
          </div>
        ) : (
          <p className="swit-note">Nenhum serviço HTTP ou HTTPS respondeu.</p>
        )}
        {ftp && (
          <p className="swit-note" style={{ marginTop: 10 }}>
            FTP respondendo na porta 21: <span className="font-data">{ftp.value}</span>
          </p>
        )}
      </DetailSection>

      <DetailSection title={`Compartilhamentos SMB${shares.length ? ` (${shares.length})` : ""}`}>
        {shares.length === 0 ? (
          <p className="swit-note">
            Nenhum compartilhamento aberto (ou sem credencial SMB configurada).
          </p>
        ) : (
          <div className="swit-share-list">
            {shares.map((f) => {
              const tone = CLASS_TONE[f.classification as string];
              const uncPath = `\\\\${host_.ip}\\${f.name}`;
              const perm = (f.permission ?? "").toLowerCase();
              return (
                <div key={f.id} className={`swit-share-card ${f.classification ?? ""}`}>
                  <div className="swit-share-icon">
                    <Folder size={15} />
                  </div>
                  <div className="swit-share-main">
                    <span className="swit-share-name">{f.name}</span>
                    {tone && (
                      <span
                        className="swit-pill"
                        style={{ "--c": tone.color } as React.CSSProperties}
                      >
                        {tone.label}
                      </span>
                    )}
                    <span
                      className="swit-badge"
                      style={
                        {
                          "--c": perm.includes("write") ? T.critical : T.textMuted,
                        } as React.CSSProperties
                      }
                    >
                      {f.permission ?? "—"}
                    </span>
                  </div>
                  <div className="swit-share-acts">
                    <button className="swit-btn sm" onClick={() => onSetStatus(f.id, "resolved")}>
                      Resolvido
                    </button>
                    <button
                      className="swit-btn sm dng"
                      onClick={() => onSetStatus(f.id, "false_positive")}
                    >
                      Falso positivo
                    </button>
                  </div>
                  <CopyableText value={uncPath} />
                </div>
              );
            })}
          </div>
        )}
      </DetailSection>
    </DetailSheet>
  );
}

function EmptyWebCard({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="swit-card">
      <div className="swit-card-hd">
        <div className="swit-card-icon">{icon}</div>
        <div className="swit-card-title">{label}</div>
        <span className="swit-pill" style={{ "--c": T.textMuted } as React.CSSProperties}>
          sem resposta
        </span>
      </div>
      <div className="swit-http-title muted">Porta fechada ou sem título</div>
    </div>
  );
}

export function ShadowItDashboard() {
  const fetchAccess = useServerFn(getShadowItAccess);
  const fetchHosts = useServerFn(listShadowItHosts);
  const fetchFindings = useServerFn(listShadowItFindings);
  const fetchScans = useServerFn(listShadowItScans);
  const startScan = useServerFn(startShadowItScan);
  const cancelScan = useServerFn(cancelShadowItScan);
  const deleteScan = useServerFn(deleteShadowItScan);
  const setFindingStatus = useServerFn(setShadowItFindingStatus);

  const qc = useQueryClient();
  const [view, setView] = React.useState<"hosts" | "scans">("hosts");
  const [credDlgOpen, setCredDlgOpen] = React.useState(false);
  const [subnetDlgOpen, setSubnetDlgOpen] = React.useState(false);
  const [selectedIp, setSelectedIp] = React.useState<string | null>(null);
  const [cmdbFilter, setCmdbFilter] = React.useState<"all" | "out" | "in">("all");
  const [svcFilter, setSvcFilter] = React.useState<"all" | "SMB" | "HTTP" | "FTP">("all");
  // Lazy init -- lê do localStorage só uma vez, na primeira renderização.
  const [columnOrder, setColumnOrder] = React.useState<HostColumnKey[]>(() =>
    loadHostColumnOrder(),
  );
  const [sortKey, setSortKey] = React.useState<HostColumnKey>("lastSeen");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const toggleSort = (key: HostColumnKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const access = useQuery({ queryKey: ["shadowit-access"], queryFn: () => fetchAccess() });
  const hostsQ = useQuery({
    queryKey: ["shadowit-hosts"],
    queryFn: () => fetchHosts(),
    refetchInterval: 20000,
  });
  const findingsQ = useQuery({
    queryKey: ["shadowit-findings"],
    queryFn: () => fetchFindings(),
    refetchInterval: 20000,
  });
  const scansQ = useQuery({
    queryKey: ["shadowit-scans"],
    queryFn: () => fetchScans(),
    refetchInterval: 8000,
  });

  const hosts = React.useMemo(() => hostsQ.data?.hosts ?? [], [hostsQ.data]);
  const findings = React.useMemo(() => findingsQ.data?.findings ?? [], [findingsQ.data]);
  const selectedHost = React.useMemo(
    () => hosts.find((h: any) => h.ip === selectedIp) ?? null,
    [hosts, selectedIp],
  );
  const scans = scansQ.data?.scans ?? [];

  const findingsByIp = React.useMemo(() => {
    const m = new Map<string, any[]>();
    for (const f of findings as any[]) {
      if (!m.has(f.ip)) m.set(f.ip, []);
      m.get(f.ip)!.push(f);
    }
    return m;
  }, [findings]);

  // IP ordenado numericamente (octeto por octeto) -- comparação de texto
  // colocaria "192.168.100.9" depois de "192.168.100.10", errado.
  const ipToNum = (ip: string) =>
    ip.split(".").reduce((acc, oct) => acc * 256 + (Number(oct) || 0), 0);

  const sortedHosts = React.useMemo(() => {
    const arr = [...hosts];
    arr.sort((a: any, b: any) => {
      let cmp = 0;
      switch (sortKey) {
        case "ip":
          cmp = ipToNum(a.ip) - ipToNum(b.ip);
          break;
        case "source":
          cmp = (a.source ?? "").localeCompare(b.source ?? "");
          break;
        case "lastSeen":
          cmp = new Date(a.last_seen_at).getTime() - new Date(b.last_seen_at).getTime();
          break;
        case "cmdb":
          cmp = Number(a.in_cmdb) - Number(b.in_cmdb);
          break;
        case "services":
          cmp = (findingsByIp.get(a.ip)?.length ?? 0) - (findingsByIp.get(b.ip)?.length ?? 0);
          break;
        case "risk": {
          const ra = worstShare(findingsByIp.get(a.ip) ?? []);
          const rb = worstShare(findingsByIp.get(b.ip) ?? []);
          cmp = (ra ? RISK_RANK[ra] : 2) - (rb ? RISK_RANK[rb] : 2);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [hosts, sortKey, sortDir, findingsByIp]);

  const visibleHosts = React.useMemo(
    () =>
      sortedHosts.filter((h) => {
        if (cmdbFilter === "out" && h.in_cmdb) return false;
        if (cmdbFilter === "in" && !h.in_cmdb) return false;
        if (svcFilter === "all") return true;
        const fs = findingsByIp.get(h.ip) ?? [];
        if (svcFilter === "SMB")
          return fs.some((f) => f.kind === "smb_share" && f.status === "open");
        if (svcFilter === "HTTP") return fs.some((f) => f.kind === "http_title");
        return fs.some((f) => f.kind === "ftp_banner");
      }),
    [sortedHosts, cmdbFilter, svcFilter, findingsByIp],
  );
  const kpis = React.useMemo(() => {
    const smb = (findings as any[]).filter((f) => f.kind === "smb_share" && f.status === "open");
    const hostsWith = (kind: string) =>
      new Set(findings.filter((f) => f.kind === kind).map((f) => f.ip)).size;
    return {
      outCmdb: hosts.filter((h: { in_cmdb?: boolean }) => !h.in_cmdb).length,
      httpHosts: hostsWith("http_title"),
      writable: smb.filter((f) => /write|escrita|rw/i.test(String(f.permission ?? ""))).length,
      hosts: hosts.length,
      http: (findings as any[]).filter((f) => f.kind === "http_title").length,
      ftp: (findings as any[]).filter((f) => f.kind === "ftp_banner").length,
      smbShares: smb.length,
      criticos: smb.filter((f) => f.classification === "critico").length,
    };
  }, [hosts, findings]);

  // ips=undefined -> varre todo host catalogado; ips=[x] -> só um host
  // (verificação individual). O mesmo mutation serve pros dois botões --
  // `verifying` na linha compara startMutation.variables com o IP da linha.
  const startMutation = useMutation({
    mutationFn: (ips?: string[]) => startScan({ data: ips ? { ips } : {} }),
    onSuccess: (_data, ips) => {
      toast.success(ips ? `Verificando ${ips[0]}…` : "Varredura iniciada em todos os hosts");
      qc.invalidateQueries({ queryKey: ["shadowit-scans"] });
      if (!ips) setView("scans");
    },
    onError: (e: any) => toast.error(e.message ?? "Falha ao iniciar varredura"),
  });

  const cancelMutation = useMutation({
    mutationFn: (scanId: string) => cancelScan({ data: { scanId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shadowit-scans"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (scanId: string) => deleteScan({ data: { scanId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shadowit-scans"] }),
    onError: (e: any) => toast.error(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: { findingId: string; status: "resolved" | "false_positive" }) =>
      setFindingStatus({ data: vars }),
    onSuccess: () => {
      toast.success("Achado atualizado");
      qc.invalidateQueries({ queryKey: ["shadowit-findings"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  if (access.isLoading) return <ModuleLoading />;
  if (access.data && !access.data.allowed) {
    return (
      <div className="swit-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="swit-panel swit-empty">
          <Lock size={20} color={T.critical} style={{ margin: "0 auto 8px" }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: T.textPrimary }}>Acesso restrito</div>
          Você não tem permissão para acessar este módulo.
        </div>
      </div>
    );
  }

  return (
    <div className="swit-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="swit-ph">
        <div>
          <h1 className="swit-ph-title">Shadow IT</h1>
          <p className="swit-ph-sub">
            Hosts da rede interna sem cadastro em DNS, com compartilhamentos e serviços expostos
          </p>
        </div>
        <div className="swit-ph-actions">
          <button className="swit-btn" onClick={() => setCredDlgOpen(true)}>
            <KeyRound size={14} /> Credencial SMB
          </button>
          <button className="swit-btn" onClick={() => setSubnetDlgOpen(true)}>
            <Plus size={14} /> Nova varredura
          </button>
          <button
            className="swit-btn pri"
            disabled={(startMutation.isPending && !startMutation.variables) || hosts.length === 0}
            onClick={() => startMutation.mutate(undefined)}
            title={
              hosts.length === 0
                ? "Nenhum host catalogado ainda"
                : "Verifica SMB, HTTP, FTP e NetBIOS em todos os hosts"
            }
          >
            {startMutation.isPending && !startMutation.variables ? (
              <Loader2 size={14} className="swit-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            Verificar todos
          </button>
        </div>
      </div>

      <div className="swit-subnav" role="tablist" aria-label="Seções do Shadow IT">
        <button
          type="button"
          role="tab"
          aria-selected={view === "hosts"}
          onClick={() => setView("hosts")}
        >
          Hosts <span className="n">{hosts.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "scans"}
          onClick={() => setView("scans")}
        >
          Varreduras
          {scans.some((x) => x.status === "running" || x.status === "queued") && (
            <span className="live">em execução</span>
          )}
        </button>
      </div>

      {view === "hosts" ? (
        <>
          <div className="swit-kpis">
            <div className="swit-kpi">
              <span className="swit-kpi-label">Hosts não catalogados</span>
              <span className="swit-kpi-value">{kpis.hosts}</span>
              <span className="swit-kpi-foot">sem nome em DNS interno</span>
            </div>
            <button
              type="button"
              className="swit-kpi"
              aria-pressed={cmdbFilter === "out"}
              onClick={() => setCmdbFilter((c) => (c === "out" ? "all" : "out"))}
            >
              <span className="swit-kpi-label">
                {kpis.outCmdb > 0 && (
                  <span className="swit-sw" style={{ background: T.critical }} />
                )}
                Fora do CMDB
              </span>
              <span className="swit-kpi-value">{kpis.outCmdb}</span>
              <div className="swit-meter">
                <i
                  style={{
                    width: `${kpis.hosts ? (kpis.outCmdb / kpis.hosts) * 100 : 0}%`,
                    background: T.critical,
                  }}
                />
              </div>
              <span className="swit-kpi-foot">
                {kpis.hosts ? Math.round((kpis.outCmdb / kpis.hosts) * 100) : 0}% dos hosts
                encontrados
              </span>
            </button>
            <button
              type="button"
              className="swit-kpi"
              aria-pressed={svcFilter === "HTTP"}
              onClick={() => setSvcFilter((c) => (c === "HTTP" ? "all" : "HTTP"))}
            >
              <span className="swit-kpi-label">
                <Globe size={13} /> Serviços web
              </span>
              <span className="swit-kpi-value">{kpis.http}</span>
              <span className="swit-kpi-foot">HTTP/HTTPS com título em {kpis.httpHosts} hosts</span>
            </button>
            <button
              type="button"
              className="swit-kpi"
              aria-pressed={svcFilter === "FTP"}
              onClick={() => setSvcFilter((c) => (c === "FTP" ? "all" : "FTP"))}
            >
              <span className="swit-kpi-label">FTP</span>
              <span className="swit-kpi-value">{kpis.ftp}</span>
              <span className="swit-kpi-foot">servidores FTP respondendo</span>
            </button>
            <button
              type="button"
              className="swit-kpi"
              aria-pressed={svcFilter === "SMB"}
              onClick={() => setSvcFilter((c) => (c === "SMB" ? "all" : "SMB"))}
            >
              <span className="swit-kpi-label">
                <Folder size={13} /> Compartilhamentos SMB
              </span>
              <span className="swit-kpi-value">{kpis.smbShares}</span>
              <span className="swit-kpi-foot">{kpis.writable} com escrita liberada</span>
            </button>
            <div className="swit-kpi">
              <span className="swit-kpi-label">
                {kpis.criticos > 0 && (
                  <span className="swit-sw" style={{ background: T.critical }} />
                )}
                Compartilhamentos críticos
              </span>
              <span className="swit-kpi-value">{kpis.criticos}</span>
              <span className="swit-kpi-foot">dados sensíveis expostos</span>
            </div>
          </div>
          <div className="swit-panel">
            <div className="swit-tbar">
              <b>
                Hosts{" "}
                <span>
                  (
                  {visibleHosts.length === hosts.length
                    ? hosts.length
                    : `${visibleHosts.length} de ${hosts.length}`}
                  )
                </span>
              </b>
              <div className="swit-seg" role="group" aria-label="CMDB">
                {(
                  [
                    ["all", "Todos"],
                    ["out", "Fora do CMDB"],
                    ["in", "No CMDB"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={cmdbFilter === k}
                    onClick={() => setCmdbFilter(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div className="swit-seg" role="group" aria-label="Serviço">
                {(
                  [
                    ["all", "Qualquer serviço"],
                    ["SMB", "SMB"],
                    ["HTTP", "HTTP"],
                    ["FTP", "FTP"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={svcFilter === k}
                    onClick={() => setSvcFilter(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <div style={{ marginLeft: "auto" }}>
                <ColumnOrderPicker
                  order={columnOrder}
                  onChange={(next) => {
                    setColumnOrder(next);
                    try {
                      localStorage.setItem(HOST_COLUMN_STORAGE_KEY, JSON.stringify(next));
                    } catch {
                      /* localStorage indisponível (modo privado etc.) -- ordem só não persiste */
                    }
                  }}
                />
              </div>
            </div>
            {hostsQ.isLoading ? (
              <div className="swit-empty">
                <Loader2 size={14} className="swit-spin" /> Carregando…
              </div>
            ) : hosts.length === 0 ? (
              <div className="swit-empty">
                Nenhum host encontrado ainda — rode uma descoberta de rede interna no DAST Scanner
                (Ativos Descobertos → Nova descoberta). Host que não resolve hostname em DNS interno
                cai aqui automaticamente.
              </div>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
                <table className="swit-table">
                  <thead>
                    <tr>
                      {columnOrder.map((key) => (
                        <th
                          key={key}
                          className="sort"
                          aria-sort={
                            sortKey === key
                              ? sortDir === "asc"
                                ? "ascending"
                                : "descending"
                              : undefined
                          }
                          onClick={() => toggleSort(key)}
                          title="Clique para ordenar"
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            {HOST_COLUMN_LABEL[key]}
                            {sortKey === key &&
                              (sortDir === "asc" ? (
                                <ChevronUp size={10} />
                              ) : (
                                <ChevronDown size={10} />
                              ))}
                          </span>
                        </th>
                      ))}
                      <th>
                        <span style={{ fontSize: 0 }}>Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHosts.length === 0 && (
                      <tr>
                        <td colSpan={columnOrder.length + 1} className="swit-empty">
                          Nenhum host com esses filtros.
                        </td>
                      </tr>
                    )}
                    {visibleHosts.map((h: any) => (
                      <HostRow
                        key={h.id}
                        host={h}
                        findings={findingsByIp.get(h.ip) ?? []}
                        onVerify={(ip) => startMutation.mutate([ip])}
                        verifying={startMutation.isPending && startMutation.variables?.[0] === h.ip}
                        selected={selectedIp === h.ip}
                        onSelect={(ip) => setSelectedIp((cur) => (cur === ip ? null : ip))}
                        columnOrder={columnOrder}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="swit-panel">
          <div className="swit-tbar">
            <b>
              Varreduras <span>({scans.length})</span>
            </b>
            <span className="swit-dim" style={{ fontSize: 12.5 }}>
              Verificam SMB, HTTP, FTP e NetBIOS em cada host
            </span>
          </div>
          {scansQ.isLoading ? (
            <div className="swit-empty">
              <Loader2 size={14} className="swit-spin" /> Carregando…
            </div>
          ) : scans.length === 0 ? (
            <div className="swit-empty">Nenhuma varredura ainda — clique em "Verificar todos".</div>
          ) : (
            <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
              <table className="swit-table">
                <thead>
                  <tr>
                    <th>Varredura</th>
                    <th>Alvos</th>
                    <th>Status</th>
                    <th>Progresso</th>
                    <th>Criada</th>
                    <th>Duração</th>
                    <th>
                      <span style={{ fontSize: 0 }}>Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((s: any) => {
                    const tone = STATUS_TONE[s.status] ?? T.textMuted;
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 500 }}>{s.name ?? "—"}</td>
                        <td className="swit-dim">
                          {(s.targets ?? []).length}{" "}
                          {(s.targets ?? []).length === 1 ? "host" : "hosts"}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <span
                            className={`swit-pill${s.status === "running" ? " live" : ""}`}
                            style={{ "--c": tone } as React.CSSProperties}
                          >
                            {STATUS_LABEL[s.status] ?? s.status}
                          </span>
                          {s.error && (
                            <span
                              title={s.error}
                              style={{
                                marginLeft: 6,
                                display: "inline-flex",
                                verticalAlign: "middle",
                                color: T.critical,
                                cursor: "help",
                              }}
                            >
                              <XCircle size={13} />
                            </span>
                          )}
                        </td>
                        <td>
                          <div className="swit-progress">
                            <span className="tr">
                              <i
                                style={{
                                  width: `${s.progress ?? 0}%`,
                                  background:
                                    s.status === "error"
                                      ? T.critical
                                      : s.status === "done"
                                        ? T.success
                                        : T.accent,
                                }}
                              />
                            </span>
                            <span>{s.progress ?? 0}%</span>
                          </div>
                        </td>
                        <td className="swit-dim" style={{ whiteSpace: "nowrap" }}>
                          {fmtRel(s.created_at)}
                        </td>
                        <td className="swit-mono swit-dim" style={{ whiteSpace: "nowrap" }}>
                          {fmtDuration(s.started_at, s.finished_at)}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 2, justifyContent: "flex-end" }}>
                            {(s.status === "queued" || s.status === "running") && (
                              <button
                                className="swit-icon-btn danger"
                                onClick={() => cancelMutation.mutate(s.id)}
                                title="Cancelar"
                                aria-label="Cancelar"
                              >
                                <Ban size={14} />
                              </button>
                            )}
                            {s.status !== "queued" && s.status !== "running" && (
                              <button
                                className="swit-icon-btn danger"
                                onClick={() => deleteMutation.mutate(s.id)}
                                title="Excluir"
                                aria-label="Excluir"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <CredentialDialog open={credDlgOpen} onOpenChange={setCredDlgOpen} />
      <SubnetScanDialog open={subnetDlgOpen} onOpenChange={setSubnetDlgOpen} />
      <HostDetailsSheet
        open={!!selectedIp}
        onOpenChange={(o) => !o && setSelectedIp(null)}
        host={selectedHost}
        findings={selectedHost ? (findingsByIp.get(selectedHost.ip) ?? []) : []}
        onSetStatus={(findingId, status) => statusMutation.mutate({ findingId, status })}
        onVerify={(ip) => startMutation.mutate([ip])}
        verifying={
          startMutation.isPending &&
          !!selectedHost &&
          startMutation.variables?.[0] === selectedHost.ip
        }
      />
    </div>
  );
}
