import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldHalf, ArrowLeft, Mail, Lock } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

type Step = "request" | "reset";

function ResetPasswordPage() {
  const navigate = useNavigate();

  // Detecta se há token de recuperação na URL (hash ou query param)
  const hasRecoveryToken =
    typeof window !== "undefined" &&
    (window.location.hash.includes("type=recovery") || window.location.search.includes("type=recovery"));

  const [step, setStep] = useState<Step>(hasRecoveryToken ? "reset" : "request");

  // ── Tela 1: Solicitar e-mail ──────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onRequestSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return toast.error("Informe seu e-mail.");
    setSending(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    setSent(true);
    toast.success("E-mail enviado! Verifique sua caixa de entrada.");
  }

  // ── Tela 2: Redefinir senha ────────────────────────────────────────────────
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step !== "reset") return;
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, [step]);

  async function onResetSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 6) return toast.error("A senha deve ter ao menos 6 caracteres.");
    if (password !== confirm) return toast.error("As senhas não coincidem.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Senha alterada com sucesso!");
    navigate({ to: "/app/$module", params: { module: "vulnerabilidades" } });
  }

  // ── Layout compartilhado ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8 justify-center">
          <div className="size-10 rounded-md bg-primary flex items-center justify-center">
            <ShieldHalf className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold text-lg text-foreground tracking-tight">B-Security</div>
            <div className="text-mono-xs text-muted-foreground">
              {step === "request" ? "Recuperar senha" : "Redefinir senha"}
            </div>
          </div>
        </div>

        <div className="bg-surface border border-border rounded-lg p-6">
          {/* ── TELA 1: Solicitar alteração ── */}
          {step === "request" && (
            <>
              {!sent ? (
                <form onSubmit={onRequestSubmit} className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">
                      Informe seu e-mail cadastrado. Enviaremos um link para você redefinir sua senha.
                    </p>
                    <label className="block text-mono-xs text-muted-foreground mb-1.5">E-mail</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        placeholder="seu@email.com"
                        className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:brightness-110 disabled:opacity-50"
                  >
                    {sending ? "Enviando..." : "Solicitar alteração"}
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/login", search: { redirect: undefined, sso_error: undefined } })}
                    className="w-full flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="size-4" />
                    Voltar ao login
                  </button>
                </form>
              ) : (
                /* Estado: e-mail enviado */
                <div className="text-center space-y-4 py-2">
                  <div className="size-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                    <Mail className="size-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground mb-1">E-mail enviado!</p>
                    <p className="text-sm text-muted-foreground">
                      Verifique sua caixa de entrada e clique no link para redefinir sua senha.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSent(false);
                      setEmail("");
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Reenviar e-mail
                  </button>
                </div>
              )}
            </>
          )}

          {/* ── TELA 2: Redefinir senha (após clicar no link do e-mail) ── */}
          {step === "reset" && (
            <>
              {!ready ? (
                <div className="text-sm text-muted-foreground text-center py-4">Validando link de recuperação...</div>
              ) : (
                <form onSubmit={onResetSubmit} className="space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-4">Defina sua nova senha abaixo.</p>
                    <label className="block text-mono-xs text-muted-foreground mb-1.5">Nova senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-mono-xs text-muted-foreground mb-1.5">Confirmar senha</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <input
                        type="password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        className="w-full bg-background border border-border rounded-md pl-9 pr-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full py-2.5 bg-primary text-primary-foreground rounded-md text-sm font-semibold hover:brightness-110 disabled:opacity-50"
                  >
                    {busy ? "Salvando..." : "Alterar senha"}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
