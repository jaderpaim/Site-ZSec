import { createFileRoute } from "@tanstack/react-router";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  LogOut,
  PlayCircle,
} from "lucide-react";
import {
  completeTraining,
  getLearnerSession,
  learnerLogout,
  listMyTrainings,
  openTraining,
  reportProgress,
  startLearnerSso,
  type MeuTreinamento,
} from "@/lib/treinamentos.functions";
import { APP_NAME } from "@/lib/brand";

// Página pública do colaborador. Não usa a sessão do painel: a identidade vem do
// login Microsoft do tenant (cookie de treinamento emitido no callback).
export const Route = createFileRoute("/treinamentos")({
  component: TreinamentosPage,
  validateSearch: (s: Record<string, unknown>) => ({
    t: typeof s.t === "string" ? s.t : undefined,
    erro: typeof s.erro === "string" ? s.erro : undefined,
  }),
  head: () => ({ meta: [{ title: `Meus treinamentos — ${APP_NAME}` }] }),
});

const CSS = `
  .lr { min-height:100vh; background:var(--v2-bg); color:var(--v2-fg); font-family:var(--font-ui); display:flex; flex-direction:column; }
  .lr * { box-sizing:border-box; }
  .lr :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  @keyframes lr-spin { to { transform:rotate(360deg); } }
  .lr-spin { animation:lr-spin .8s linear infinite; }
  .lr-top { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px clamp(16px, 4vw, 40px); border-bottom:1px solid var(--v2-line); background:var(--v2-surface); }
  .lr-brand { display:flex; align-items:center; gap:10px; font-weight:700; letter-spacing:-0.03em; font-size:16px; }
  .lr-brand small { font:500 10.5px var(--font-data); letter-spacing:.14em; text-transform:uppercase; color:var(--v2-accent); font-weight:500; }
  .lr-who { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--v2-fg-2); }
  .lr-main { flex:1; width:100%; max-width:960px; margin:0 auto; padding:32px clamp(16px, 4vw, 32px) 48px; display:grid; gap:20px; align-content:start; }
  .lr-h1 { margin:0; font-size:clamp(24px, 3vw, 30px); font-weight:600; letter-spacing:-0.02em; }
  .lr-sub { margin:4px 0 0; font-size:14px; color:var(--v2-fg-3); }
  .lr-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:14px; }
  .lr-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; height:40px; padding:0 16px; border-radius:10px; font:inherit; font-size:14px; font-weight:500; cursor:pointer; border:1px solid var(--v2-line-strong); background:var(--v2-surface); color:var(--v2-fg); text-decoration:none; }
  .lr-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .lr-btn:disabled { opacity:.5; cursor:not-allowed; }
  .lr-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); font-weight:600; }
  .lr-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .lr-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); height:34px; padding:0 10px; }
  .lr-err { display:flex; gap:10px; align-items:flex-start; padding:12px 14px; border-radius:10px; font-size:14px; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-crit) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-crit) 35%, transparent); }
  .lr-err svg { color:var(--v2-crit); flex-shrink:0; margin-top:2px; }
  /* entrada */
  .lr-signin { max-width:440px; margin:6vh auto 0; padding:32px; display:grid; gap:18px; text-align:center; }
  .lr-signin p { margin:0; font-size:14.5px; line-height:1.6; color:var(--v2-fg-2); }
  .lr-ms { height:46px; width:100%; }
  .lr-note { font-size:12.5px; color:var(--v2-fg-3); line-height:1.5; }
  /* lista */
  .lr-sec { font-size:13px; font-weight:500; color:var(--v2-fg-3); margin:8px 0 -6px; }
  .lr-list { display:grid; gap:12px; }
  .lr-item { display:grid; grid-template-columns:48px minmax(0, 1fr) auto; gap:16px; align-items:center; padding:16px 18px; border-radius:14px; border:1px solid var(--v2-line); background:var(--v2-surface); text-align:left; color:inherit; font:inherit; cursor:pointer; width:100%; }
  .lr-item:hover { border-color:var(--v2-line-strong); }
  .lr-item .ic { width:48px; height:48px; border-radius:12px; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }
  .lr-item.done .ic { background:color-mix(in oklch, var(--v2-ok) 14%, transparent); color:var(--v2-ok); }
  .lr-item b { display:block; font-size:15px; font-weight:600; }
  .lr-item small { display:block; font-size:13px; color:var(--v2-fg-3); margin-top:2px; }
  .lr-tag { display:inline-flex; align-items:center; gap:5px; height:24px; padding:0 9px; border-radius:6px; font-size:12.5px; font-weight:500; white-space:nowrap; --c:var(--v2-accent); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .lr-tag.late { --c:var(--v2-crit); } .lr-tag.ok { --c:var(--v2-ok); } .lr-tag.prog { --c:var(--v2-med); }
  .lr-empty { padding:40px 20px; text-align:center; color:var(--v2-fg-3); font-size:14px; display:grid; gap:8px; justify-items:center; }
  .lr-empty svg { color:var(--v2-ok); }
  /* player */
  .lr-video { width:100%; aspect-ratio:16 / 9; border-radius:14px; background:#000; display:block; }
  .lr-frame { width:100%; aspect-ratio:16 / 9; border:0; border-radius:14px; background:#000; }
  .lr-watch { display:grid; gap:8px; padding:14px 16px; border-radius:12px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:14px; color:var(--v2-fg-2); }
  .lr-watch b { color:var(--v2-fg); }
  .lr-bar { position:relative; height:8px; border-radius:99px; background:var(--v2-surface); overflow:visible; }
  .lr-bar i { display:block; height:100%; border-radius:99px; background:var(--v2-accent); transition:width .3s; }
  .lr-bar .goal { position:absolute; top:-3px; bottom:-3px; border-left:2px solid var(--v2-med); }
  .lr-ok { color:color-mix(in oklch, var(--v2-ok) 80%, var(--v2-fg)); font-weight:600; }
  .lr-ack { display:flex; gap:10px; align-items:flex-start; font-size:14.5px; line-height:1.5; color:var(--v2-fg-2); cursor:pointer; }
  .lr-ack input { margin-top:4px; width:16px; height:16px; accent-color:var(--v2-accent); }
  .lr-actions { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; align-items:center; }
  .lr-desc { font-size:15px; line-height:1.7; color:var(--v2-fg-2); white-space:pre-wrap; margin:0; }
  .lr-foot { text-align:center; padding:20px; font-size:12px; color:var(--v2-fg-3); }
  @media (max-width: 560px) { .lr-item { grid-template-columns:40px minmax(0, 1fr); } .lr-item .lr-tag { grid-column:2; justify-self:start; } }
`;

function ZMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 54) / 48} viewBox="0 0 48 54" aria-hidden="true">
      <path
        d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z"
        fill="var(--v2-accent)"
      />
      <path
        d="M15.5 19.5H32.5L15.5 35.5H32.5"
        fill="none"
        stroke="var(--v2-accent-ink)"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const fmtDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : null);
const minutos = (s: number | null) => (s ? `${Math.max(1, Math.round(s / 60))} min` : null);
function prazoInfo(prazo: string | null) {
  if (!prazo) return null;
  const [y, m, d] = prazo.split("-").map(Number);
  const t = new Date();
  const diff = Math.round(
    (new Date(y, m - 1, d).getTime() -
      new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) /
      86_400_000,
  );
  return {
    diff,
    label: diff < 0 ? `atrasado ${-diff} d` : diff === 0 ? "vence hoje" : `até ${fmtDate(prazo)}`,
  };
}

/** Converte links do YouTube/Vimeo em endereço de incorporação; outros links são usados como estão. */
function embedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be"))
      return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").pop();
      return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (u.hostname === "vimeo.com")
      return `https://player.vimeo.com/video/${u.pathname.split("/").filter(Boolean)[0]}`;
    return url;
  } catch {
    return url;
  }
}

function TreinamentosPage() {
  const search = Route.useSearch();
  const fetchSession = useServerFn(getLearnerSession);
  const session = useQuery({
    queryKey: ["learner-session"],
    queryFn: () => fetchSession(),
    retry: false,
  });

  return (
    <div className="lr">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <header className="lr-top">
        <span className="lr-brand">
          <ZMark />
          <span>
            {APP_NAME} <small>Treinamentos</small>
          </span>
        </span>
        {session.data && <LearnerMenu nome={session.data.nome} />}
      </header>
      <main className="lr-main">
        {session.isLoading ? (
          <div className="lr-empty">
            <Loader2 size={20} className="lr-spin" />
          </div>
        ) : session.data ? (
          <Learner nome={session.data.nome} deepLink={search.t} />
        ) : (
          <SignIn erro={search.erro} t={search.t} />
        )}
      </main>
      <footer className="lr-foot">{APP_NAME} · Segurança da Informação</footer>
    </div>
  );
}

