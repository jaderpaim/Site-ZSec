import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Film,
  Link2,
  Loader2,
  Lock,
  Mail,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Trash2,
  Upload,
  UserPlus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import {
  atribuirTreinamento,
  createVideoUploadUrl,
  deleteAtribuicao,
  deleteTreinamento,
  getTreinamentosData,
  reenviarConvite,
  upsertTreinamento,
  type AtribuicaoRow,
  type ColaboradorMin,
  type TreinamentoRow,
  type TreinamentoStatus,
  type TreinamentoTipo,
} from "@/lib/treinamentos.functions";

const META = 80;
const TIPOS: TreinamentoTipo[] = ["Política", "Phishing", "Conscientização"];
const TIPO_CLS: Record<TreinamentoTipo, string> = {
  Política: "accent",
  Phishing: "crit",
  Conscientização: "ok",
};
const TIPO_COLOR: Record<TreinamentoTipo, string> = {
  Política: "var(--v2-accent)",
  Phishing: "var(--v2-crit)",
  Conscientização: "var(--v2-ok)",
};
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Erro inesperado");
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : null);
const toneOf = (v: number | null) =>
  v === null
    ? "var(--v2-fg-3)"
    : v >= 80
      ? "var(--v2-ok)"
      : v >= 50
        ? "var(--v2-med)"
        : "var(--v2-crit)";
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(n: number) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmtDate = (d: string | null) => (d ? d.slice(0, 10).split("-").reverse().join("/") : "—");
const minutos = (s: number | null) =>
  s ? `${Math.max(1, Math.round(s / 60))} min` : "duração não informada";
