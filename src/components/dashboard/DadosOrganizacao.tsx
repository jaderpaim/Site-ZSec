import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getOrganizacao, upsertOrganizacao } from "@/lib/organizacao.functions";
import { useAuth } from "@/lib/auth-context";
import { ModuleLoading } from "@/components/layout/ModuleLoading";

// Mesmo vocabulário visual da tela de SMTP (prefixo "do-" em vez de "sm-").
const CSS = `
  .do-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; max-width:760px; }
  .do-root * { box-sizing:border-box; }
  .do-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .do-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .do-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .do-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .do-card-h { display:flex; gap:12px; align-items:center; padding:14px 18px; border-bottom:1px solid var(--v2-line); flex-wrap:wrap; }
  .do-card-h b { display:block; font-size:14px; font-weight:600; }
  .do-card-h small { display:block; font-size:12.5px; color:var(--v2-fg-3); }
  .do-card-h .r { margin-left:auto; }
  .do-card-b { display:grid; gap:14px; padding:16px 18px; }
  .do-card-f { display:flex; justify-content:flex-end; gap:8px; padding:12px 18px; border-top:1px solid var(--v2-line); }
  .do-g2 { display:grid; grid-template-columns:2fr 1fr; gap:12px; }
  @media (max-width: 600px) { .do-g2 { grid-template-columns:1fr; } }
  .do-field { display:grid; gap:6px; font-size:12.5px; font-weight:500; color:var(--v2-fg-2); min-width:0; }
  .do-field small { font-size:12px; font-weight:400; color:var(--v2-fg-3); line-height:1.5; }
  .do-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; min-width:0; }
  .do-input.mono { font-family:var(--font-data); font-size:12.5px; }
  .do-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .do-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-accent); background:var(--v2-accent); color:var(--v2-accent-ink); }
  .do-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .do-btn:hover:not(:disabled) { filter:brightness(1.08); }
  .do-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .do-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .do-preview { padding:12px 14px; border:1px dashed var(--v2-line-strong); border-radius:8px; font-size:12.5px; color:var(--v2-fg-2); line-height:1.7; }
  .do-preview b { color:var(--v2-fg); font-weight:600; }
  .do-empty { padding:20px 18px; color:var(--v2-fg-3); font-size:13px; }
`;

export function DadosOrganizacaoDashboard() {
  const { role } = useAuth();
  const qc = useQueryClient();
  const get = useServerFn(getOrganizacao);
  const upsert = useServerFn(upsertOrganizacao);
  const isAdmin = role === "admin" || role === "super_admin";

  const q = useQuery({ queryKey: ["organizacao"], queryFn: () => get(), enabled: isAdmin });

  const [nome, setNome] = React.useState("");
  const [nomeCurto, setNomeCurto] = React.useState("");
  const [dominio, setDominio] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const o = q.data;
    if (o?.configurada) {
      setNome(o.nome);
      setNomeCurto(o.nome_curto ?? "");
      setDominio(o.dominio_corporativo ?? "");
    }
  }, [q.data]);

  if (!isAdmin) {
    return (
      <div className="do-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="do-card">
          <div className="do-empty">
            Apenas administradores podem visualizar ou editar esta página.
          </div>
        </div>
      </div>
    );
  }
  if (q.isLoading) return <ModuleLoading />;

  const configurada = !!q.data?.configurada;
  const rotulo = nomeCurto.trim() || nome.trim() || "Sua organização";

  async function save() {
    setSaving(true);
    try {
      await upsert({
        data: { nome, nome_curto: nomeCurto || null, dominio_corporativo: dominio || null },
      });
      toast.success("Dados da organização salvos");
      qc.invalidateQueries({ queryKey: ["organizacao"] });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="do-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div>
        <h1 className="do-ph-title">Dados da Organização</h1>
        <p className="do-ph-sub">
          Nome da empresa que usa esta instância, exibido no Painel Executivo, no Benchmark e nos
          rankings de Maturidade.
        </p>
      </div>

      <section className="do-card">
        <div className="do-card-h">
          <span>
            <b>Identificação</b>
            <small>Vale para todos os usuários desta instância</small>
          </span>
          <span className="r">
            <span
              className="do-pill"
              style={
                { "--c": configurada ? "var(--v2-ok)" : "var(--v2-med)" } as React.CSSProperties
              }
            >
              {configurada ? "Configurada" : "Não configurada"}
            </span>
          </span>
        </div>

        <div className="do-card-b">
          <div className="do-g2">
            <label className="do-field">
              Nome da organização
              <input
                className="do-input"
                value={nome}
                maxLength={120}
                placeholder="Ex.: Empresa Exemplo S.A."
                onChange={(e) => setNome(e.target.value)}
              />
            </label>
            <label className="do-field">
              Nome curto
              <input
                className="do-input"
                value={nomeCurto}
                maxLength={40}
                placeholder="Ex.: Exemplo"
                onChange={(e) => setNomeCurto(e.target.value)}
              />
              <small>Usado em gráficos e legendas. Se vazio, usa o nome completo.</small>
            </label>
          </div>

          <label className="do-field">
            Domínio corporativo
            <input
              className="do-input mono"
              value={dominio}
              maxLength={253}
              placeholder="empresa.com.br"
              onChange={(e) => setDominio(e.target.value)}
            />
            <small>Domínio principal dos e-mails e sistemas da organização.</small>
          </label>

          <div className="do-preview">
            Prévia: <b>{nome.trim() || "Sua organização"}</b> · Segurança da Informação — nos
            gráficos aparece como <b>{rotulo}</b>.
          </div>
        </div>

        <div className="do-card-f">
          <button className="do-btn" onClick={save} disabled={saving || !nome.trim()}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </section>
    </div>
  );
}
