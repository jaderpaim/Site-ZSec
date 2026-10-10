import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { useAuth, useSignOutReason } from "@/lib/auth-context";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSsoPublicConfig, startAzureLogin } from "@/lib/sso.functions";
import { isSafeRedirectPath } from "@/lib/safe-redirect";
import { ArrowRight, Check, Eye, EyeOff, GitBranch, Loader2, Lock } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    sso_error: typeof s.sso_error === "string" ? s.sso_error : undefined,
  }),
});

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .lg { min-height:100vh; display:grid; grid-template-columns:56fr minmax(380px, 44fr); background:var(--v2-bg); color:var(--v2-fg); font-family:var(--font-ui); }
  .lg * { box-sizing:border-box; }
  .lg :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }

  /* ── Autenticação (direita) ── */
  .lg-side { display:flex; flex-direction:column; padding:28px clamp(24px, 5vw, 64px); }
  .lg-wrap { flex:1; display:flex; align-items:center; justify-content:center; }
  .lg-form { width:100%; max-width:380px; padding-block:40px; margin-inline:auto; }
  .lg-brand { display:flex; align-items:center; justify-content:center; gap:14px; margin-bottom:36px; text-align:left; }
  .lg-brand svg { flex-shrink:0; filter:drop-shadow(0 8px 18px color-mix(in oklch, var(--v2-accent) 35%, transparent)); }
  .lg-brand b { display:block; font-size:32px; font-weight:700; letter-spacing:-0.04em; line-height:1; }
  .lg-brand small { display:block; margin-top:6px; font:500 11.5px var(--font-data); letter-spacing:.18em; text-transform:uppercase; color:var(--v2-accent); }
  .lg-form h1 { text-align:center; margin:0 0 8px; font-size:clamp(28px, 3vw, 34px); font-weight:600; letter-spacing:-0.03em; line-height:1.15; }
  .lg-lead { text-align:center; margin:0 0 32px; font-size:15px; color:var(--v2-fg-3); }
  .lg-sso { width:100%; height:46px; border-radius:10px; border:1px solid var(--v2-line-strong); background:var(--v2-surface); color:var(--v2-fg); font:inherit; font-size:14.5px; font-weight:500; display:flex; align-items:center; justify-content:center; gap:10px; cursor:pointer; transition:background .15s, border-color .15s; }
  .lg-sso:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-fg-3); }
  .lg-sso:disabled { opacity:.5; cursor:not-allowed; }
  .lg-or { display:flex; align-items:center; gap:12px; margin:22px 0; font-size:12.5px; color:var(--v2-fg-3); }
  .lg-or::before, .lg-or::after { content:""; flex:1; height:1px; background:var(--v2-line); }
  .lg-f { display:grid; gap:14px; }
  .lg-fld { display:grid; gap:6px; }
  .lg-fld-top { display:flex; align-items:baseline; justify-content:space-between; gap:8px; }
  .lg-fld label { font-size:13px; font-weight:500; color:var(--v2-fg-2); }
  .lg-fld-top button { border:0; background:none; padding:0; color:var(--v2-accent); font:inherit; font-size:12.5px; cursor:pointer; }
  .lg-in { position:relative; }
  .lg-in input { width:100%; height:46px; padding:0 14px; border-radius:10px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); font:inherit; font-size:14.5px; outline:none; transition:border-color .15s, box-shadow .15s; }
  .lg-in input::placeholder { color:var(--v2-fg-3); }
  .lg-in input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 4px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .lg-in input[readonly] { background:var(--v2-surface-2); color:var(--v2-fg-2); }
  .lg-eye { position:absolute; right:6px; top:50%; transform:translateY(-50%); width:34px; height:34px; border:0; border-radius:8px; background:transparent; color:var(--v2-fg-3); cursor:pointer; display:grid; place-items:center; }
  .lg-eye:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .lg-go { height:46px; border-radius:10px; border:0; background:var(--v2-accent); color:var(--v2-accent-ink); font:inherit; font-size:14.5px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; transition:filter .15s; }
  .lg-go:hover:not(:disabled) { filter:brightness(1.08); }
  .lg-go:disabled { opacity:.6; cursor:not-allowed; }
  .lg-go svg { transition:transform .15s; }
  .lg-go:hover:not(:disabled) svg.arrow { transform:translateX(2px); }
  @keyframes lg-spin { to { transform:rotate(360deg); } }
  .lg-spin { animation:lg-spin .8s linear infinite; }
  .lg-help { text-align:center; margin:18px 0 0; font-size:13px; color:var(--v2-fg-3); line-height:1.5; }
  .lg-foot { display:flex; align-items:center; justify-content:center; gap:8px 20px; flex-wrap:wrap; text-align:center; font-size:12.5px; color:var(--v2-fg-3); }
  .lg-foot span { display:inline-flex; align-items:center; gap:6px; }
  .lg-foot a { color:var(--v2-fg-3); text-decoration:none; }
  .lg-foot a:hover { color:var(--v2-fg); }

  /* ── Vitrine da marca (esquerda) ── */
  .lg-show { position:relative; overflow:hidden; display:flex; flex-direction:column; justify-content:center; align-items:center; gap:40px; padding:56px clamp(28px, 5vw, 72px); order:-1;
    background:linear-gradient(200deg, color-mix(in oklch, var(--v2-accent) 10%, var(--v2-surface)) 0%, var(--v2-surface) 55%); border-right:1px solid var(--v2-line); }
  .lg-show::before { content:""; position:absolute; inset:0; pointer-events:none; opacity:.55;
    background-image:radial-gradient(color-mix(in oklch, var(--v2-fg) 14%, transparent) 1px, transparent 1px); background-size:22px 22px;
    mask-image:linear-gradient(180deg, #000 0%, transparent 85%); -webkit-mask-image:linear-gradient(180deg, #000 0%, transparent 85%); }
  .lg-pitch { position:relative; max-width:560px; text-align:center; }
  .lg-eyebrow { display:inline-flex; align-items:center; gap:8px; height:28px; padding:0 12px; border-radius:99px; border:1px solid var(--v2-line); background:var(--v2-surface); font-size:12.5px; color:var(--v2-fg-2); margin-bottom:18px; }
  .lg-eyebrow i { width:7px; height:7px; border-radius:50%; background:var(--v2-ok); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-ok) 25%, transparent); animation:lg-pulse 2s ease-in-out infinite; }
  .lg-pitch h2 { margin:0 0 14px; font-size:clamp(30px, 3.4vw, 46px); font-weight:600; letter-spacing:-0.035em; line-height:1.08; text-wrap:balance; }
  .lg-pitch h2 em { font-style:normal; color:var(--v2-accent); }
  .lg-pitch p { margin:0 auto; font-size:16px; line-height:1.6; color:var(--v2-fg-2); max-width:52ch; }

  .lg-stage { position:relative; perspective:1400px; max-width:640px; width:100%; }
  .lg-mock { position:relative; border-radius:14px; border:1px solid var(--v2-line-strong); background:var(--v2-bg); overflow:hidden;
    box-shadow:0 30px 80px -20px rgba(0,0,0,.45), 0 0 0 1px color-mix(in oklch, var(--v2-accent) 8%, transparent);
    transform:rotateX(5deg) rotateY(8deg); transform-origin:40% 50%; transition:transform .6s cubic-bezier(.2,.7,.2,1); }
  .lg-stage:hover .lg-mock { transform:rotateX(2deg) rotateY(4deg); }
  .lg-mock-bar { display:flex; align-items:center; gap:6px; height:34px; padding:0 12px; border-bottom:1px solid var(--v2-line); background:var(--v2-surface-2); }
  .lg-mock-bar i { width:9px; height:9px; border-radius:50%; background:var(--v2-line-strong); }
  .lg-mock-bar span { margin-left:10px; font:400 11.5px var(--font-data); color:var(--v2-fg-3); }
  .lg-mock-body { display:grid; grid-template-columns:150px 1fr; min-height:300px; }
  .lg-mock-nav { border-right:1px solid var(--v2-line); padding:12px 10px; display:grid; gap:4px; align-content:start; background:var(--v2-surface); }
  .lg-mock-nav div { display:flex; align-items:center; gap:8px; height:26px; padding:0 8px; border-radius:6px; font-size:11.5px; color:var(--v2-fg-3); }
  .lg-mock-nav div.on { background:var(--v2-hover); color:var(--v2-fg); }
  .lg-mock-nav div i { width:12px; height:12px; border-radius:3px; background:var(--v2-line-strong); }
  .lg-mock-nav div.on i { background:var(--v2-accent); }
  .lg-mock-nav div b { margin-left:auto; font:500 10px var(--font-data); color:var(--v2-crit); }
  .lg-mock-main { padding:14px; display:grid; gap:12px; align-content:start; }
  .lg-kpis { display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; }
  .lg-kpi { border:1px solid var(--v2-line); border-radius:8px; padding:9px 10px; background:var(--v2-surface); }
  .lg-kpi small { display:block; font-size:10.5px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lg-kpi b { display:block; font-size:19px; font-weight:600; letter-spacing:-0.02em; margin-top:2px; font-variant-numeric:tabular-nums; }
  .lg-kpi em { display:block; font:normal 500 10px var(--font-data); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .lg-chart { border:1px solid var(--v2-line); border-radius:8px; padding:10px 10px 4px; background:var(--v2-surface); }
  .lg-chart small { display:flex; justify-content:space-between; font-size:10.5px; color:var(--v2-fg-3); }
  .lg-chart svg { display:block; width:100%; height:92px; }
  .lg-draw { stroke-dasharray:600; stroke-dashoffset:600; animation:lg-draw 2.4s .4s cubic-bezier(.4,0,.2,1) forwards; }
  .lg-rows { display:grid; gap:6px; }
  .lg-row { display:grid; grid-template-columns:auto 1fr auto; gap:8px; align-items:center; font-size:11px; }
  .lg-row > i { width:7px; height:7px; border-radius:2px; }
  .lg-row span { font:400 10.5px var(--font-data); color:var(--v2-fg-3); }
  .lg-sev { height:5px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .lg-sev i { display:block; height:100%; border-radius:99px; }

  .lg-toast { position:absolute; display:grid; grid-template-columns:30px 1fr; gap:2px 10px; align-items:center; width:250px; padding:10px 12px; border-radius:12px; border:1px solid var(--v2-line-strong); background:var(--v2-surface); box-shadow:0 18px 40px -12px rgba(0,0,0,.4); opacity:0; animation:lg-rise .6s cubic-bezier(.2,.7,.2,1) forwards; }
  .lg-toast .ic { grid-row:span 2; width:30px; height:30px; border-radius:8px; display:grid; place-items:center; --c:var(--v2-ok); background:color-mix(in oklch, var(--c) 15%, transparent); color:var(--c); }
  .lg-toast b { font-size:12.5px; font-weight:600; }
  .lg-toast small { font-size:11.5px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .lg-t1 { right:-18px; top:-34px; animation-delay:1.1s; }
  .lg-t2 { left:-22px; bottom:-26px; animation-delay:1.8s; }
  .lg-t2 .ic { --c:var(--v2-accent); }

  .lg-integr { position:relative; display:flex; align-items:center; justify-content:center; gap:10px 22px; flex-wrap:wrap; font-size:13px; color:var(--v2-fg-3); }
  .lg-integr b { font-weight:500; color:var(--v2-fg-2); }
  .lg-integr span { display:inline-flex; align-items:center; gap:7px; }
  .lg-integr span i { width:5px; height:5px; border-radius:50%; background:var(--v2-fg-3); }

  @keyframes lg-pulse { 0%,100% { opacity:1; } 50% { opacity:.45; } }
  @keyframes lg-draw { to { stroke-dashoffset:0; } }
  @keyframes lg-rise { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }
  @media (prefers-reduced-motion: reduce) {
    .lg-eyebrow i, .lg-draw, .lg-toast, .lg-spin { animation:none; }
    .lg-draw { stroke-dashoffset:0; }
    .lg-toast { opacity:1; }
    .lg-mock, .lg-stage:hover .lg-mock { transition:none; }
  }
  @media (max-width: 1100px) { .lg { grid-template-columns:1fr; } .lg-show { display:none; } .lg-form { margin-inline:auto; } }
  @media (max-width: 480px) { .lg-foot { justify-content:center; text-align:center; } }
`;

/** Escudo Z-Sec (mesmo desenho do escudo do app, com "Z" no lugar do ∞). */
function ZSecMark({ size = 52 }: { size?: number }) {
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

function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/** Vitrine: prévia ilustrativa do painel (não são dados reais). */
const ProductShowcase = React.memo(function ProductShowcase() {
  return (
    <aside className="lg-show" aria-label={`Sobre o ${APP_NAME}`}>
      <div className="lg-pitch">
        <div className="lg-eyebrow">
          <i />
          Monitoramento contínuo
        </div>
        <h2>
          Toda a postura de segurança <em>em uma tela.</em>
        </h2>
        <p>
          Vulnerabilidades, ofensas do SOC, endpoints, domínios e mudanças correlacionados num só
          painel, com o que precisa de ação no topo.
        </p>
      </div>

      <div className="lg-stage" aria-hidden="true">
        <div className="lg-mock">
          <div className="lg-mock-bar">
            <i />
            <i />
            <i />
            <span>z-sec / visão geral</span>
          </div>
          <div className="lg-mock-body">
            <div className="lg-mock-nav">
              <div className="on">
                <i />
                Visão geral
              </div>
              <div>
                <i />
                Vulnerabilidades<b>14</b>
              </div>
              <div>
                <i />
                SOC<b>5</b>
              </div>
              <div>
                <i />
                Antivírus XDR/EDR
              </div>
              <div>
                <i />
                Cloudflare
              </div>
              <div>
                <i />
                GMUD
              </div>
            </div>
            <div className="lg-mock-main">
              <div className="lg-kpis">
                <div className="lg-kpi">
                  <small>Críticas abertas</small>
                  <b>14</b>
                  <em style={{ color: "var(--v2-ok)" }}>↓ 6 na semana</em>
                </div>
                <div className="lg-kpi">
                  <small>Ofensas no SOC</small>
                  <b>5</b>
                  <em style={{ color: "var(--v2-fg-3)" }}>2 em análise</em>
                </div>
                <div className="lg-kpi">
                  <small>Endpoints protegidos</small>
                  <b>98,4%</b>
                  <em style={{ color: "var(--v2-ok)" }}>↑ 1,2 p.p.</em>
                </div>
              </div>
              <div className="lg-chart">
                <small>
                  <span>Vulnerabilidades abertas · 30 dias</span>
                  <span>críticas · altas</span>
                </small>
                <svg viewBox="0 0 400 92" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="lg-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="var(--v2-accent)" stopOpacity=".28" />
                      <stop offset="1" stopColor="var(--v2-accent)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path
                    d="M0 30 C40 26 60 40 100 36 S170 22 210 34 S280 58 320 54 S370 66 400 70 L400 92 L0 92Z"
                    fill="url(#lg-area)"
                  />
                  <path
                    className="lg-draw"
                    d="M0 30 C40 26 60 40 100 36 S170 22 210 34 S280 58 320 54 S370 66 400 70"
                    fill="none"
                    stroke="var(--v2-accent)"
                    strokeWidth="2.2"
                  />
                  <path
                    className="lg-draw"
                    d="M0 62 C50 58 80 66 120 64 S190 52 230 60 S300 74 340 72 S380 80 400 82"
                    fill="none"
                    stroke="var(--v2-crit)"
                    strokeWidth="2"
                    style={{ animationDelay: ".7s" }}
                  />
                </svg>
              </div>
              <div className="lg-rows">
                {(
                  [
                    ["var(--v2-crit)", 72, "srv-bh-04"],
                    ["var(--v2-high)", 48, "portal.zsec"],
                    ["var(--v2-med)", 30, "fgt-sp-01"],
                  ] as const
                ).map(([c, w, host]) => (
                  <div key={host} className="lg-row">
                    <i style={{ background: c }} />
                    <div className="lg-sev">
                      <i style={{ width: `${w}%`, background: c }} />
                    </div>
                    <span>{host}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="lg-toast lg-t1">
          <span className="ic">
            <Check size={15} strokeWidth={2.6} />
          </span>
          <b>Ofensa resolvida</b>
          <small>Firewall SP · tráfego suspeito</small>
        </div>
        <div className="lg-toast lg-t2">
          <span className="ic">
            <GitBranch size={15} />
          </span>
          <b>GMUD aprovada</b>
          <small>Atualização do PostgreSQL · etapa 3 de 3</small>
        </div>
      </div>

      <div className="lg-integr">
        <b>Integração com</b>
        {["SIEM", "Antivírus XDR/EDR", "Cloudflare", "Microsoft 365", "Zabbix"].map((n) => (
          <span key={n}>
            <i />
            {n}
          </span>
        ))}
      </div>
    </aside>
  );
});

function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  useSignOutReason();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"email" | "password">("email");
  const ssoFn = useServerFn(getSsoPublicConfig);
  const startSso = useServerFn(startAzureLogin);
  const sso = useQuery({
    queryKey: ["sso-public-config"],
    queryFn: () => ssoFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (search.sso_error) toast.error(`SSO: ${search.sso_error}`);
  }, [search.sso_error]);

  useEffect(() => {
    if (loading || !user) return;
    const redirect = search.redirect;
    const isSafe = isSafeRedirectPath(redirect) && !redirect.startsWith("/login");
    // O destino pode trazer querystring própria (ex: /app/gmud?gmud=<id>) — "to" do
    // router só aceita o path, então separamos o path do search antes de navegar,
    // senão a querystring (e o deep-link) se perde.
    const [path, queryString] = isSafe ? redirect.split("?") : ["/app/vulnerabilidades", undefined];
    const searchParams = queryString ? Object.fromEntries(new URLSearchParams(queryString)) : {};
    (navigate as any)({ to: path, search: searchParams, replace: true });
  }, [user, loading, navigate, search.redirect]);

  async function onContinue(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setStep("password");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (res.error) toast.error(res.error);
  }

  async function onSsoButton() {
    setBusy(true);
    try {
      const r = await startSso({ data: { email: "", redirect: search.redirect ?? null } });
      window.location.href = r.authorizeUrl;
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao iniciar SSO");
      setBusy(false);
    }
  }

  const ssoEnabled = !!sso.data?.oauthEnabled;

  return (
    // Login é sempre claro; o tema escolhido vale só dentro do app
    <div className="lg v2-light">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Autenticação ──────────────────────────────────────────────────── */}
      <section className="lg-side">
        <div className="lg-wrap">
          <main className="lg-form">
            <div className="lg-brand">
              <ZSecMark />
              <div>
                <b>{APP_NAME}</b>
                <small>Security Suite</small>
              </div>
            </div>

            <h1>Entre no {APP_NAME}</h1>
            <p className="lg-lead">Use sua conta corporativa para acessar o painel.</p>

            {step === "email" && ssoEnabled && (
              <>
                <button type="button" className="lg-sso" onClick={onSsoButton} disabled={busy}>
                  <MicrosoftLogo />
                  Continuar com Microsoft
                </button>
                <div className="lg-or">ou entre com e-mail</div>
              </>
            )}

            <form className="lg-f" onSubmit={step === "email" ? onContinue : onSubmit}>
              <div className="lg-fld">
                <div className="lg-fld-top">
                  <label htmlFor="lg-email">E-mail corporativo</label>
                  {step === "password" && (
                    <button
                      type="button"
                      onClick={() => {
                        setStep("email");
                        setPassword("");
                        setShowPassword(false);
                      }}
                    >
                      Trocar
                    </button>
                  )}
                </div>
                <div className="lg-in">
                  <input
                    id="lg-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    readOnly={step === "password"}
                    autoComplete="username"
                    autoFocus
                    placeholder="nome@empresa.com.br"
                  />
                </div>
              </div>

              {step === "password" && (
                <div className="lg-fld">
                  <label htmlFor="lg-pass">Senha</label>
                  <div className="lg-in">
                    <input
                      id="lg-pass"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoFocus
                      autoComplete="current-password"
                      placeholder="Sua senha"
                      style={{ paddingRight: 46 }}
                    />
                    <button
                      type="button"
                      className="lg-eye"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              )}

              <button type="submit" className="lg-go" disabled={busy}>
                {busy ? (
                  <>
                    <Loader2 size={16} className="lg-spin" /> Aguarde…
                  </>
                ) : (
                  <>
                    {step === "email" ? "Continuar" : "Entrar"}{" "}
                    <ArrowRight size={16} className="arrow" />
                  </>
                )}
              </button>
            </form>

            <p className="lg-help">
              Esqueceu a senha ou ainda não tem acesso? Fale com o administrador do {APP_NAME}.
            </p>
          </main>
        </div>

        <footer className="lg-foot">
          <span>
            <Lock size={13} /> Acesso restrito e monitorado
          </span>
          <Link to="/trust">Confiança e segurança</Link>
        </footer>
      </section>

      {/* ── Vitrine da marca ──────────────────────────────────────────────── */}
      <ProductShowcase />
    </div>
  );
}