function LearnerMenu({ nome }: { nome: string }) {
  const logout = useServerFn(learnerLogout);
  const qc = useQueryClient();
  return (
    <span className="lr-who">
      {nome}
      <button
        className="lr-btn ghost"
        onClick={async () => {
          await logout();
          qc.invalidateQueries({ queryKey: ["learner-session"] });
        }}
        aria-label="Sair"
        title="Sair"
      >
        <LogOut size={16} />
      </button>
    </span>
  );
}

function SignIn({ erro, t }: { erro?: string; t?: string }) {
  const start = useServerFn(startLearnerSso);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(erro ?? null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      const r = await start({ data: { t: t ?? null } });
      window.location.href = r.authorizeUrl;
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="lr-card lr-signin">
      <div style={{ display: "grid", justifyItems: "center", gap: 12 }}>
        <ZMark size={44} />
        <h1 className="lr-h1">Meus treinamentos</h1>
      </div>
      <p>
        Entre com a sua conta Microsoft da empresa para ver e fazer os seus treinamentos de
        segurança.
      </p>
      {err && (
        <div className="lr-err" role="alert">
          <AlertTriangle size={16} />
          <span>{err}</span>
        </div>
      )}
      <button className="lr-btn primary lr-ms" onClick={go} disabled={busy}>
        {busy ? (
          <Loader2 size={16} className="lr-spin" />
        ) : (
          <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
        )}
        Entrar com Microsoft
      </button>
      <p className="lr-note">
        Você só vê os treinamentos atribuídos a você. Esta página não dá acesso a outras áreas do
        {APP_NAME}.
      </p>
    </div>
  );
}