const isLate = (a: AtribuicaoRow) => a.status !== "Concluído" && !!a.prazo && a.prazo < todayIso();
const ORIGEM: Record<AtribuicaoRow["origem"], string> = {
  manual: "Manual",
  phishing: "Phishing",
  politica: "Política",
};

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .tr-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .tr-root * { box-sizing:border-box; }
  .tr-root ::-webkit-scrollbar { width:6px; height:6px; }
  .tr-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .tr-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .tr-root .mono, .tr-form .mono { font-family:var(--font-data); font-size:12.5px; }
  .tr-root .dim, .tr-form .dim { color:var(--v2-fg-3); }
  @keyframes tr-spin { to{transform:rotate(360deg)} }
  .tr-spin { animation:tr-spin .8s linear infinite; }

  .tr-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .tr-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .tr-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .tr-ph-actions { display:flex; gap:8px; flex-wrap:wrap; }
  .tr-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }
  .tr-warn { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-med) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 35%, transparent); }
  .tr-warn svg { color:var(--v2-med); flex-shrink:0; margin-top:2px; }
  .tr-warn b { color:var(--v2-fg); font-weight:600; }

  .tr-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .tr-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:500; color:var(--v2-fg-3); cursor:pointer; font-family:inherit; }
  .tr-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .tr-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .tr-subnav .n { font:500 12px var(--font-data); color:var(--v2-fg-3); }

  .tr-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .tr-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.tr-kpi { cursor:pointer; }
  button.tr-kpi:hover { background:var(--v2-hover); }
  .tr-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .tr-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .tr-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .tr-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .tr-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .tr-meter i { display:block; height:100%; border-radius:99px; }

  .tr-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .tr-span-2 { grid-column:span 2; }
  .tr-fit { height:0; min-height:100%; display:flex; flex-direction:column; }
  .tr-fit .tr-card-body { flex:1; min-height:0; overflow-y:auto; }
  @media (max-width: 1100px) { .tr-grid { grid-template-columns:minmax(0, 1fr); } .tr-span-2 { grid-column:auto; } .tr-fit { height:auto; min-height:0; max-height:420px; } }
  .tr-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .tr-card-hdr { padding:14px 18px 4px; }
  .tr-card-title { font-size:14px; font-weight:600; margin:0; }
  .tr-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .tr-card-body { padding:12px 18px 16px; }
  .tr-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  .tr-bars { display:grid; gap:8px; }
  .tr-bars > div { display:grid; grid-template-columns:minmax(0, 220px) minmax(0, 1fr) 110px; gap:12px; align-items:center; font-size:13px; }
  .tr-bars .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tr-bars .bar { position:relative; height:10px; border-radius:99px; background:var(--v2-surface-2); }
  .tr-bars .bar i { display:block; height:100%; border-radius:99px; }
  .tr-bars .bar .goal { position:absolute; top:-3px; bottom:-3px; border-left:1.5px dashed var(--v2-fg-3); }
  .tr-bars .v { font:500 12.5px var(--font-data); text-align:right; white-space:nowrap; }
  .tr-bars .v small { color:var(--v2-fg-3); font-weight:400; }
  @media (max-width: 640px) { .tr-bars > div { grid-template-columns:minmax(0, 1fr) 100px; } .tr-bars .bar { grid-column:1 / -1; grid-row:2; } }

  .tr-feed { display:grid; }
  .tr-feed > div { display:grid; grid-template-columns:28px minmax(0, 1fr) auto; gap:10px; align-items:center; padding:9px 0; border-bottom:1px solid var(--v2-line); font-size:13px; }
  .tr-feed > div:last-child { border-bottom:0; }
  .tr-feed .ic { width:28px; height:28px; border-radius:8px; display:grid; place-items:center; --c:var(--v2-accent); background:color-mix(in oklch, var(--c) 14%, transparent); color:var(--c); }
  .tr-feed .ic.ok { --c:var(--v2-ok); } .tr-feed .ic.crit { --c:var(--v2-crit); }
  .tr-feed b { font-weight:500; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tr-feed small { display:block; font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tr-feed .t { font:400 12px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; }

  .tr-cat { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px; padding:18px; }
  .tr-course { display:grid; gap:10px; padding:16px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface); align-content:start; }
  .tr-cover { height:92px; border-radius:10px; display:grid; place-items:center; color:#fff; --c:var(--v2-accent); background:linear-gradient(135deg, color-mix(in oklch, var(--c) 70%, #000) 0%, var(--c) 100%); }
  .tr-cover span { width:44px; height:44px; border-radius:50%; display:grid; place-items:center; background:rgba(255,255,255,.2); }
  .tr-course h3 { margin:0; font-size:14.5px; font-weight:600; overflow-wrap:anywhere; }
  .tr-course .m { font-size:12px; color:var(--v2-fg-3); }
  .tr-course .adh { display:grid; grid-template-columns:1fr auto; gap:8px; align-items:center; font:500 12px var(--font-data); }
  .tr-course .adh .track { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .tr-course .adh .track i { display:block; height:100%; border-radius:99px; }
  .tr-course .act { display:flex; gap:6px; flex-wrap:wrap; }

  .tr-tag { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .tr-tag svg { color:var(--c); }
  .tr-tag.accent { --c:var(--v2-accent); } .tr-tag.crit { --c:var(--v2-crit); } .tr-tag.ok { --c:var(--v2-ok); } .tr-tag.med { --c:var(--v2-med); }

  .tr-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .tr-toolbar > b { font-size:14px; font-weight:600; }
  .tr-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .tr-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .tr-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .tr-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .tr-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:inherit; font-size:13px; padding:0 10px; max-width:260px; }
  .tr-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:260px; max-width:100%; }
  .tr-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .tr-scroll { overflow:auto; max-height:620px; }
  .tr-table { width:100%; border-collapse:collapse; font-size:13px; }
  .tr-table thead { position:sticky; top:0; z-index:1; }
  .tr-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .tr-table th.r, .tr-table td.r { text-align:right; }
  .tr-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .tr-table th:first-child, .tr-table td:first-child { padding-left:18px; }
  .tr-table th:last-child, .tr-table td:last-child { padding-right:18px; }
  .tr-table tbody tr:hover td { background:var(--v2-hover); }
  .tr-table tbody tr:last-child td { border-bottom:none; }
  .tr-person b { display:block; font-weight:500; }
  .tr-person small { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .tr-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .tr-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .tr-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .tr-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  .tr-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); text-decoration:none; }
  .tr-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .tr-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .tr-btn.lg { height:34px; padding:0 14px; }
  .tr-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .tr-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .tr-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .tr-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }

  /* formulários */
  .tr-form { display:grid; gap:14px; padding-top:4px; font-family:var(--font-ui); color:var(--v2-fg); }
  .tr-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 560px) { .tr-row2 { grid-template-columns:1fr; } }
  .tr-field { display:grid; gap:6px; min-width:0; }
  .tr-field > label, .tr-field > .lbl { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .tr-field small { font-size:12px; color:var(--v2-fg-3); }
  .tr-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  textarea.tr-input { height:auto; min-height:70px; padding:8px 10px; resize:vertical; line-height:1.5; }
  .tr-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .tr-drop { display:grid; place-items:center; gap:6px; text-align:center; padding:20px 16px; border:1.5px dashed var(--v2-line-strong); border-radius:12px; background:var(--v2-surface-2); color:var(--v2-fg-2); font-size:13px; cursor:pointer; }
  .tr-drop:hover { border-color:var(--v2-accent); }
  .tr-drop b { color:var(--v2-fg); }
  .tr-drop small { color:var(--v2-fg-3); font-size:12px; }
  .tr-file { display:grid; grid-template-columns:36px minmax(0, 1fr) auto; gap:12px; align-items:center; padding:10px 12px; border:1px solid var(--v2-line); border-radius:10px; }
  .tr-file .th { width:36px; height:36px; border-radius:8px; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }
  .tr-file b { display:block; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tr-file small { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .tr-opt { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:4px 12px; align-items:center; padding:10px 0; border-top:1px solid var(--v2-line); }
  .tr-opt b { font-size:13.5px; font-weight:500; }
  .tr-opt small { grid-column:1; font-size:12.5px; color:var(--v2-fg-3); }
  .tr-opt > :last-child { grid-row:1 / span 2; grid-column:2; }
  .tr-switch { width:38px; height:22px; border-radius:99px; background:var(--v2-line-strong); position:relative; border:0; cursor:pointer; flex-shrink:0; }
  .tr-switch::after { content:""; position:absolute; top:3px; left:3px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .15s; }
  .tr-switch[aria-checked="true"] { background:var(--v2-ok); }
  .tr-switch[aria-checked="true"]::after { transform:translateX(16px); }
  .tr-pick { display:grid; gap:2px; max-height:220px; overflow-y:auto; border:1px solid var(--v2-line); border-radius:8px; padding:6px; }
  .tr-pick label { display:flex; align-items:center; gap:9px; padding:6px 8px; border-radius:6px; font-size:13px; cursor:pointer; }
  .tr-pick label:hover { background:var(--v2-hover); }
  .tr-pick small { margin-left:auto; color:var(--v2-fg-3); font:400 12px var(--font-data); }
  .tr-summary { padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:13px; color:var(--v2-fg-2); }
  .tr-summary b { color:var(--v2-fg); }
`;

const dialogStyle: React.CSSProperties = {
  background: "var(--v2-surface)",
  border: "1px solid var(--v2-line-strong)",
  borderRadius: 12,
  color: "var(--v2-fg)",
};

function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      className="tr-switch"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
    />
  );
}

// ── Cadastro de treinamento ────────────────────────────────────────────────────
type FormState = {
  id: string | null;
  titulo: string;
  descricao: string;
  tipo: TreinamentoTipo;
  status: TreinamentoStatus;
  fonte: "upload" | "link";
  video_path: string | null;
  video_url: string;
  duracao_seg: number | null;
  exigir_pct_assistido: number;
  bloquear_avanco: boolean;
  exigir_ciencia: boolean;
  prazo_padrao_dias: number;
  policy_id: string;
};
const emptyForm: FormState = {
  id: null,
  titulo: "",
  descricao: "",
  tipo: "Conscientização",
  status: "Rascunho",
  fonte: "upload",
  video_path: null,
  video_url: "",
  duracao_seg: null,
  exigir_pct_assistido: 90,
  bloquear_avanco: true,
  exigir_ciencia: true,
  prazo_padrao_dias: 30,
  policy_id: "",
};

function TreinamentoDialog({
  open,
  onOpenChange,
  initial,
  politicas,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: FormState;
  politicas: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const upsert = useServerFn(upsertTreinamento);
  const signUpload = useServerFn(createVideoUploadUrl);
  const [f, setF] = React.useState<FormState>(initial);
  const [uploading, setUploading] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setF(initial);
      setFileName(initial.video_path ? (initial.video_path.split("/").pop() ?? null) : null);
    }
  }, [open, initial]);

  const isStream = /(sharepoint\.com|stream\.microsoft|microsoftstream)/i.test(f.video_url);

  async function onFile(file: File) {
    if (!["video/mp4", "video/webm"].includes(file.type)) {
      toast.error("Envie um vídeo MP4 ou WebM");
      return;
    }
    setUploading(true);
    try {
      // Duração lida do próprio arquivo, antes do envio
      const dur = await new Promise<number | null>((resolve) => {
        const v = document.createElement("video");
        v.preload = "metadata";
        v.onloadedmetadata = () => {
          URL.revokeObjectURL(v.src);
          resolve(Number.isFinite(v.duration) ? Math.round(v.duration) : null);
        };
        v.onerror = () => resolve(null);
        v.src = URL.createObjectURL(file);
      });
      const { path, token } = await signUpload({
        data: { filename: file.name, contentType: file.type as "video/mp4" | "video/webm" },
      });
      const { error } = await supabase.storage
        .from("treinamentos")
        .uploadToSignedUrl(path, token, file, {
          contentType: file.type,
        });
      if (error) throw error;
      setF((s) => ({ ...s, video_path: path, video_url: "", duracao_seg: dur ?? s.duracao_seg }));
      setFileName(file.name);
      toast.success("Vídeo enviado");
    } catch (e) {
      toast.error(`Falha no envio: ${errMsg(e)}`);
    } finally {
      setUploading(false);
    }
  }

  const save = useMutation({
    mutationFn: () =>
      upsert({
        data: {
          id: f.id,
          titulo: f.titulo.trim(),
          descricao: f.descricao.trim() || null,
          tipo: f.tipo,
          status: f.status,
          video_path: f.fonte === "upload" ? f.video_path : null,
          video_url: f.fonte === "link" ? f.video_url.trim() || null : null,
          duracao_seg: f.duracao_seg,
          exigir_pct_assistido: f.exigir_pct_assistido,
          bloquear_avanco: f.bloquear_avanco,
          exigir_ciencia: f.exigir_ciencia,
          prazo_padrao_dias: f.prazo_padrao_dias,
          policy_id: f.tipo === "Política" && f.policy_id ? f.policy_id : null,
        },
      }),
    onSuccess: () => {
      toast.success(f.id ? "Treinamento atualizado" : "Treinamento criado");
      qc.invalidateQueries({ queryKey: ["treinamentos"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const temVideo = f.fonte === "upload" ? !!f.video_path : !!f.video_url.trim();
  const podeSalvar =
    f.titulo.trim().length > 0 && !uploading && (f.status !== "Publicado" || temVideo);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-ui sm:max-w-2xl max-h-[90dvh] overflow-y-auto"
        style={dialogStyle}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
            {f.id ? "Editar treinamento" : "Novo treinamento"}
          </DialogTitle>
        </DialogHeader>
        <div className="tr-form">
          <div className="tr-field">
            <label htmlFor="tr-t">Título</label>
            <input
              id="tr-t"
              className="tr-input"
              value={f.titulo}
              onChange={(e) => setF({ ...f, titulo: e.target.value })}
              maxLength={200}
              placeholder="Ex.: Reconhecendo phishing"
            />
          </div>
          <div className="tr-row2">
            <div className="tr-field">
              <label htmlFor="tr-tipo">Tipo</label>
              <select
                id="tr-tipo"
                className="tr-input"
                value={f.tipo}
                onChange={(e) => setF({ ...f, tipo: e.target.value as TreinamentoTipo })}
              >
                {TIPOS.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="tr-field">
              <label htmlFor="tr-prazo">Prazo padrão para concluir</label>
              <select
                id="tr-prazo"
                className="tr-input"
                value={f.prazo_padrao_dias}
                onChange={(e) => setF({ ...f, prazo_padrao_dias: Number(e.target.value) })}
              >
                {[7, 15, 30, 45, 60, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </div>
          </div>
          {f.tipo === "Política" && (
            <div className="tr-field">
              <label htmlFor="tr-pol">Política vinculada</label>
              <select
                id="tr-pol"
                className="tr-input"
                value={f.policy_id}
                onChange={(e) => setF({ ...f, policy_id: e.target.value })}
              >
                <option value="">Nenhuma</option>
                {politicas.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <small>
                As conclusões deste treinamento passam a ser a adesão da política em Políticas.
              </small>
            </div>
          )}
          <div className="tr-field">
            <label htmlFor="tr-d">Descrição</label>
            <textarea
              id="tr-d"
              className="tr-input"
              value={f.descricao}
              onChange={(e) => setF({ ...f, descricao: e.target.value })}
              maxLength={2000}
              placeholder="O que a pessoa vai aprender (aparece abaixo do vídeo)"
            />
          </div>

          <div className="tr-field">
            <span className="lbl">Vídeo</span>
            <div
              className="tr-seg"
              role="group"
              aria-label="Origem do vídeo"
              style={{ justifySelf: "start" }}
            >
              <button
                type="button"
                aria-pressed={f.fonte === "upload"}
                onClick={() => setF({ ...f, fonte: "upload" })}
              >
                Enviar arquivo
              </button>
              <button
                type="button"
                aria-pressed={f.fonte === "link"}
                onClick={() => setF({ ...f, fonte: "link" })}
              >
                Link externo
              </button>
            </div>
            {f.fonte === "upload" ? (
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="video/mp4,video/webm"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onFile(file);
                    e.target.value = "";
                  }}
                />
                {f.video_path ? (
                  <div className="tr-file">
                    <span className="th">
                      <Film size={16} />
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{fileName ?? "vídeo enviado"}</b>
                      <small>{minutos(f.duracao_seg)} · privado no Z-Sec</small>
                    </span>
                    <button
                      type="button"
                      className="tr-btn"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      Trocar
                    </button>
                  </div>
                ) : (
                  <div
                    className="tr-drop"
                    role="button"
                    tabIndex={0}
                    onClick={() => !uploading && fileRef.current?.click()}
                    onKeyDown={(e) => e.key === "Enter" && !uploading && fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const file = e.dataTransfer.files?.[0];
                      if (file && !uploading) onFile(file);
                    }}
                  >
                    {uploading ? <Loader2 size={24} className="tr-spin" /> : <Upload size={24} />}
                    <b>
                      {uploading ? "Enviando o vídeo…" : "Arraste o vídeo ou clique para escolher"}
                    </b>
                    <small>MP4 (H.264) ou WebM · recomendado 720p · fica privado no Z-Sec</small>
                  </div>
                )}
              </>
            ) : (
              <>
                <input
                  className="tr-input"
                  value={f.video_url}
                  onChange={(e) => setF({ ...f, video_url: e.target.value })}
                  placeholder="https://… (YouTube não listado, Vimeo ou Microsoft Stream)"
                />
                <small>
                  {isStream
                    ? "Vídeos do Stream não informam quanto foi assistido: a conclusão dependerá só da confirmação de ciência."
                    : "Com link externo, a conclusão é pela confirmação de ciência (a medição de % é para vídeos enviados ao Z-Sec)."}
                </small>
                <div className="tr-field" style={{ maxWidth: 220 }}>
                  <label htmlFor="tr-dur">Duração (minutos)</label>
                  <input
                    id="tr-dur"
                    type="number"
                    min={1}
                    className="tr-input"
                    value={f.duracao_seg ? Math.round(f.duracao_seg / 60) : ""}
                    onChange={(e) =>
                      setF({
                        ...f,
                        duracao_seg: e.target.value
                          ? Math.max(1, Number(e.target.value)) * 60
                          : null,
                      })
                    }
                  />
                </div>
              </>
            )}
          </div>

          <div>
            <div className="tr-opt">
              <b>Exigir {f.exigir_pct_assistido}% assistido para concluir</b>
              <small>A conclusão só é liberada depois de assistir quase todo o vídeo</small>
              <Switch
                on={f.exigir_pct_assistido > 0}
                onChange={(v) => setF({ ...f, exigir_pct_assistido: v ? 90 : 0 })}
                label="Exigir porcentagem assistida"
              />
            </div>
            <div className="tr-opt">
              <b>Impedir avanço rápido</b>
              <small>A barra só deixa voltar, não pular à frente do que já foi assistido</small>
              <Switch
                on={f.bloquear_avanco}
                onChange={(v) => setF({ ...f, bloquear_avanco: v })}
                label="Impedir avanço"
              />
            </div>
            <div className="tr-opt">
              <b>Confirmação de ciência</b>
              <small>
                "Assisti e entendi" antes de concluir (sempre exigida em links externos)
              </small>
              <Switch
                on={f.exigir_ciencia}
                onChange={(v) => setF({ ...f, exigir_ciencia: v })}
                label="Ciência"
              />
            </div>
            <div className="tr-opt">
              <b>Publicado</b>
              <small>
                Só treinamentos publicados podem ser atribuídos e aparecem para os colaboradores
              </small>
              <Switch
                on={f.status === "Publicado"}
                onChange={(v) => setF({ ...f, status: v ? "Publicado" : "Rascunho" })}
                label="Publicado"
              />
            </div>
          </div>
          {f.status === "Publicado" && !temVideo && (
            <p style={{ margin: 0, fontSize: 12.5, color: "var(--v2-crit)" }}>
              Para publicar, envie o vídeo ou informe o link.
            </p>
          )}
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button
            className="tr-btn ghost"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancelar
          </button>
          <button
            className="tr-btn primary"
            onClick={() => save.mutate()}
            disabled={!podeSalvar || save.isPending}
          >
            {save.isPending && <Loader2 size={13} className="tr-spin" />} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Atribuir ───────────────────────────────────────────────────────────────────
function AtribuirDialog({
  open,
  onOpenChange,
  treinamentos,
  colaboradores,
  departamentos,
  atribuicoes,
  inicial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  treinamentos: TreinamentoRow[];
  colaboradores: ColaboradorMin[];
  departamentos: Array<{ id: string; name: string }>;
  atribuicoes: AtribuicaoRow[];
  inicial: string | null;
}) {
  const qc = useQueryClient();
  const atribuir = useServerFn(atribuirTreinamento);
  const publicados = treinamentos.filter((t) => t.status === "Publicado");
  const [tid, setTid] = React.useState<string>("");
  const [modo, setModo] = React.useState<"todos" | "dep" | "pessoas">("todos");
  const [deps, setDeps] = React.useState<Set<string>>(new Set());
  const [pessoas, setPessoas] = React.useState<Set<string>>(new Set());
  const [busca, setBusca] = React.useState("");
  const [prazo, setPrazo] = React.useState<string>(addDays(30));
  const [convite, setConvite] = React.useState(true);

  React.useEffect(() => {
    if (!open) return;
    const first = inicial ?? publicados[0]?.id ?? "";
    setTid(first);
    setModo("todos");
    setDeps(new Set());
    setPessoas(new Set());
    setBusca("");
    setConvite(true);
    const t = treinamentos.find((x) => x.id === first);
    setPrazo(addDays(t?.prazo_padrao_dias ?? 30));
    // só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const alvo = React.useMemo(() => {
    if (modo === "todos") return colaboradores;
    if (modo === "dep")
      return colaboradores.filter((c) => c.department_id && deps.has(c.department_id));
    return colaboradores.filter((c) => pessoas.has(c.id));
  }, [modo, colaboradores, deps, pessoas]);
  const jaTem = React.useMemo(
    () => new Set(atribuicoes.filter((a) => a.treinamento_id === tid).map((a) => a.colaborador_id)),
    [atribuicoes, tid],
  );
  const novos = alvo.filter((c) => !jaTem.has(c.id));
  const depCount = React.useMemo(() => {
    const m = new Map<string, number>();
    colaboradores.forEach(
      (c) => c.department_id && m.set(c.department_id, (m.get(c.department_id) ?? 0) + 1),
    );
    return m;
  }, [colaboradores]);
  const buscaN = busca.trim().toLowerCase();
  const listaPessoas = colaboradores
    .filter((c) => !buscaN || `${c.display_name} ${c.email}`.toLowerCase().includes(buscaN))
    .slice(0, 200);

  const save = useMutation({
    mutationFn: () =>
      atribuir({
        data: {
          treinamento_id: tid,
          colaborador_ids: novos.map((c) => c.id),
          prazo: prazo || null,
          enviar_convite: convite,
        },
      }),
    onSuccess: (r) => {
      toast.success(
        `${r.criadas} ${r.criadas === 1 ? "atribuição criada" : "atribuições criadas"}${
          convite
            ? ` · ${r.enviados} convites enviados${r.falhas ? `, ${r.falhas} falharam` : ""}`
            : ""
        }`,
      );
      qc.invalidateQueries({ queryKey: ["treinamentos"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const toggle = (set: Set<string>, id: string, upd: (s: Set<string>) => void) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    upd(n);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-ui sm:max-w-xl max-h-[90dvh] overflow-y-auto"
        style={dialogStyle}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>Atribuir treinamento</DialogTitle>
        </DialogHeader>
        {publicados.length === 0 ? (
          <p style={{ fontSize: 13, color: "var(--v2-fg-3)" }}>
            Publique um treinamento antes de atribuir.
          </p>
        ) : (
          <div className="tr-form">
            <div className="tr-field">
              <label htmlFor="at-t">Treinamento</label>
              <select
                id="at-t"
                className="tr-input"
                value={tid}
                onChange={(e) => {
                  setTid(e.target.value);
                  const t = treinamentos.find((x) => x.id === e.target.value);
                  if (t) setPrazo(addDays(t.prazo_padrao_dias));
                }}
              >
                {publicados.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.titulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="tr-field">
              <span className="lbl">Para quem</span>
              <div className="tr-seg" role="group" style={{ justifySelf: "start" }}>
                <button
                  type="button"
                  aria-pressed={modo === "todos"}
                  onClick={() => setModo("todos")}
                >
                  Todos os colaboradores
                </button>
                <button type="button" aria-pressed={modo === "dep"} onClick={() => setModo("dep")}>
                  Por departamento
                </button>
                <button
                  type="button"
                  aria-pressed={modo === "pessoas"}
                  onClick={() => setModo("pessoas")}
                >
                  Pessoas
                </button>
              </div>
              {modo === "dep" && (
                <div className="tr-pick">
                  {departamentos.map((d) => (
                    <label key={d.id}>
                      <input
                        type="checkbox"
                        checked={deps.has(d.id)}
                        onChange={() => toggle(deps, d.id, setDeps)}
                      />
                      {d.name}
                      <small>{depCount.get(d.id) ?? 0}</small>
                    </label>
                  ))}
                </div>
              )}
              {modo === "pessoas" && (
                <>
                  <input
                    className="tr-input"
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar nome ou e-mail"
                  />
                  <div className="tr-pick">
                    {listaPessoas.map((c) => (
                      <label key={c.id}>
                        <input
                          type="checkbox"
                          checked={pessoas.has(c.id)}
                          onChange={() => toggle(pessoas, c.id, setPessoas)}
                        />
                        {c.display_name}
                        <small>{c.email}</small>
                      </label>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="tr-row2">
              <div className="tr-field">
                <label htmlFor="at-p">Prazo</label>
                <input
                  id="at-p"
                  type="date"
                  className="tr-input"
                  value={prazo}
                  min={todayIso()}
                  onChange={(e) => setPrazo(e.target.value)}
                />
              </div>
              <div className="tr-field" style={{ alignContent: "end" }}>
                <label
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 13,
                    color: "var(--v2-fg)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={convite}
                    onChange={(e) => setConvite(e.target.checked)}
                  />
                  Enviar e-mail de convite
                </label>
              </div>
            </div>
            <div className="tr-summary">
              <b>{novos.length}</b> {novos.length === 1 ? "pessoa receberá" : "pessoas receberão"}{" "}
              este treinamento
              {alvo.length - novos.length > 0 && (
                <> · {alvo.length - novos.length} já tinham e foram ignoradas</>
              )}
              .
            </div>
          </div>
        )}
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button
            className="tr-btn ghost"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancelar
          </button>
          <button
            className="tr-btn primary"
            onClick={() => save.mutate()}
            disabled={!tid || novos.length === 0 || save.isPending}
          >
            {save.isPending && <Loader2 size={13} className="tr-spin" />} Atribuir
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
type Tab = "geral" | "catalogo" | "atribuicoes";
type StatusFiltro = "todas" | "pendentes" | "atrasadas" | "concluidas";

export function TreinamentosDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canView = isAdmin || isModuleAdmin("treinamentos") || can("treinamentos", "view");
  const canCreate = isAdmin || isModuleAdmin("treinamentos") || can("treinamentos", "create");
  const canEdit = isAdmin || isModuleAdmin("treinamentos") || can("treinamentos", "edit");
  const canDelete = isAdmin || isModuleAdmin("treinamentos") || can("treinamentos", "delete");

  const fetchData = useServerFn(getTreinamentosData);
  const q = useQuery({ queryKey: ["treinamentos"], queryFn: () => fetchData(), enabled: canView });
  const delTr = useServerFn(deleteTreinamento);
  const delAt = useServerFn(deleteAtribuicao);
  const reenviar = useServerFn(reenviarConvite);

  const [tab, setTab] = React.useState<Tab>("geral");
  const [formOpen, setFormOpen] = React.useState(false);
  const [formInit, setFormInit] = React.useState<FormState>(emptyForm);
  const [atribOpen, setAtribOpen] = React.useState(false);
  const [atribInit, setAtribInit] = React.useState<string | null>(null);
  const [fTr, setFTr] = React.useState<string>("");
  const [fSt, setFSt] = React.useState<StatusFiltro>("todas");
  const [busca, setBusca] = React.useState("");
  const [confirmDel, setConfirmDel] = React.useState<{
    kind: "tr" | "at";
    id: string;
    label: string;
  } | null>(null);

  const d = q.data;
  const treinamentos = React.useMemo(() => d?.treinamentos ?? [], [d]);
  const atribuicoes = React.useMemo(() => d?.atribuicoes ?? [], [d]);
  const colaboradores = React.useMemo(() => d?.colaboradores ?? [], [d]);
  const colabById = React.useMemo(
    () => new Map(colaboradores.map((c) => [c.id, c])),
    [colaboradores],
  );
  const trById = React.useMemo(() => new Map(treinamentos.map((t) => [t.id, t])), [treinamentos]);

  const stats = React.useMemo(() => {
    const total = atribuicoes.length;
    const done = atribuicoes.filter((a) => a.status === "Concluído").length;
    const late = atribuicoes.filter(isLate).length;
    const pend = total - done - late;
    const since = Date.now() - 30 * 86_400_000;
    const last30 = atribuicoes.filter(
      (a) => a.concluido_em && new Date(a.concluido_em).getTime() >= since,
    ).length;
    const porTr = new Map<string, { done: number; total: number }>();
    atribuicoes.forEach((a) => {
      const c = porTr.get(a.treinamento_id) ?? { done: 0, total: 0 };
      c.total++;
      if (a.status === "Concluído") c.done++;
      porTr.set(a.treinamento_id, c);
    });
    return { total, done, late, pend, last30, porTr };
  }, [atribuicoes]);

  // Colaboradores cujo e-mail não está nos domínios do tenant (não conseguem entrar com Microsoft)
  const foraTenant = React.useMemo(() => {
    const doms = d?.allowedDomains ?? [];
    if (doms.length === 0) return [];
    return colaboradores.filter((c) => !doms.includes((c.email.split("@")[1] ?? "").toLowerCase()));
  }, [colaboradores, d]);

  const filtradas = React.useMemo(() => {
    const s = busca.trim().toLowerCase();
    return atribuicoes.filter((a) => {
      if (fTr && a.treinamento_id !== fTr) return false;
      if (fSt === "concluidas" && a.status !== "Concluído") return false;
      if (fSt === "atrasadas" && !isLate(a)) return false;
      if (fSt === "pendentes" && (a.status === "Concluído" || isLate(a))) return false;
      if (!s) return true;
      const c = colabById.get(a.colaborador_id);
      const t = trById.get(a.treinamento_id);
      return `${c?.display_name ?? ""} ${c?.email ?? ""} ${t?.titulo ?? ""}`
        .toLowerCase()
        .includes(s);
    });
  }, [atribuicoes, fTr, fSt, busca, colabById, trById]);

  const delMut = useMutation({
    mutationFn: (x: { kind: "tr" | "at"; id: string }) =>
      x.kind === "tr" ? delTr({ data: { id: x.id } }) : delAt({ data: { id: x.id } }),
    onSuccess: (_, x) => {
      toast.success(x.kind === "tr" ? "Treinamento excluído" : "Atribuição removida");
      qc.invalidateQueries({ queryKey: ["treinamentos"] });
      setConfirmDel(null);
    },
    onError: (e) => toast.error(errMsg(e)),
  });
  const reMut = useMutation({
    mutationFn: (ids: string[]) => reenviar({ data: { ids } }),
    onSuccess: (r) => {
      toast.success(
        `${r.enviados} ${r.enviados === 1 ? "convite reenviado" : "convites reenviados"}${r.falhas ? ` · ${r.falhas} falharam` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["treinamentos"] });
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  if (!canView)
    return (
      <div className="tr-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="tr-state">
          <Lock size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Acesso restrito</span>
          <span className="dim" style={{ fontSize: 13 }}>
            Você não tem permissão para acessar este módulo.
          </span>
        </div>
      </div>
    );

  const editar = (t: TreinamentoRow) => {
    setFormInit({
      id: t.id,
      titulo: t.titulo,
      descricao: t.descricao ?? "",
      tipo: t.tipo,
      status: t.status,
      fonte: t.video_url ? "link" : "upload",
      video_path: t.video_path,
      video_url: t.video_url ?? "",
      duracao_seg: t.duracao_seg,
      exigir_pct_assistido: t.exigir_pct_assistido,
      bloquear_avanco: t.bloquear_avanco,
      exigir_ciencia: t.exigir_ciencia,
      prazo_padrao_dias: t.prazo_padrao_dias,
      policy_id: t.policy_id ?? "",
    });
    setFormOpen(true);
  };
  const novo = () => {
    setFormInit(emptyForm);
    setFormOpen(true);
  };
  const atribuirPara = (id: string | null) => {
    setAtribInit(id);
    setAtribOpen(true);
  };

  const adesao = pct(stats.done, stats.total);
  const pendentesFiltro = filtradas.filter((a) => a.status !== "Concluído").map((a) => a.id);
  const learnerUrl =
    typeof window !== "undefined" ? `${window.location.origin}/treinamentos` : "/treinamentos";

  const EVENTO: Record<string, [string, string, React.ReactNode]> = {
    login: ["entrou em Meus treinamentos", "", <PlayCircle size={14} key="i" />],
    abriu: ["abriu um treinamento", "", <Film size={14} key="i" />],
    concluiu: ["concluiu um treinamento", "ok", <CheckCircle2 size={14} key="i" />],
    login_negado: ["teve o acesso negado", "crit", <AlertTriangle size={14} key="i" />],
  };

  return (
    <div className="tr-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="tr-ph">
        <div>
          <h1 className="tr-ph-title">Treinamentos</h1>
          <p className="tr-ph-sub">
            Capacitação em segurança: ciência de políticas, conscientização e phishing
          </p>
        </div>
        <div className="tr-ph-actions">
          <a className="tr-btn lg" href="/treinamentos" target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} /> Página do colaborador
          </a>
          {canCreate && (
            <>
              <button className="tr-btn lg" onClick={() => atribuirPara(null)}>
                <UserPlus size={14} /> Atribuir treinamento
              </button>
              <button className="tr-btn primary lg" onClick={novo}>
                <Plus size={14} /> Novo treinamento
              </button>
            </>
          )}
        </div>
      </div>

      {d && !d.ssoAtivo && (
        <div className="tr-warn" role="note">
          <AlertTriangle size={16} />
          <span>
            <b>Login Microsoft desligado.</b> Os colaboradores entram em Meus treinamentos com a
            conta Microsoft da empresa; ative o SSO em Configurações → SSO/LDAP e cadastre o
            endereço de retorno <span className="mono">/api/public/treinamentos/sso/callback</span>{" "}
            no aplicativo do Entra ID.
          </span>
        </div>
      )}

      <div className="tr-subnav" role="tablist" aria-label="Seções">
        {(
          [
            ["geral", "Visão geral", null],
            ["catalogo", "Catálogo", treinamentos.length],
            ["atribuicoes", "Atribuições", atribuicoes.length],
          ] as Array<[Tab, string, number | null]>
        ).map(([k, l, n]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
            {n !== null && d && <span className="n">{n}</span>}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <div className="tr-state">
          <Loader2 size={20} className="tr-spin" />
        </div>
      ) : q.isError ? (
        <div className="tr-state">
          <AlertTriangle size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Não foi possível carregar os treinamentos
          </span>
          <span className="dim" style={{ fontSize: 13 }}>
            {errMsg(q.error)}
          </span>
        </div>
      ) : tab === "geral" ? (
        <>
          <div className="tr-kpis">
            <div className="tr-kpi">
              <span className="tr-kpi-label">Adesão geral</span>
              <span className="tr-kpi-value">{adesao === null ? "—" : `${adesao}%`}</span>
              <div className="tr-meter" aria-hidden="true">
                <i style={{ width: `${adesao ?? 0}%`, background: toneOf(adesao) }} />
              </div>
              <span className="tr-kpi-foot">
                {stats.done} de {stats.total} atribuições concluídas · meta {META}%
              </span>
            </div>
            <button
              type="button"
              className="tr-kpi"
              onClick={() => {
                setFSt("pendentes");
                setTab("atribuicoes");
              }}
            >
              <span className="tr-kpi-label">Pendentes</span>
              <span className="tr-kpi-value">{stats.pend}</span>
              <span className="tr-kpi-foot">dentro do prazo</span>
            </button>
            <button
              type="button"
              className="tr-kpi"
              onClick={() => {
                setFSt("atrasadas");
                setTab("atribuicoes");
              }}
            >
              <span className="tr-kpi-label">
                {stats.late > 0 && (
                  <span className="tr-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Atrasadas
              </span>
              <span className="tr-kpi-value">{stats.late}</span>
              <span className="tr-kpi-foot">prazo vencido sem conclusão</span>
            </button>
            <div className="tr-kpi">
              <span className="tr-kpi-label">Concluídas em 30 dias</span>
              <span className="tr-kpi-value">{stats.last30}</span>
              <span className="tr-kpi-foot">treinamentos finalizados</span>
            </div>
          </div>

          {foraTenant.length > 0 && (
            <div className="tr-warn" role="note">
              <AlertTriangle size={16} />
              <span>
                <b>
                  {foraTenant.length}{" "}
                  {foraTenant.length === 1 ? "colaborador tem" : "colaboradores têm"} e-mail fora
                  dos domínios do tenant
                </b>{" "}
                ({d?.allowedDomains.join(", ")}) e não{" "}
                {foraTenant.length === 1 ? "consegue" : "conseguem"} entrar com Microsoft:{" "}
                {foraTenant
                  .slice(0, 5)
                  .map((c) => c.email)
                  .join(", ")}
                {foraTenant.length > 5 ? "…" : ""}. Corrija o cadastro ou aguarde o acesso por
                código (fase futura).
              </span>
            </div>
          )}

          <div className="tr-grid">
            <div className="tr-card tr-span-2">
              <div className="tr-card-hdr">
                <h2 className="tr-card-title">Adesão por treinamento</h2>
                <p className="tr-card-sub">% de quem recebeu e concluiu · meta {META}%</p>
              </div>
              <div className="tr-card-body">
                {stats.porTr.size === 0 ? (
                  <div className="tr-empty">
                    Nenhuma atribuição ainda. Publique um treinamento e atribua aos colaboradores.
                  </div>
                ) : (
                  <div className="tr-bars">
                    {[...stats.porTr.entries()]
                      .map(([id, c]) => ({ t: trById.get(id), ...c, p: pct(c.done, c.total) ?? 0 }))
                      .filter((x) => x.t)
                      .sort((a, b) => a.p - b.p)
                      .map((x) => (
                        <div key={x.t!.id} title={`${x.done} de ${x.total} concluíram`}>
                          <span className="nm">{x.t!.titulo}</span>
                          <span className="bar">
                            <i style={{ width: `${x.p}%`, background: toneOf(x.p) }} />
                            <span className="goal" style={{ left: `${META}%` }} />
                          </span>
                          <span className="v">
                            {x.p}%{" "}
                            <small>
                              {x.done}/{x.total}
                            </small>
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
            <div className="tr-card tr-fit">
              <div className="tr-card-hdr">
                <h2 className="tr-card-title">Atividade recente</h2>
                <p className="tr-card-sub">Acessos à página do colaborador</p>
              </div>
              <div className="tr-card-body">
                {(d?.acessos ?? []).length === 0 ? (
                  <div className="tr-empty">Nenhum acesso ainda.</div>
                ) : (
                  <div className="tr-feed">
                    {(d?.acessos ?? []).map((a) => {
                      const [txt, cls, icon] = EVENTO[a.evento] ?? [
                        a.evento,
                        "",
                        <Film size={14} key="i" />,
                      ];
                      const c = a.colaborador_id ? colabById.get(a.colaborador_id) : null;
                      const t = a.treinamento_id ? trById.get(a.treinamento_id) : null;
                      return (
                        <div key={a.id}>
                          <span className={`ic ${cls}`}>{icon}</span>
                          <span style={{ minWidth: 0 }}>
                            <b>
                              {c?.display_name ?? a.email ?? "Alguém"} {txt}
                            </b>
                            <small>{t?.titulo ?? a.detalhe ?? ""}</small>
                          </span>
                          <span className="t">
                            {new Date(a.created_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      ) : tab === "catalogo" ? (
        <div className="tr-card">
          <div className="tr-toolbar">
            <b>
              Catálogo <span className="tr-count">{treinamentos.length}</span>
            </b>
            <span className="dim" style={{ fontSize: 12.5, marginLeft: "auto" }}>
              Link para os colaboradores: <span className="mono">{learnerUrl}</span>
            </span>
          </div>
          {treinamentos.length === 0 ? (
            <div className="tr-empty">
              Nenhum treinamento ainda.
              {canCreate && ' Clique em "Novo treinamento" para cadastrar o primeiro vídeo.'}
            </div>
          ) : (
            <div className="tr-cat">
              {treinamentos.map((t) => {
                const c = stats.porTr.get(t.id);
                const p = c ? pct(c.done, c.total) : null;
                return (
                  <article key={t.id} className="tr-course">
                    <div
                      className="tr-cover"
                      style={{ ["--c" as string]: TIPO_COLOR[t.tipo] } as React.CSSProperties}
                    >
                      <span>{t.video_url ? <Link2 size={20} /> : <PlayCircle size={22} />}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className={`tr-tag ${TIPO_CLS[t.tipo]}`}>{t.tipo}</span>
                      <span className={`tr-tag ${t.status === "Publicado" ? "ok" : ""}`}>
                        {t.status}
                      </span>
                    </div>
                    <h3>{t.titulo}</h3>
                    <div className="m">
                      {[
                        t.video_url
                          ? "vídeo externo"
                          : t.video_path
                            ? "vídeo no Z-Sec"
                            : "sem vídeo",
                        minutos(t.duracao_seg),
                        t.video_path && t.exigir_pct_assistido > 0
                          ? `exige ${t.exigir_pct_assistido}%`
                          : null,
                        t.exigir_ciencia || t.video_url ? "ciência" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    {c ? (
                      <div className="adh" title={`${c.done} de ${c.total} concluíram`}>
                        <span className="track">
                          <i style={{ width: `${p ?? 0}%`, background: toneOf(p) }} />
                        </span>
                        <span>
                          {p}% · {c.done}/{c.total}
                        </span>
                      </div>
                    ) : (
                      <span className="dim" style={{ fontSize: 12.5 }}>
                        Ainda não atribuído
                      </span>
                    )}
                    <div className="act">
                      {canCreate && t.status === "Publicado" && (
                        <button className="tr-btn" onClick={() => atribuirPara(t.id)}>
                          <UserPlus size={13} /> Atribuir
                        </button>
                      )}
                      {canEdit && (
                        <button className="tr-btn" onClick={() => editar(t)}>
                          <Pencil size={13} /> Editar
                        </button>
                      )}
                      {canDelete && (
                        <button
                          className="tr-btn ghost"
                          style={{ color: "var(--v2-crit)" }}
                          onClick={() => setConfirmDel({ kind: "tr", id: t.id, label: t.titulo })}
                        >
                          <Trash2 size={13} /> Excluir
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="tr-card">
          <div className="tr-toolbar">
            <b>
              Atribuições{" "}
              <span className="tr-count">
                {filtradas.length === atribuicoes.length
                  ? atribuicoes.length
                  : `${filtradas.length} de ${atribuicoes.length}`}
              </span>
            </b>
            <select
              className="tr-select"
              value={fTr}
              onChange={(e) => setFTr(e.target.value)}
              aria-label="Treinamento"
            >
              <option value="">Todos os treinamentos</option>
              {treinamentos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titulo}
                </option>
              ))}
            </select>
            <div className="tr-seg" role="group" aria-label="Status">
              {(
                [
                  ["todas", "Todas"],
                  ["pendentes", "Pendentes"],
                  ["atrasadas", "Atrasadas"],
                  ["concluidas", "Concluídas"],
                ] as Array<[StatusFiltro, string]>
              ).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={fSt === k} onClick={() => setFSt(k)}>
                  {l}
                </button>
              ))}
            </div>
            <label className="tr-search">
              <Search size={14} />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar colaborador ou treinamento"
                aria-label="Buscar atribuições"
              />
            </label>
            {canEdit && pendentesFiltro.length > 0 && (
              <button
                className="tr-btn"
                style={{ marginLeft: "auto" }}
                disabled={reMut.isPending}
                onClick={() => reMut.mutate(pendentesFiltro.slice(0, 1000))}
                title="Reenvia o convite a todas as atribuições não concluídas deste filtro"
              >
                {reMut.isPending ? <Loader2 size={13} className="tr-spin" /> : <Mail size={13} />}{" "}
                Reenviar convite ({pendentesFiltro.length})
              </button>
            )}
          </div>
          {filtradas.length === 0 ? (
            <div className="tr-empty">
              {atribuicoes.length === 0
                ? "Nenhuma atribuição ainda."
                : "Nenhuma atribuição com esses filtros."}
            </div>
          ) : (
            <div className="tr-scroll">
              <table className="tr-table">
                <thead>
                  <tr>
                    <th>Colaborador</th>
                    <th>Treinamento</th>
                    <th>Origem</th>
                    <th>Prazo</th>
                    <th>Status</th>
                    <th className="r">Assistido</th>
                    {(canEdit || canDelete) && (
                      <th>
                        <span style={{ fontSize: 0 }}>Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {filtradas.slice(0, 1000).map((a) => {
                    const c = colabById.get(a.colaborador_id);
                    const t = trById.get(a.treinamento_id);
                    const late = isLate(a);
                    return (
                      <tr key={a.id}>
                        <td className="tr-person">
                          <b>{c?.display_name ?? "—"}</b>
                          <small>{c?.email}</small>
                        </td>
                        <td style={{ color: "var(--v2-fg-2)" }}>{t?.titulo ?? "—"}</td>
                        <td className="dim">{ORIGEM[a.origem]}</td>
                        <td className="mono dim">{fmtDate(a.prazo)}</td>
                        <td>
                          {a.status === "Concluído" ? (
                            <span className="tr-tag ok">
                              <CheckCircle2 size={11} /> Concluído {fmtDate(a.concluido_em)}
                            </span>
                          ) : late ? (
                            <span className="tr-tag crit">
                              <AlertTriangle size={11} /> Atrasado
                            </span>
                          ) : a.status === "Em andamento" ? (
                            <span className="tr-tag med">Em andamento</span>
                          ) : (
                            <span className="tr-tag accent">Pendente</span>
                          )}
                        </td>
                        <td className="r mono">{t?.video_path ? `${a.pct_assistido}%` : "—"}</td>
                        {(canEdit || canDelete) && (
                          <td>
                            <div className="tr-row-act">
                              {canEdit && a.status !== "Concluído" && (
                                <button
                                  className="tr-icon-btn"
                                  title={
                                    a.convite_enviado_em
                                      ? `Reenviar convite (último: ${fmtDate(a.convite_enviado_em)})`
                                      : "Enviar convite"
                                  }
                                  aria-label="Enviar convite"
                                  onClick={() => reMut.mutate([a.id])}
                                >
                                  <Mail size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="tr-icon-btn danger"
                                  title="Remover atribuição"
                                  aria-label="Remover atribuição"
                                  onClick={() =>
                                    setConfirmDel({
                                      kind: "at",
                                      id: a.id,
                                      label: `${c?.display_name ?? ""} · ${t?.titulo ?? ""}`,
                                    })
                                  }
                                >
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <TreinamentoDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initial={formInit}
        politicas={(d?.politicas ?? []).map((p) => ({ id: p.id, name: p.name }))}
      />
      <AtribuirDialog
        open={atribOpen}
        onOpenChange={setAtribOpen}
        treinamentos={treinamentos}
        colaboradores={colaboradores}
        departamentos={d?.departamentos ?? []}
        atribuicoes={atribuicoes}
        inicial={atribInit}
      />
      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
              {confirmDel?.kind === "tr" ? "Excluir treinamento?" : "Remover atribuição?"}
            </DialogTitle>
          </DialogHeader>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
            {confirmDel?.kind === "tr"
              ? `"${confirmDel?.label}" será excluído com o vídeo e todas as atribuições e conclusões. Não dá para desfazer.`
              : `A atribuição de ${confirmDel?.label} será removida.`}
          </p>
          <DialogFooter style={{ gap: 8 }}>
            <button
              className="tr-btn ghost"
              onClick={() => setConfirmDel(null)}
              disabled={delMut.isPending}
            >
              Cancelar
            </button>
            <button
              className="tr-btn danger"
              disabled={delMut.isPending}
              onClick={() =>
                confirmDel && delMut.mutate({ kind: confirmDel.kind, id: confirmDel.id })
              }
            >
              {delMut.isPending && <Loader2 size={13} className="tr-spin" />} Excluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
