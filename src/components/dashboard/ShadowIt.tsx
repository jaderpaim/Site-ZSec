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
  Server,
  Wifi,
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
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
  accentBg: "rgba(59,130,246,0.12)",
  critical: "#EF4444",
  high: "#F59E0B",
  success: "#10B981",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-64748b, #64748B)",
  textSubtle: "var(--tl-475569, #475569)",
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
  .swit-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .swit-root * { box-sizing:border-box; }
  @keyframes swit-spin { to { transform:rotate(360deg) } }
  .swit-spin { animation:swit-spin 0.75s linear infinite; }
  .swit-hdr { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .swit-hdr-brand { display:flex; align-items:center; gap:12px; }
  .swit-hdr-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.accentBg}; border:1px solid rgba(59,130,246,0.3); }
  .swit-hdr-title { font-size:15px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .swit-hdr-sub { font-size:11px; color:${T.textMuted}; margin-top:2px; }
  .swit-tabs { display:flex; gap:4px; }
  .swit-tab { padding:7px 16px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; border:1px solid transparent; background:transparent; color:${T.textSecondary}; font-family:'DM Sans',sans-serif; }
  .swit-tab.on { background:${T.accentBg}; border-color:rgba(59,130,246,0.35); color:${T.accent}; }
  .swit-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
  @media (max-width:1100px){ .swit-kpis { grid-template-columns:repeat(2,1fr); } }
  .swit-kpi { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; padding:14px 16px; position:relative; overflow:hidden; }
  .swit-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .swit-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:6px; }
  .swit-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; line-height:1; color:var(--kc,${T.textPrimary}); font-variant-numeric:tabular-nums; }
  .swit-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .swit-panel-hdr { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; flex-wrap:wrap; }
  .swit-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }
  .swit-table { width:100%; border-collapse:collapse; }
  .swit-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; border-bottom:1px solid ${T.border}; white-space:nowrap; position:sticky; top:0; background:${T.surface}; z-index:1; }
  .swit-table td { padding:10px 12px; border-bottom:1px solid rgba(var(--tl-line-rgb, 30,38,64),0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .swit-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .swit-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; text-transform:uppercase; }
  .swit-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; white-space:nowrap; border:1px solid transparent; }
  .swit-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .swit-btn.pri { background:${T.accentBg}; border-color:rgba(59,130,246,0.35); color:${T.accent}; }
  .swit-btn.gst { background:transparent; border-color:${T.border}; color:${T.textSecondary}; padding:5px 10px; }
  .swit-btn.dng { background:transparent; border:none; color:${T.textMuted}; padding:5px 8px; }
  .swit-btn.dng:hover:not(:disabled) { color:${T.critical}; }
  .swit-empty { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }
  .swit-detail-wrap { display:flex; flex-direction:column; gap:14px; }
  .swit-row-clickable { cursor:pointer; }
  .swit-row-clickable.selected td { background:rgba(59,130,246,0.07); }
  .swit-copy-btn { display:inline-flex; align-items:center; gap:6px; background:none; border:none; padding:0; cursor:pointer; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; font-size:11.5px; margin-top:2px; }
  .swit-copy-btn:hover { color:${T.accent}; }
  .swit-card-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  @media (max-width:820px){ .swit-card-grid { grid-template-columns:1fr; } }
  .swit-card { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
  .swit-card-hd { display:flex; align-items:center; gap:8px; }
  .swit-card-icon { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; background:${T.accentBg}; flex:none; }
  .swit-card-title { font-family:'IBM Plex Mono',monospace; font-size:9.5px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; }
  .swit-netbios-name { font-family:'Space Grotesk',sans-serif; font-size:17px; font-weight:700; }
  .swit-netbios-group { font-size:12px; color:${T.textSecondary}; }
  .swit-netbios-group b { color:${T.textPrimary}; font-weight:600; }
  .swit-status-pill { display:inline-block; font-family:'IBM Plex Mono',monospace; font-size:11px; font-weight:700; padding:2px 8px; border-radius:5px; }
  .swit-http-title { font-size:13px; color:${T.textPrimary}; line-height:1.35; }
  .swit-http-title.muted { color:${T.textMuted}; font-style:italic; }
  .swit-http-link { display:flex; align-items:center; gap:5px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:${T.accent}; text-decoration:none; margin-top:auto; padding-top:8px; border-top:1px dashed ${T.border}; }
  .swit-http-link:hover { text-decoration:underline; }
  .swit-section-hd { display:flex; align-items:center; gap:8px; font-family:'IBM Plex Mono',monospace; font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; margin-bottom:10px; }
  .swit-share-list { display:flex; flex-direction:column; gap:8px; }
  .swit-share-card { display:flex; align-items:center; gap:14px; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px; padding:11px 14px; flex-wrap:wrap; }
  .swit-share-card.critico { border-color:rgba(239,68,68,0.4); }
  .swit-share-icon { width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex:none; }
  .swit-share-icon.revisar { background:rgba(245,158,11,0.14); color:${T.high}; }
  .swit-share-icon.critico { background:rgba(239,68,68,0.14); color:${T.critical}; }
  .swit-share-icon.esperado { background:rgba(16,185,129,0.14); color:${T.success}; }
  .swit-share-main { flex:1; min-width:160px; }
  .swit-share-name { font-family:'Space Grotesk',sans-serif; font-size:14px; font-weight:700; }
  .swit-share-meta { display:flex; align-items:center; gap:10px; flex:none; }
  .swit-perm-pill { font-family:'IBM Plex Mono',monospace; font-size:10.5px; font-weight:700; padding:3px 9px; border-radius:999px; white-space:nowrap; }
  .swit-perm-pill.rw { background:rgba(239,68,68,0.14); color:${T.critical}; }
  .swit-perm-pill.ro { background:rgba(148,163,184,0.14); color:${T.textSecondary}; }
  .swit-icon-btn { width:26px; height:26px; border-radius:6px; border:1px solid ${T.border}; background:transparent; color:${T.textMuted}; display:flex; align-items:center; justify-content:center; cursor:pointer; }
  .swit-icon-btn:hover { color:${T.textPrimary}; border-color:${T.borderHi}; }
  .swit-field { display:flex; flex-direction:column; gap:5px; }
  .swit-field-lbl { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
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
type HostColumnKey = "ip" | "services" | "source" | "lastSeen" | "cmdb";
const HOST_COLUMN_LABEL: Record<HostColumnKey, string> = {
  ip: "IP",
  services: "Serviços",
  source: "Fonte",
  lastSeen: "Visto por último",
  cmdb: "CMDB",
};
const DEFAULT_HOST_COLUMN_ORDER: HostColumnKey[] = ["ip", "services", "source", "lastSeen", "cmdb"];
const HOST_COLUMN_STORAGE_KEY = "shadowit-hosts-column-order";

function loadHostColumnOrder(): HostColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_HOST_COLUMN_ORDER; // SSR -- localStorage não existe no servidor
  try {
    const raw = localStorage.getItem(HOST_COLUMN_STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as string[]) : [];
    const valid = saved.filter((k): k is HostColumnKey => (Object.keys(HOST_COLUMN_LABEL) as string[]).includes(k));
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
          <Settings2 size={13} /> Colunas
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, color: T.textPrimary, width: 220 }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: T.textMuted,
            marginBottom: 8,
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          Ordem das colunas
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
                  className="swit-btn gst"
                  style={{ padding: "2px 6px" }}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ChevronUp size={12} />
                </button>
                <button
                  className="swit-btn gst"
                  style={{ padding: "2px 6px" }}
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

function CredentialDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
      <DialogContent style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}>
        <DialogHeader>
          <DialogTitle style={{ color: T.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>
            Credencial de domínio (SMB)
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12, color: T.textSecondary }}>
          <p>
            Usada pra enumerar compartilhamento SMB dos hosts — sessão anônima está bloqueada nessa rede, então sem
            credencial essa parte da varredura fica vazia. Guardada cifrada (AES-256-GCM), nunca exibida de volta.
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
              placeholder="BERNOULLI\svc-shadowit"
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
            {saveMutation.isPending ? <Loader2 size={13} className="swit-spin" /> : <KeyRound size={13} />} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SubnetScanDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
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
      <DialogContent style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}>
        <DialogHeader>
          <DialogTitle style={{ color: T.textPrimary, fontFamily: "'Space Grotesk',sans-serif" }}>
            Varrer faixa de IP
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 12, color: T.textSecondary }}>
          <p>
            Faz o ping sweep da subnet — todo host encontrado (com ou sem hostname resolvido) cai automaticamente aqui,
            em Hosts. Não aparece no DAST Scanner. Só faixa privada (RFC1918).
          </p>
          <div className="swit-field">
            <span className="swit-field-lbl">Subnet (CIDR)</span>
            <Input value={subnet} onChange={(e) => setSubnet(e.target.value)} placeholder="192.168.100.0/24" />
          </div>
        </div>
        <DialogFooter>
          <button
            className="swit-btn pri"
            disabled={!subnet.trim() || mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            {mutation.isPending ? <Loader2 size={13} className="swit-spin" /> : <ScanSearch size={13} />} Iniciar
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

function CopyableText({ value, className = "swit-copy-btn" }: { value: string; className?: string }) {
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
      </div>
      {statusCode && (
        <span className="swit-status-pill" style={{ background: `color-mix(in srgb, ${tone} 13%, transparent)`, color: tone }}>
          {statusCode}
        </span>
      )}
      <div className={`swit-http-title ${hasTitle ? "" : "muted"}`}>
        {hasTitle ? finding.value : "Sem <title> na página"}
      </div>
      <a className="swit-http-link" href={url} target="_blank" rel="noreferrer">
        <ExternalLink size={11} />
        {ip}:{port}
      </a>
    </div>
  );
}

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
    const kinds = new Set(findings.map((f) => (f.kind === "http_title" ? f.name : KIND_LABEL[f.kind])));
    return [...kinds].filter(Boolean) as string[];
  }, [findings]);
  const shares = findings.filter((f) => f.kind === "smb_share" && f.status === "open");
  const hasDetail = findings.length > 0;
  const worst = shares.some((f) => f.classification === "critico")
    ? "critico"
    : shares.some((f) => f.classification === "revisar")
      ? "revisar"
      : null;

  const cell: Record<HostColumnKey, React.ReactNode> = {
    ip: (
      <>
        <div style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{host.ip}</div>
        {host.hostname && <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 1 }}>{host.hostname}</div>}
      </>
    ),
    cmdb: host.in_cmdb ? (
      <span className="swit-badge" style={{ background: `color-mix(in srgb, ${T.success} 13%, transparent)`, color: T.success }}>
        No CMDB
      </span>
    ) : (
      <span className="swit-badge" style={{ background: `color-mix(in srgb, ${T.critical} 13%, transparent)`, color: T.critical }}>
        Fora do CMDB
      </span>
    ),
    services: (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {services.map((s) => (
          <span key={s} className="swit-badge" style={{ background: `color-mix(in srgb, ${T.accent} 10%, transparent)`, color: T.accent }}>
            {s}
          </span>
        ))}
        {shares.length > 0 && (
          <span
            className="swit-badge"
            style={{
              background: worst ? `color-mix(in srgb, ${CLASS_TONE[worst].color} 13%, transparent)` : `color-mix(in srgb, ${T.success} 13%, transparent)`,
              color: worst ? CLASS_TONE[worst].color : T.success,
            }}
          >
            SMB · {shares.length}
          </span>
        )}
      </div>
    ),
    source: host.source ?? "—",
    lastSeen: fmtRel(host.last_seen_at),
  };
  const cellStyle: Partial<Record<HostColumnKey, React.CSSProperties>> = {
    source: { fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.textMuted },
    lastSeen: { color: T.textMuted, fontSize: 11 },
  };

  return (
    <tr className={`swit-row-clickable ${selected ? "selected" : ""}`} onClick={() => hasDetail && onSelect(host.ip)}>
      {columnOrder.map((key, i) => (
        <td key={key} style={{ ...(i === 0 ? { paddingLeft: 18 } : {}), ...cellStyle[key] }}>
          {cell[key]}
        </td>
      ))}
      <td style={{ paddingRight: 18, textAlign: "right" }} onClick={(e) => e.stopPropagation()}>
        <button
          className="swit-btn gst"
          style={{ padding: "5px 8px" }}
          disabled={verifying}
          onClick={() => onVerify(host.ip)}
          title="Verificar só este host"
        >
          {verifying ? <Loader2 size={12} className="swit-spin" /> : <RefreshCw size={12} />}
        </button>
      </td>
    </tr>
  );
}