function Learner({ nome, deepLink }: { nome: string; deepLink?: string }) {
  const fetchList = useServerFn(listMyTrainings);
  const list = useQuery({ queryKey: ["learner-trainings"], queryFn: () => fetchList() });
  const [openId, setOpenId] = React.useState<string | null>(null);
  const deepDone = React.useRef(false);

  // Link do e-mail (?t=<treinamento>): abre direto o treinamento, se for da pessoa
  React.useEffect(() => {
    if (deepDone.current || !deepLink || !list.data) return;
    deepDone.current = true;
    const a = list.data.find((x) => x.treinamento_id === deepLink);
    if (a) setOpenId(a.atribuicao_id);
  }, [deepLink, list.data]);

  if (openId)
    return <Player atribuicaoId={openId} onBack={() => (setOpenId(null), list.refetch())} />;

  if (list.isLoading)
    return (
      <div className="lr-empty">
        <Loader2 size={20} className="lr-spin" />
      </div>
    );
  if (list.isError)
    return (
      <div className="lr-err" role="alert">
        <AlertTriangle size={16} />
        <span>{(list.error as Error).message}</span>
      </div>
    );

  const items = list.data ?? [];
  const pend = items
    .filter((i) => i.status !== "Concluído")
    .sort((a, b) => (a.prazo ?? "9999").localeCompare(b.prazo ?? "9999"));
  const done = items.filter((i) => i.status === "Concluído");

  const card = (i: MeuTreinamento) => {
    const pz = prazoInfo(i.prazo);
    const isDone = i.status === "Concluído";
    return (
      <button
        key={i.atribuicao_id}
        className={`lr-item${isDone ? " done" : ""}`}
        onClick={() => setOpenId(i.atribuicao_id)}
      >
        <span className="ic">{isDone ? <CheckCircle2 size={22} /> : <PlayCircle size={22} />}</span>
        <span style={{ minWidth: 0 }}>
          <b>{i.titulo}</b>
          <small>
            {[
              i.tipo,
              minutos(i.duracao_seg),
              isDone
                ? `concluído em ${new Date(i.concluido_em!).toLocaleDateString("pt-BR")}`
                : i.pct_assistido > 0
                  ? `${i.pct_assistido}% assistido`
                  : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </small>
        </span>
        {isDone ? (
          <span className="lr-tag ok">Concluído</span>
        ) : pz ? (
          <span
            className={`lr-tag ${pz.diff < 0 ? "late" : i.status === "Em andamento" ? "prog" : ""}`}
          >
            <Clock size={12} /> {pz.label}
          </span>
        ) : (
          <span className="lr-tag">{i.status}</span>
        )}
      </button>
    );
  };

  return (
    <>
      <div>
        <h1 className="lr-h1">Olá, {nome.split(" ")[0]}</h1>
        <p className="lr-sub">
          {pend.length === 0
            ? "Você está em dia com os seus treinamentos."
            : `Você tem ${pend.length} ${pend.length === 1 ? "treinamento pendente" : "treinamentos pendentes"}.`}
        </p>
      </div>
      {pend.length > 0 && (
        <>
          <div className="lr-sec">Para fazer</div>
          <div className="lr-list">{pend.map(card)}</div>
        </>
      )}
      {pend.length === 0 && (
        <div className="lr-card lr-empty">
          <CheckCircle2 size={28} />
          Nada pendente por aqui.
        </div>
      )}
      {done.length > 0 && (
        <>
          <div className="lr-sec">Concluídos</div>
          <div className="lr-list">{done.map(card)}</div>
        </>
      )}
    </>
  );
}

function Player({ atribuicaoId, onBack }: { atribuicaoId: string; onBack: () => void }) {
  const open = useServerFn(openTraining);
  const report = useServerFn(reportProgress);
  const complete = useServerFn(completeTraining);
  const q = useQuery({
    queryKey: ["learner-open", atribuicaoId],
    queryFn: () => open({ data: { atribuicao_id: atribuicaoId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const t = q.data;

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const maxSeen = React.useRef(0); // segundos assistidos de forma contínua
  const lastSent = React.useRef(0);
  const [pct, setPct] = React.useState(0);
  const [ack, setAck] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState<string | null>(null);
  const [concluido, setConcluido] = React.useState(false);

  React.useEffect(() => {
    if (t) {
      setPct(t.pct_assistido);
      setConcluido(t.status === "Concluído");
    }
  }, [t]);

  const send = (p: number, force = false) => {
    if (!force && p - lastSent.current < 5) return;
    lastSent.current = p;
    report({ data: { atribuicao_id: atribuicaoId, pct: p } }).catch(() => {});
  };

  const onLoaded = () => {
    const v = videoRef.current;
    if (!v || !t || !v.duration) return;
    // Retoma de onde parou
    maxSeen.current = (t.pct_assistido / 100) * v.duration;
    lastSent.current = t.pct_assistido;
  };
  const onTime = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    if (v.currentTime <= maxSeen.current + 1.5)
      maxSeen.current = Math.max(maxSeen.current, v.currentTime);
    const p = Math.min(100, Math.floor((maxSeen.current / v.duration) * 100));
    if (p > pct) {
      setPct(p);
      send(p);
    }
  };
  const onSeeking = () => {
    const v = videoRef.current;
    // Avanço rápido bloqueado: só é possível voltar ao que já foi assistido
    if (v && t?.bloquear_avanco && v.currentTime > maxSeen.current + 1.5)
      v.currentTime = maxSeen.current;
  };
  const onPauseOrEnd = () => send(pct, true);

  if (q.isLoading)
    return (
      <div className="lr-empty">
        <Loader2 size={20} className="lr-spin" />
      </div>
    );
  if (q.isError || !t)
    return (
      <>
        <button className="lr-btn ghost" onClick={onBack} style={{ justifySelf: "start" }}>
          <ArrowLeft size={16} /> Meus treinamentos
        </button>
        <div className="lr-err" role="alert">
          <AlertTriangle size={16} />
          <span>{(q.error as Error)?.message ?? "Treinamento indisponível"}</span>
        </div>
      </>
    );

  const hosted = !!t.video_src;
  const precisa = hosted ? t.exigir_pct_assistido : 0;
  const assistiuOk = !hosted || pct >= precisa;
  const pedeCiencia = t.exigir_ciencia || !hosted;
  const podeConcluir = assistiuOk && (!pedeCiencia || ack) && !concluido;
  const pz = prazoInfo(t.prazo);

  const concluir = async () => {
    setBusy(true);
    setErr(null);
    try {
      await complete({ data: { atribuicao_id: atribuicaoId, ciencia: ack } });
      setConcluido(true);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button className="lr-btn ghost" onClick={onBack} style={{ justifySelf: "start" }}>
        <ArrowLeft size={16} /> Meus treinamentos
      </button>
      <div>
        <h1 className="lr-h1">{t.titulo}</h1>
        <p className="lr-sub">
          {[t.tipo, minutos(t.duracao_seg), pz ? `prazo ${pz.label}` : null]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {hosted ? (
        <video
          ref={videoRef}
          className="lr-video"
          src={t.video_src ?? undefined}
          controls
          controlsList="nodownload noplaybackrate"
          disablePictureInPicture
          playsInline
          preload="metadata"
          onLoadedMetadata={onLoaded}
          onTimeUpdate={onTime}
          onSeeking={onSeeking}
          onPause={onPauseOrEnd}
          onEnded={onPauseOrEnd}
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : t.video_url ? (
        <iframe
          className="lr-frame"
          src={embedUrl(t.video_url)}
          title={t.titulo}
          allow="fullscreen; picture-in-picture"
          allowFullScreen
        />
      ) : (
        <div className="lr-err">
          <AlertTriangle size={16} />
          <span>Este treinamento ainda não tem vídeo.</span>
        </div>
      )}

      {t.descricao && <p className="lr-desc">{t.descricao}</p>}

      {concluido ? (
        <div className="lr-card lr-empty">
          <CheckCircle2 size={30} />
          <b style={{ color: "var(--v2-fg)", fontSize: 16 }}>Treinamento concluído</b>
          Obrigado! Sua conclusão já aparece para o time de Segurança da Informação.
          <button className="lr-btn" onClick={onBack} style={{ marginTop: 8 }}>
            Voltar para Meus treinamentos
          </button>
        </div>
      ) : (
        <>
          {hosted && (
            <div className="lr-watch" aria-live="polite">
              <span>
                {assistiuOk ? (
                  <span className="lr-ok">✓ Vídeo assistido ({pct}%)</span>
                ) : (
                  <>
                    Assistido: <b>{pct}%</b> · assista pelo menos <b>{precisa}%</b> para concluir
                    {t.bloquear_avanco ? " (avanço rápido bloqueado)" : ""}
                  </>
                )}
              </span>
              <span className="lr-bar" aria-hidden="true">
                <i style={{ width: `${pct}%` }} />
                <span className="goal" style={{ left: `${precisa}%` }} />
              </span>
            </div>
          )}
          {pedeCiencia && (
            <label className="lr-ack">
              <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
              Assisti e entendi o conteúdo deste treinamento.
            </label>
          )}
          {err && (
            <div className="lr-err" role="alert">
              <AlertTriangle size={16} />
              <span>{err}</span>
            </div>
          )}
          <div className="lr-actions">
            <span className="lr-note">
              {!assistiuOk ? "O botão é liberado quando você chegar ao mínimo." : ""}
            </span>
            <button className="lr-btn primary" onClick={concluir} disabled={!podeConcluir || busy}>
              {busy && <Loader2 size={16} className="lr-spin" />} Concluir treinamento
            </button>
          </div>
        </>
      )}
    </>
  );
}
