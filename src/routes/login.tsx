import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useState, useEffect } from "react";
import { useAuth, useSignOutReason } from "@/lib/auth-context";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSsoPublicConfig, startAzureLogin } from "@/lib/sso.functions";
import { isSafeRedirectPath } from "@/lib/safe-redirect";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
    sso_error: typeof s.sso_error === "string" ? s.sso_error : undefined,
  }),
});

const Robot = React.memo(function Robot() {
  return (
    <div className="robot-float relative flex flex-col items-center">
      {/* Security badge on forehead */}
      <div
        style={{
          position: "absolute",
          top: 14,
          zIndex: 10,
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: "radial-gradient(circle at 38% 32%, #60a5fa, #1d4ed8 60%, #1e3a8a)",
          boxShadow: "0 0 12px 4px rgba(59,130,246,0.7), inset 0 2px 4px rgba(255,255,255,0.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          animation: "badgePulse 2.5s ease-in-out infinite",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M12 2L4 6v5c0 5.5 3.8 10.7 8 12 4.2-1.3 8-6.5 8-12V6L12 2Z" fill="white" fillOpacity="0.9" />
        </svg>
      </div>

      {/* HEAD */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: 200,
          height: 165,
          borderRadius: "50%",
          background:
            "radial-gradient(ellipse at 36% 26%, #d0d8e4 0%, #9aa8bc 28%, #6e7e94 55%, #4a5568 80%, #2d3748 100%)",
          boxShadow:
            "inset -8px -10px 24px rgba(0,0,0,0.2), inset 6px 8px 18px rgba(255,255,255,0.45), 0 16px 40px rgba(0,0,0,0.25)",
        }}
      >
        {/* Forehead shine */}
        <div
          style={{
            position: "absolute",
            top: 16,
            left: 32,
            width: 118,
            height: 46,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(255,255,255,0.5) 0%, transparent 70%)",
            transform: "rotate(-10deg)",
            pointerEvents: "none",
          }}
        />

        {/* Visor */}
        <div
          style={{
            width: 158,
            height: 106,
            borderRadius: "46% 46% 44% 44%",
            background: "radial-gradient(ellipse at 44% 34%, #1ab8c0, #065060 60%, #021a1a)",
            boxShadow: "inset 0 4px 12px rgba(0,210,220,0.2), 0 0 0 3px rgba(255,255,255,0.22)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* Visor top shine */}
          <div
            style={{
              position: "absolute",
              top: 7,
              left: 12,
              width: 128,
              height: 36,
              borderRadius: "50%",
              background: "radial-gradient(ellipse, rgba(255,255,255,0.16) 0%, transparent 70%)",
              pointerEvents: "none",
            }}
          />
          {/* Scan line */}
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              height: 2,
              background: "linear-gradient(to right, transparent, rgba(0,220,240,0.5), transparent)",
              opacity: 0,
            }}
          />

          {/* EYES */}
          <div style={{ display: "flex", justifyContent: "center", gap: 26, paddingTop: 26 }}>
            {[0, 1].map((i) => (
              <div
                key={i}
                className="eye-glow"
                style={{
                  width: 44,
                  height: 38,
                  borderRadius: "50%",
                  background:
                    "radial-gradient(ellipse at 38% 30%, #b4f8ff 0%, #40d8f0 28%, #00a8cc 55%, #006a94 85%, #002d45 100%)",
                  position: "relative",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    top: 6,
                    left: 9,
                    width: 13,
                    height: 9,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.72)",
                    transform: "rotate(-20deg)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    top: 19,
                    left: 7,
                    width: 5,
                    height: 4,
                    borderRadius: "50%",
                    background: "rgba(255,255,255,0.32)",
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Ears */}
        {[-1, 1].map((side) => (
          <div
            key={side}
            style={{
              position: "absolute",
              [side < 0 ? "left" : "right"]: -12,
              top: "50%",
              transform: "translateY(-50%)",
              width: 18,
              height: 34,
              borderRadius: "50%",
              background:
                side < 0
                  ? "radial-gradient(ellipse at 65% 28%, #c8d4e0, #7a8a9c 50%, #4a5568)"
                  : "radial-gradient(ellipse at 35% 28%, #c8d4e0, #7a8a9c 50%, #4a5568)",
              boxShadow: "inset -2px -3px 6px rgba(0,0,0,0.2), inset 1px 2px 5px rgba(255,255,255,0.5)",
            }}
          >
            {/* Ear detail dot */}
            <div
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                transform: "translate(-50%,-50%)",
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: "rgba(59,130,246,0.7)",
                boxShadow: "0 0 4px rgba(59,130,246,0.8)",
              }}
            />
          </div>
        ))}
      </div>

      {/* NECK */}
      <div
        style={{
          width: 42,
          height: 20,
          marginTop: -3,
          background: "linear-gradient(to bottom, #8a9aac, #5a6a7c)",
          clipPath: "polygon(10% 0%, 90% 0%, 100% 100%, 0% 100%)",
          boxShadow: "inset -2px 0 5px rgba(0,0,0,0.2)",
        }}
      >
        <div style={{ margin: "3px 8px", display: "flex", flexDirection: "column", gap: 3 }}>
          {[0, 1].map((i) => (
            <div key={i} style={{ height: 2, borderRadius: 1, background: "rgba(0,0,0,0.2)" }} />
          ))}
        </div>
      </div>

      {/* BODY */}
      <div
        className="relative flex items-center justify-center"
        style={{
          width: 165,
          height: 144,
          borderRadius: "40% 40% 38% 38% / 36% 36% 42% 42%",
          background:
            "radial-gradient(ellipse at 35% 24%, #d0d8e4 0%, #9aa8bc 22%, #6e7e94 52%, #4a5568 78%, #2d3748 100%)",
          boxShadow:
            "inset -10px -14px 28px rgba(0,0,0,0.22), inset 8px 10px 22px rgba(255,255,255,0.6), 0 16px 50px rgba(0,0,0,0.28)",
          marginTop: 2,
        }}
      >
        {/* Body shine */}
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 22,
            width: 96,
            height: 38,
            borderRadius: "50%",
            background: "radial-gradient(ellipse, rgba(255,255,255,0.42) 0%, transparent 70%)",
            transform: "rotate(-8deg)",
            pointerEvents: "none",
          }}
        />

        {/* Chest panel */}
        <div
          style={{
            position: "absolute",
            bottom: 22,
            left: "50%",
            transform: "translateX(-50%)",
            width: 80,
            height: 22,
            borderRadius: 6,
            background: "rgba(0,20,40,0.3)",
            border: "1px solid rgba(59,130,246,0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: ["#22c55e", "#3b82f6", "#f59e0b"][i],
                boxShadow: `0 0 6px ${["rgba(34,197,94,0.8)", "rgba(59,130,246,0.8)", "rgba(245,158,11,0.8)"][i]}`,
                animation: `ledPulse 2s ease-in-out ${i * 0.4}s infinite`,
              }}
            />
          ))}
        </div>

        {/* Infinity — curvas suaves estilo teal */}
        <svg width="100" height="44" viewBox="0 0 100 44" fill="none" style={{ marginBottom: 18 }}>
          <path
            d="M50 22 C50 22 42 8 30 8 C18 8 10 15 10 22 C10 29 18 36 30 36 C42 36 50 22 50 22 C50 22 58 8 70 8 C82 8 90 15 90 22 C90 29 82 36 70 36 C58 36 50 22 50 22 Z"
            stroke="rgba(0,180,170,0.3)"
            strokeWidth="8"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M50 22 C50 22 42 8 30 8 C18 8 10 15 10 22 C10 29 18 36 30 36 C42 36 50 22 50 22 C50 22 58 8 70 8 C82 8 90 15 90 22 C90 29 82 36 70 36 C58 36 50 22 50 22 Z"
            stroke="#0ab8b0"
            strokeWidth="3.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M50 22 C50 22 42 8 30 8 C18 8 10 15 10 22 C10 29 18 36 30 36 C42 36 50 22 50 22 C50 22 58 8 70 8 C82 8 90 15 90 22 C90 29 82 36 70 36 C58 36 50 22 50 22 Z"
            stroke="rgba(160,240,235,0.5)"
            strokeWidth="1.2"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* LEFT ARM */}
      <div style={{ position: "absolute", left: -38, top: 192 }}>
        <div
          style={{
            width: 30,
            height: 120,
            borderRadius: "40% 40% 45% 45%",
            background: "radial-gradient(ellipse at 62% 18%, #c8d4e0, #6a7a8c 55%, #3a4a5c 100%)",
            boxShadow: "inset -4px -6px 14px rgba(0,0,0,0.28), inset 3px 4px 10px rgba(255,255,255,0.4)",
            transform: "rotate(10deg)",
          }}
        />
      </div>

      {/* RIGHT ARM */}
      <div style={{ position: "absolute", right: -38, top: 192 }}>
        <div
          style={{
            width: 30,
            height: 120,
            borderRadius: "40% 40% 45% 45%",
            background: "radial-gradient(ellipse at 38% 18%, #c8d4e0, #6a7a8c 55%, #3a4a5c 100%)",
            boxShadow: "inset 4px -6px 14px rgba(0,0,0,0.28), inset -3px 4px 10px rgba(255,255,255,0.4)",
            transform: "rotate(-10deg)",
          }}
        />
      </div>

      {/* Ground shadow */}
      <div
        style={{
          width: 130,
          height: 14,
          marginTop: 8,
          borderRadius: "50%",
          background: "rgba(0,0,0,0.16)",
          filter: "blur(7px)",
        }}
      />

      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-13px)} }
        @keyframes eyePulse {
          0%,100%{box-shadow:0 0 16px 6px rgba(0,200,230,0.7),inset 0 -4px 10px rgba(0,0,0,0.3)}
          50%{box-shadow:0 0 24px 10px rgba(0,220,250,0.9),inset 0 -4px 10px rgba(0,0,0,0.3)}
        }
        @keyframes badgePulse { 0%,100%{opacity:0.85} 50%{opacity:1} }
        @keyframes ledPulse { 0%,100%{opacity:0.7} 50%{opacity:1} }
        .robot-float { will-change: transform; animation: float 4s ease-in-out infinite; }
        .eye-glow { will-change: box-shadow; animation: eyePulse 3s ease-in-out infinite; }

      `}</style>
    </div>
  );
});

function LoginPage() {
  const { user, signIn, loading } = useAuth();
  const navigate = useNavigate();
  useSignOutReason();
  const search = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState<"email" | "password">("email");
  const ssoFn = useServerFn(getSsoPublicConfig);
  const startSso = useServerFn(startAzureLogin);
  const sso = useQuery({
    queryKey: ["sso-public-config"],
    queryFn: () => ssoFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

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

  return (
    <div className="min-h-screen flex bg-background overflow-hidden relative">
      <div
        className="absolute inset-0 opacity-[0.022] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(oklch(0.78 0.13 220) 1px,transparent 1px),linear-gradient(90deg,oklch(0.78 0.13 220) 1px,transparent 1px)",
          backgroundSize: "52px 52px",
        }}
      />
      <div
        className="absolute pointer-events-none"
        style={{
          top: "5%",
          left: "5%",
          width: 480,
          height: 480,
          borderRadius: "50%",
          background: "oklch(0.78 0.13 220)",
          opacity: 0.055,
          filter: "blur(130px)",
        }}
      />

      {/* ── ROBOT left, 50% ── */}
      <div
        className={`hidden lg:flex items-center justify-end pr-12 transition-all duration-700 delay-150 ${mounted ? "opacity-100" : "opacity-0"}`}
        style={{ width: "50%", minHeight: "100vh", position: "relative" }}
      >
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(155deg, oklch(0.23 0.04 250 / 0.65) 0%, oklch(0.18 0.03 250 / 0.2) 100%)",
            borderRight: "1px solid oklch(0.32 0.035 248 / 0.3)",
          }}
        />
        <div className="relative z-10 flex flex-col items-center gap-5">
          <Robot />
          {/* Logo Bernoulli */}
          <div className="flex flex-col items-center gap-1 mt-2">
            <div className="flex items-center gap-3">
              {/* Símbolo infinito */}
              <svg width="52" height="22" viewBox="0 0 100 44" fill="none" style={{}}>
                <path
                  d="M50 22 C50 22 42 8 30 8 C18 8 10 15 10 22 C10 29 18 36 30 36 C42 36 50 22 50 22 C50 22 58 8 70 8 C82 8 90 15 90 22 C90 29 82 36 70 36 C58 36 50 22 50 22 Z"
                  stroke="white"
                  strokeWidth="4"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <div className="text-foreground font-bold" style={{ fontSize: 20, letterSpacing: "-0.3px" }}>
                Bernoulli
              </div>
            </div>
            <div className="text-muted-foreground font-mono" style={{ fontSize: 10, letterSpacing: "0.15em" }}>
              Educação
            </div>
          </div>
        </div>
      </div>

      {/* ── FORM right, 50% ── */}
      <div
        className={`flex-1 flex items-center justify-start pl-12 lg:pl-16 z-10 transition-all duration-700 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-5"}`}
        style={{ maxWidth: "50%" }}
      >
        <div className="w-full max-w-[320px]">
          <div className="flex items-center gap-4 mb-9">
            {/* Escudo com ∞ dentro */}
            <div
              className="shrink-0 flex items-center justify-center"
              style={{
                width: 48,
                height: 54,
                position: "relative",
              }}
            >
              <svg width="48" height="54" viewBox="0 0 48 54" fill="none" style={{}}>
                {/* Escudo */}
                <path d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z" fill="oklch(0.78 0.13 220)" />
                {/* Brilho topo */}
                <path d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z" fill="url(#shieldShine)" />
                {/* Borda */}
                <path
                  d="M24 2L4 10v14c0 13 8.5 23.5 20 27 11.5-3.5 20-14 20-27V10L24 2Z"
                  stroke="oklch(0.88 0.13 220)"
                  strokeWidth="0.8"
                  fill="none"
                />
                {/* Símbolo ∞ dentro do escudo */}
                <path
                  d="M24 27 C24 27 20 21 15 21 C10 21 7 23.5 7 27 C7 30.5 10 33 15 33 C20 33 24 27 24 27 C24 27 28 21 33 21 C38 21 41 23.5 41 27 C41 30.5 38 33 33 33 C28 33 24 27 24 27 Z"
                  stroke="oklch(0.16 0.03 250)"
                  strokeWidth="2.8"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeOpacity="0.9"
                />
                <defs>
                  <linearGradient id="shieldShine" x1="12" y1="2" x2="12" y2="28" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="white" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="white" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <div>
              <div
                className="font-bold text-foreground"
                style={{ fontSize: 26, letterSpacing: "-0.6px", lineHeight: 1.05 }}
              >
                B-Security
              </div>
              <div
                className="font-mono uppercase text-muted-foreground"
                style={{ fontSize: 10, letterSpacing: "0.13em" }}
              >
                Security Suite
              </div>
            </div>
          </div>

          <h1 className="text-[1.9rem] font-bold text-foreground leading-tight tracking-tight mb-1">
            Acesso ao painel
          </h1>
          <p className="text-sm text-muted-foreground mb-7">Segurança corporativa centralizada</p>

          <form onSubmit={step === "email" ? onContinue : onSubmit} className="space-y-4">
            <div>
              <label className="block text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                required
                readOnly={step === "password"}
                placeholder="seu@email.com"
                className="w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-all duration-200"
                style={{
                  background: "oklch(0.22 0.035 250)",
                  border: `1px solid ${focused === "email" ? "oklch(0.78 0.13 220)" : "oklch(0.32 0.035 248)"}`,
                  boxShadow: focused === "email" ? "0 0 0 3px oklch(0.78 0.13 220 / 0.12)" : "none",
                  opacity: step === "password" ? 0.85 : 1,
                }}
              />
            </div>

            {step === "password" && (
              <div>
                <label className="block text-[9px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">
                  Senha
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocused("password")}
                  onBlur={() => setFocused(null)}
                  required
                  autoFocus
                  placeholder="••••••••"
                  className="w-full rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-all duration-200"
                  style={{
                    background: "oklch(0.22 0.035 250)",
                    border: `1px solid ${focused === "password" ? "oklch(0.78 0.13 220)" : "oklch(0.32 0.035 248)"}`,
                    boxShadow: focused === "password" ? "0 0 0 3px oklch(0.78 0.13 220 / 0.12)" : "none",
                  }}
                />
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-3 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-50 mt-1"
              style={{ background: "oklch(0.78 0.13 220)", color: "oklch(0.16 0.03 250)" }}
              onMouseEnter={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
              onMouseLeave={(e) => (e.currentTarget.style.filter = "brightness(1)")}
            >
              {busy ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
                    <path d="M12 2a10 10 0 019 5.7" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                  Aguarde...
                </span>
              ) : step === "email" ? (
                "Continuar"
              ) : (
                "Entrar"
              )}
            </button>

            {step === "email" && sso.data?.oauthEnabled && (
              <>
                <div className="flex items-center gap-3 my-1">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">ou</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <button
                  type="button"
                  onClick={onSsoButton}
                  disabled={busy}
                  className="w-full py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 flex items-center justify-center gap-2.5 border"
                  style={{
                    background: "oklch(0.22 0.035 250)",
                    borderColor: "oklch(0.32 0.035 248)",
                    color: "oklch(0.96 0.005 250)",
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
                    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                  </svg>
                  Entrar com Microsoft
                </button>
              </>
            )}

            {step === "password" && (
              <button
                type="button"
                onClick={() => {
                  setStep("email");
                  setPassword("");
                }}
                className="w-full text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
              >
                ← usar outro e-mail
              </button>
            )}
          </form>

          <div className="mt-4 text-center">
            <button
              type="button"
              disabled
              title="Redefinição de senha disponível apenas via administrador do sistema."
              className="text-[11px] font-mono text-white/25 cursor-not-allowed"
            >
              Esqueci minha senha
            </button>
          </div>
          <p className="mt-7 text-[9px] font-mono text-white/60 uppercase tracking-wider text-center">
            Suite de Segurança exclusiva do Bernoulli Educação
          </p>
        </div>
      </div>
    </div>
  );
}