// Sheet lateral (mesmo padrão de VulnDetailsSheet.tsx) -- abre na lateral
// direita ao clicar num host, com alça de arrastar pra expandir a largura.
const HOST_SHEET_MIN_WIDTH = 420;
const HOST_SHEET_MAX_WIDTH = 1000;

function HostDetailsSheet({
  open,
  onOpenChange,
  host,
  findings,
  onSetStatus,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  host: any | null;
  findings: any[];
  onSetStatus: (findingId: string, status: "resolved" | "false_positive") => void;
}) {
  // Mantém o último host exibido enquanto o Sheet anima a saída -- `host` vira
  // null no mesmo instante em que o fechamento começa.
  const [lastHost, setLastHost] = React.useState<any | null>(host);
  React.useEffect(() => {
    if (host) setLastHost(host);
  }, [host]);

  // Largura customizada pelo usuário (arrastando a alça na borda esquerda).
  const [width, setWidth] = React.useState<number | null>(null);
  const draggingRef = React.useRef(false);

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = window.innerWidth - ev.clientX;
      const clamped = Math.min(HOST_SHEET_MAX_WIDTH, window.innerWidth - 80, Math.max(HOST_SHEET_MIN_WIDTH, next));
      setWidth(clamped);
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const host_ = host ?? lastHost;
  if (!host_) return null;

  const shares = findings.filter((f) => f.kind === "smb_share" && f.status === "open");
  const netbios = findings.find((f) => f.kind === "netbios");
  const http = findings.find((f) => f.kind === "http_title" && f.name === "HTTP");
  const https = findings.find((f) => f.kind === "http_title" && f.name === "HTTPS");
  const ftp = findings.find((f) => f.kind === "ftp_banner");

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-xl overflow-y-auto"
        style={{
          background: T.surface,
          borderLeft: `1px solid ${T.borderHi}`,
          color: T.textPrimary,
          fontFamily: "'DM Sans',sans-serif",
          ...(width ? { width, maxWidth: "none" } : {}),
        }}
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 hidden h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/40 sm:block"
        />
        <SheetHeader className="space-y-1 pr-8">
          <SheetTitle
            style={{ color: T.textPrimary, fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700 }}
          >
            {host_.ip}
          </SheetTitle>
          {host_.hostname && <div style={{ fontSize: 12.5, color: T.textMuted }}>{host_.hostname}</div>}
        </SheetHeader>
        <div className="swit-detail-wrap" style={{ paddingTop: 16 }}>
          {(netbios || http || https || ftp) && (
            <div className="swit-card-grid">
              {netbios && (
                <div className="swit-card">
                  <div className="swit-card-hd">
                    <div className="swit-card-icon">
                      <Wifi size={14} color={T.accent} />
                    </div>
                    <div className="swit-card-title">NetBIOS</div>
                  </div>
                  <div className="swit-netbios-name">{netbios.name}</div>
                  <div className="swit-netbios-group">
                    Grupo <b>{netbios.value ?? "—"}</b>
                  </div>
                </div>
              )}
              {http && (
                <HttpCard
                  label="HTTP"
                  icon={<Globe size={14} color={T.accent} />}
                  finding={http}
                  ip={host_.ip}
                  port={80}
                />
              )}
              {https && (
                <HttpCard
                  label="HTTPS"
                  icon={<Lock size={14} color={T.accent} />}
                  finding={https}
                  ip={host_.ip}
                  port={443}
                />
              )}
              {ftp && (
                <div className="swit-card">
                  <div className="swit-card-hd">
                    <div className="swit-card-icon">
                      <Server size={14} color={T.accent} />
                    </div>
                    <div className="swit-card-title">FTP · porta 21</div>
                  </div>
                  <div className="swit-http-title">{ftp.value}</div>
                  <div className="swit-http-link" style={{ color: T.textMuted }}>
                    ftp://{host_.ip}/
                  </div>
                </div>
              )}
            </div>
          )}
          {shares.length > 0 && (
            <div>
              <div className="swit-section-hd">
                <Folder size={12} /> Compartilhamentos SMB
              </div>
              <div className="swit-share-list">
                {shares.map((f) => {
                  const tone = CLASS_TONE[f.classification as string];
                  const uncPath = `\\\\${host_.ip}\\${f.name}`;
                  const perm = (f.permission ?? "").toLowerCase();
                  return (
                    <div key={f.id} className={`swit-share-card ${f.classification ?? ""}`}>
                      <div className={`swit-share-icon ${f.classification ?? ""}`}>
                        <Folder size={15} />
                      </div>
                      <div className="swit-share-main">
                        <div className="swit-share-name">{f.name}</div>
                        <CopyableText value={uncPath} />
                      </div>
                      <div className="swit-share-meta">
                        <span className={`swit-perm-pill ${perm.includes("write") ? "rw" : "ro"}`}>
                          {f.permission ?? "—"}
                        </span>
                        {tone && (
                          <span className="swit-badge" style={{ background: `color-mix(in srgb, ${tone.color} 13%, transparent)`, color: tone.color }}>
                            {tone.label}
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="swit-icon-btn"
                          onClick={() => onSetStatus(f.id, "resolved")}
                          title="Marcar como resolvido"
                        >
                          <CheckCircle2 size={13} />
                        </button>
                        <button
                          className="swit-icon-btn"
                          onClick={() => onSetStatus(f.id, "false_positive")}
                          title="Marcar como falso positivo"
                        >
                          <XCircle size={13} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
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
  // Lazy init -- lê do localStorage só uma vez, na primeira renderização.
  const [columnOrder, setColumnOrder] = React.useState<HostColumnKey[]>(() => loadHostColumnOrder());
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
  const hostsQ = useQuery({ queryKey: ["shadowit-hosts"], queryFn: () => fetchHosts(), refetchInterval: 20000 });
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

  const hosts = hostsQ.data?.hosts ?? [];
  const findings = findingsQ.data?.findings ?? [];
  const selectedHost = React.useMemo(() => hosts.find((h: any) => h.ip === selectedIp) ?? null, [hosts, selectedIp]);
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
  const ipToNum = (ip: string) => ip.split(".").reduce((acc, oct) => acc * 256 + (Number(oct) || 0), 0);

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
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [hosts, sortKey, sortDir, findingsByIp]);

  const kpis = React.useMemo(() => {
    const smb = (findings as any[]).filter((f) => f.kind === "smb_share" && f.status === "open");
    return {
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

  if (access.isLoading) {
    return (
      <div className="swit-empty">
        <Loader2 size={14} className="swit-spin" /> Carregando…
      </div>
    );
  }
  if (access.data && !access.data.allowed) {
    return <div className="swit-empty">Acesso restrito a este módulo.</div>;
  }

  return (
    <div className="swit-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="swit-hdr">
        <div className="swit-hdr-brand">
          <div className="swit-hdr-icon">
            <Wifi size={18} color={T.accent} />
          </div>
          <div>
            <div className="swit-hdr-title">Shadow IT</div>
            <div className="swit-hdr-sub">
              Visibilidade de rede interna — hosts sem cadastro em DNS, compartilhamentos e serviços expostos
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <div className="swit-tabs">
            <button className={`swit-tab ${view === "hosts" ? "on" : ""}`} onClick={() => setView("hosts")}>
              Hosts
            </button>
            <button className={`swit-tab ${view === "scans" ? "on" : ""}`} onClick={() => setView("scans")}>
              Varreduras
            </button>
          </div>
          <button className="swit-btn gst" onClick={() => setCredDlgOpen(true)}>
            <KeyRound size={13} /> Credencial SMB
          </button>
          <button className="swit-btn gst" onClick={() => setSubnetDlgOpen(true)}>
            <Plus size={13} /> Nova varredura
          </button>
          <button
            className="swit-btn pri"
            disabled={(startMutation.isPending && !startMutation.variables) || hosts.length === 0}
            onClick={() => startMutation.mutate(undefined)}
            title={hosts.length === 0 ? "Nenhum host catalogado ainda" : ""}
          >
            {startMutation.isPending && !startMutation.variables ? (
              <Loader2 size={13} className="swit-spin" />
            ) : (
              <RefreshCw size={13} />
            )}
            Verificar todos
          </button>
        </div>
      </div>

      {view === "hosts" ? (
        <>
          <div className="swit-kpis">
            <div className="swit-kpi">
              <div className="swit-kpi-label">Hosts</div>
              <div className="swit-kpi-value">{kpis.hosts}</div>
            </div>
            <div className="swit-kpi">
              <div className="swit-kpi-label">HTTP/HTTPS c/ título</div>
              <div className="swit-kpi-value">{kpis.http}</div>
            </div>
            <div className="swit-kpi">
              <div className="swit-kpi-label">FTP</div>
              <div className="swit-kpi-value">{kpis.ftp}</div>
            </div>
            <div className="swit-kpi" style={{ "--kc": T.high } as React.CSSProperties}>
              <div className="swit-kpi-label">Compart. SMB</div>
              <div className="swit-kpi-value">{kpis.smbShares}</div>
            </div>
            <div className="swit-kpi" style={{ "--kc": T.critical } as React.CSSProperties}>
              <div className="swit-kpi-label">Críticos</div>
              <div className="swit-kpi-value">{kpis.criticos}</div>
            </div>
          </div>

          <div className="swit-panel">
            <div className="swit-panel-hdr">
              <div className="swit-panel-title">
                <Server size={11} color={T.accent} /> Hosts não catalogados ({hosts.length})
              </div>
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
            {hostsQ.isLoading ? (
              <div className="swit-empty">
                <Loader2 size={14} className="swit-spin" /> Carregando…
              </div>
            ) : hosts.length === 0 ? (
              <div className="swit-empty">
                Nenhum host encontrado ainda — rode uma descoberta de rede interna no DAST Scanner (Ativos Descobertos →
                Nova descoberta). Host que não resolve hostname em DNS interno cai aqui automaticamente.
              </div>
            ) : (
              <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
                <table className="swit-table">
                  <thead>
                    <tr>
                      {columnOrder.map((key, i) => (
                        <th
                          key={key}
                          style={{ cursor: "pointer", ...(i === 0 ? { paddingLeft: 18 } : {}) }}
                          onClick={() => toggleSort(key)}
                          title="Clique para ordenar"
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            {HOST_COLUMN_LABEL[key]}
                            {sortKey === key &&
                              (sortDir === "asc" ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
                          </span>
                        </th>
                      ))}
                      <th style={{ paddingRight: 18, textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedHosts.map((h: any) => (
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
          <div className="swit-panel-hdr">
            <div className="swit-panel-title">
              <RefreshCw size={11} color={T.accent} /> Varreduras ({scans.length})
            </div>
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
                    <th style={{ paddingLeft: 18 }}>Nome</th>
                    <th>Alvos</th>
                    <th>Status</th>
                    <th>Criado</th>
                    <th>Duração</th>
                    <th style={{ paddingRight: 18, textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.map((s: any) => {
                    const tone = STATUS_TONE[s.status] ?? T.textMuted;
                    return (
                      <tr key={s.id}>
                        <td style={{ paddingLeft: 18, fontWeight: 600 }}>{s.name ?? "—"}</td>
                        <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.textMuted }}>
                          {(s.targets ?? []).length} host(s)
                        </td>
                        <td>
                          <span
                            className="swit-badge"
                            style={{ background: `color-mix(in srgb, ${tone} 13%, transparent)`, color: tone, border: `1px solid color-mix(in srgb, ${tone} 33%, transparent)` }}
                          >
                            {s.status}
                          </span>
                          {s.error && (
                            <span
                              title={s.error}
                              style={{ marginLeft: 6, fontSize: 10, color: T.critical, cursor: "help" }}
                            >
                              ⚠
                            </span>
                          )}
                        </td>
                        <td style={{ color: T.textMuted, fontSize: 11 }}>{fmtRel(s.created_at)}</td>
                        <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: T.textMuted }}>
                          {fmtDuration(s.started_at, s.finished_at)}
                        </td>
                        <td style={{ paddingRight: 18 }}>
                          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                            {(s.status === "queued" || s.status === "running") && (
                              <button
                                className="swit-btn gst"
                                style={{ padding: "5px 8px" }}
                                onClick={() => cancelMutation.mutate(s.id)}
                                title="Cancelar"
                              >
                                <Ban size={12} />
                              </button>
                            )}
                            {s.status !== "queued" && s.status !== "running" && (
                              <button
                                className="swit-btn dng"
                                onClick={() => deleteMutation.mutate(s.id)}
                                title="Excluir"
                              >
                                <Trash2 size={12} />
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
      />
    </div>
  );
}
