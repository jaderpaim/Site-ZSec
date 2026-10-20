import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import {
  getLoadBalancingConfig,
  getManagedRules,
  updateLbPool,
  updateManagedRule,
  type LbPool,
  type ManagedDeployment,
} from "@/lib/cloudflare.config.functions";

const CSS = `
.cv { display:flex; flex-direction:column; gap:16px; font-family:var(--font-ui); color:var(--v2-fg); min-width:0; }
.cv-sh h2 { margin:0; font-size:18px; font-weight:600; } .cv-sh p { margin:2px 0 0; font-size:13px; color:var(--v2-fg-3); }
.cv-cards { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:12px; }
.cv-card { border:1px solid var(--v2-line); border-radius:12px; padding:14px 16px; background:var(--v2-surface); display:grid; gap:8px; text-align:left; cursor:pointer; font:inherit; color:inherit; }
.cv-card:hover { border-color:var(--v2-line-strong); }
.cv-card-h { display:flex; justify-content:space-between; gap:10px; align-items:center; }
.cv-card-h b { font-size:14px; font-weight:600; }
.cv-card small { font-size:12.5px; color:var(--v2-fg-3); line-height:1.5; }
.cv-row { display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
.cv-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
.cv-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
.cv-tag { display:inline-flex; align-items:center; height:22px; padding:0 7px; border-radius:5px; font:500 12px var(--font-data); background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); }
.cv-empty { padding:26px 16px; text-align:center; color:var(--v2-fg-3); border:1px dashed var(--v2-line-strong); border-radius:12px; font-size:13px; }
.cv-box { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
.cv-box-h { display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--v2-line); flex-wrap:wrap; }
.cv-box-h b { font:600 14px var(--font-data); } .cv-box-h small { color:var(--v2-fg-3); font-size:12.5px; } .cv-box-h .r { margin-left:auto; display:flex; gap:6px; align-items:center; }
.cv-origin { display:grid; grid-template-columns:10px minmax(0,1fr) auto auto auto; gap:10px; align-items:center; padding:9px 14px; border-top:1px solid var(--v2-line); font-size:13px; }
.cv-origin:first-of-type { border-top:0; }
.cv-dot { width:8px; height:8px; border-radius:50%; background:var(--c); }
.cv-mono { font:12.5px var(--font-data); color:var(--v2-fg-3); }
.cv-list { display:grid; border:1px solid var(--v2-line); border-radius:10px; overflow:hidden; }
.cv-li { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:10px; align-items:center; padding:9px 12px; border-top:1px solid var(--v2-line); font-size:13px; }
.cv-li:first-child { border-top:0; }
.cv-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 80px 44px 32px; gap:8px; align-items:center; }
.cv-in { height:34px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); padding:0 10px; font:13px var(--font-ui); width:100%; min-width:0; }
.cv-in.m { font-family:var(--font-data); font-size:12.5px; }
.cv-lbl { font-size:12px; color:var(--v2-fg-3); font-weight:500; }
.cv-sel { height:34px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); padding:0 8px; font:13px var(--font-ui); }
`;

const ACTION_LABEL: Record<string, string> = {
  block: "Block",
  managed_challenge: "Managed Challenge",
  js_challenge: "JS Challenge",
  challenge: "Interactive Challenge",
  log: "Log",
};

// ══ Managed rules ════════════════════════════════════════════════════════════
export function ManagedRulesView({ zoneId }: { zoneId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getManagedRules);
  const upd = useServerFn(updateManagedRule);
  const q = useQuery({ queryKey: ["cf-managed", zoneId], queryFn: () => fn({ data: { zoneId } }) });
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const d = q.data;
  const deployments = d?.ok ? d.deployments : [];
  const open = deployments.find((x) => x.ruleId === openId) ?? null;

  async function save(
    dep: ManagedDeployment,
    patch: { enabled?: boolean; defaultAction?: string | null; removeOverrideIds?: string[] },
  ) {
    if (!d?.ok || !d.entrypointId) return false;
    setBusy(dep.ruleId);
    try {
      const res = await upd({
        data: {
          zoneId,
          entrypointId: d.entrypointId,
          ruleId: dep.ruleId,
          ...patch,
          defaultAction: patch.defaultAction as
            | "block"
            | "managed_challenge"
            | "js_challenge"
            | "challenge"
            | "log"
            | null
            | undefined,
        },
      });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success("Managed ruleset atualizado.");
      qc.invalidateQueries({ queryKey: ["cf-managed", zoneId] });
      qc.invalidateQueries({ queryKey: ["cf-zone-changes"] });
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="cv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cv-sh">
        <h2>Managed rules</h2>
        <p>
          Conjuntos de regras mantidos pela Cloudflare contra vulnerabilidades conhecidas. Clique
          para ajustar ação e exceções.
        </p>
      </div>
      {q.isLoading ? (
        <div className="cv-empty">Carregando…</div>
      ) : d && !d.ok ? (
        <div className="cv-empty">{d.error}</div>
      ) : deployments.length === 0 ? (
        <div className="cv-empty">
          Nenhum managed ruleset implantado nesta zona (pode depender do plano da Cloudflare).
        </div>
      ) : (
        <div className="cv-cards">
          {deployments.map((m) => (
            <div
              key={m.ruleId}
              className="cv-card"
              role="button"
              tabIndex={0}
              onClick={() => setOpenId(m.ruleId)}
              onKeyDown={(e) => e.key === "Enter" && setOpenId(m.ruleId)}
            >
              <div className="cv-card-h">
                <b>{m.name}</b>
                <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                  {busy === m.ruleId ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Switch
                      checked={m.enabled}
                      onCheckedChange={(v) => save(m, { enabled: v })}
                      aria-label={`Ativar ${m.name}`}
                    />
                  )}
                </span>
              </div>
              {m.description && <small>{m.description}</small>}
              <div className="cv-row">
                <span
                  className="cv-pill"
                  style={
                    { "--c": m.enabled ? "var(--v2-ok)" : "var(--v2-fg-3)" } as React.CSSProperties
                  }
                >
                  {m.enabled ? "Ativo" : "Desativado"}
                </span>
                <span className="cv-tag">
                  Ação:{" "}
                  {m.defaultAction ? (ACTION_LABEL[m.defaultAction] ?? m.defaultAction) : "padrão"}
                </span>
              </div>
              <small>
                {m.hits24h === null
                  ? "—"
                  : `${m.hits24h.toLocaleString("pt-BR")} mitigações em 24 h`}{" "}
                · {m.overrides.length} exceç
                {m.overrides.length === 1 ? "ão" : "ões"}
                {m.categoryOverrides ? ` · ${m.categoryOverrides} ajuste(s) por categoria` : ""}
              </small>
            </div>
          ))}
        </div>
      )}
      {d?.ok && d.available.length > 0 && (
        <p style={{ margin: 0, fontSize: 12.5, color: "var(--v2-fg-3)" }}>
          Disponíveis e não implantados: {d.available.map((a) => a.name).join(", ")}. A implantação
          é feita no painel da Cloudflare.
        </p>
      )}
      <ManagedSheet
        dep={open}
        busy={!!open && busy === open.ruleId}
        onClose={() => setOpenId(null)}
        onSave={(p) => (open ? save(open, p) : Promise.resolve(false))}
      />
    </div>
  );
}

function ManagedSheet({
  dep,
  busy,
  onClose,
  onSave,
}: {
  dep: ManagedDeployment | null;
  busy: boolean;
  onClose: () => void;
  onSave: (p: { defaultAction?: string | null; removeOverrideIds?: string[] }) => Promise<boolean>;
}) {
  const [action, setAction] = React.useState<string>("");
  const [remove, setRemove] = React.useState<string[]>([]);
  React.useEffect(() => {
    setAction(dep?.defaultAction ?? "");
    setRemove([]);
  }, [dep?.ruleId, dep?.defaultAction]);
  const dirty = !!dep && ((dep.defaultAction ?? "") !== action || remove.length > 0);
  return (
    <DetailSheet
      open={!!dep}
      onOpenChange={(o) => !o && onClose()}
      eyebrow="Managed ruleset"
      title={dep?.name ?? ""}
      footer={
        <>
          <button className="cf-btn" style={{ marginRight: "auto" }} onClick={onClose}>
            Cancelar
          </button>
          <button
            className="cf-btn primary"
            disabled={!dirty || busy}
            onClick={async () => {
              if (!dep) return;
              const ok = await onSave({
                ...((dep.defaultAction ?? "") !== action ? { defaultAction: action || null } : {}),
                ...(remove.length ? { removeOverrideIds: remove } : {}),
              });
              if (ok) onClose();
            }}
          >
            {busy && <Loader2 size={13} className="animate-spin" />} Salvar
          </button>
        </>
      }
    >
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {dep && (
        <>
          {dep.description && (
            <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-2)" }}>{dep.description}</p>
          )}
          <DetailSection title="Ação padrão">
            <select
              className="cv-sel"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              aria-label="Ação padrão"
            >
              <option value="">Padrão de cada regra (recomendado pela Cloudflare)</option>
              {Object.entries(ACTION_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l} em todas as regras
                </option>
              ))}
            </select>
          </DetailSection>
          <DetailSection title={`Exceções (${dep.overrides.length})`}>
            {dep.overrides.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>
                Nenhuma regra com comportamento alterado.
              </p>
            ) : (
              <div className="cv-list">
                {dep.overrides.map((o) => {
                  const removed = remove.includes(o.ruleId);
                  return (
                    <div key={o.ruleId} className="cv-li" style={{ opacity: removed ? 0.45 : 1 }}>
                      <span
                        className="cv-mono"
                        style={{
                          color: "var(--v2-fg)",
                          textDecoration: removed ? "line-through" : undefined,
                        }}
                      >
                        {o.ruleId}
                      </span>
                      <span className="cv-tag">
                        {o.enabled === false
                          ? "Desativada"
                          : o.action
                            ? (ACTION_LABEL[o.action] ?? o.action)
                            : "Ativa"}
                      </span>
                      <button
                        className="cf-btn sm"
                        style={{ padding: "0 8px" }}
                        aria-label={removed ? "Manter exceção" : "Remover exceção"}
                        title={removed ? "Manter" : "Remover"}
                        onClick={() =>
                          setRemove((r) =>
                            removed ? r.filter((x) => x !== o.ruleId) : [...r, o.ruleId],
                          )
                        }
                      >
                        {removed ? <X size={12} /> : <Trash2 size={12} />}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <p style={{ margin: "8px 0 0", fontSize: 12, color: "var(--v2-fg-3)" }}>
              Novas exceções por regra são criadas no painel da Cloudflare (exigem escolher a regra
              no catálogo do ruleset).
            </p>
          </DetailSection>
          <DetailSection title="Detalhes">
            <DetailList
              items={[
                ["Ruleset", dep.rulesetId, true],
                [
                  "Vale para",
                  dep.expression === "true" ? "Todas as requisições" : dep.expression,
                  dep.expression !== "true",
                ],
                [
                  "Mitigações 24 h",
                  dep.hits24h === null ? "—" : dep.hits24h.toLocaleString("pt-BR"),
                ],
              ]}
            />
          </DetailSection>
        </>
      )}
    </DetailSheet>
  );
}

// ══ Load Balancing ═══════════════════════════════════════════════════════════
const STEERING: Record<string, string> = {
  off: "Desligado (primeiro pool saudável)",
  geo: "Geográfico",
  random: "Aleatório (por peso)",
  dynamic_latency: "Menor latência",
  proximity: "Proximidade",
  least_outstanding_requests: "Menos requisições pendentes",
  least_connections: "Menos conexões",
};

export function LoadBalancingConfigView({ zoneId }: { zoneId: string }) {
  const qc = useQueryClient();
  const fn = useServerFn(getLoadBalancingConfig);
  const upd = useServerFn(updateLbPool);
  const q = useQuery({
    queryKey: ["cf-lb-config", zoneId],
    queryFn: () => fn({ data: { zoneId } }),
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState<LbPool | null>(null);
  const d = q.data;

  async function savePool(
    pool: LbPool,
    patch: {
      enabled?: boolean;
      origins?: Array<{ name: string; address: string; enabled: boolean; weight: number }>;
    },
  ) {
    setBusy(pool.id);
    try {
      const res = await upd({ data: { zoneId, poolId: pool.id, ...patch } });
      if (!res.ok) {
        toast.error(res.error);
        return false;
      }
      toast.success(`Pool ${pool.name} atualizada.`);
      qc.invalidateQueries({ queryKey: ["cf-lb-config", zoneId] });
      qc.invalidateQueries({ queryKey: ["cf-zone-changes"] });
      return true;
    } finally {
      setBusy(null);
    }
  }
  const toggleOrigin = (pool: LbPool, name: string, enabled: boolean) =>
    savePool(pool, {
      origins: pool.origins.map((o) => ({
        name: o.name,
        address: o.address,
        weight: o.weight,
        enabled: o.name === name ? enabled : o.enabled,
      })),
    });

  const health = (h: boolean | null, enabled = true) =>
    !enabled
      ? ["Desligada", "var(--v2-fg-3)"]
      : h === null
        ? ["Sem monitor", "var(--v2-fg-3)"]
        : h
          ? ["Saudável", "var(--v2-ok)"]
          : ["Falhando", "var(--v2-crit)"];

  return (
    <div className="cv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cv-sh">
        <h2>Load Balancing</h2>
        <p>
          Balanceadores da zona, pools e origens. Desligar uma origem tira ela da rotação na hora.
        </p>
      </div>
      {q.isLoading ? (
        <div className="cv-empty">Carregando…</div>
      ) : d && !d.ok ? (
        <div className="cv-empty">{d.error}</div>
      ) : d?.ok ? (
        <>
          {d.balancers.map((b) => (
            <div key={b.id} className="cv-box">
              <div className="cv-box-h">
                <b>{b.name}</b>
                <span
                  className="cv-pill"
                  style={
                    { "--c": b.enabled ? "var(--v2-ok)" : "var(--v2-fg-3)" } as React.CSSProperties
                  }
                >
                  {b.enabled ? "Ativo" : "Desativado"}
                </span>
                <small>
                  {STEERING[b.steering] ?? b.steering} · afinidade{" "}
                  {b.sessionAffinity === "none" ? "desligada" : b.sessionAffinity} ·{" "}
                  {b.proxied ? "proxied" : "DNS only"}
                </small>
              </div>
              <div style={{ padding: "10px 14px", fontSize: 13, color: "var(--v2-fg-2)" }}>
                Pools em ordem:{" "}
                {b.defaultPools.map((id, i) => (
                  <span key={id} className="cv-tag" style={{ marginRight: 6 }}>
                    {i + 1}. {d.pools.find((p) => p.id === id)?.name ?? id}
                  </span>
                ))}
                {b.fallbackPool && (
                  <span className="cv-tag">
                    fallback: {d.pools.find((p) => p.id === b.fallbackPool)?.name ?? b.fallbackPool}
                  </span>
                )}
              </div>
            </div>
          ))}
          {d.pools.map((p) => {
            const [hl, hc] = health(p.healthy, p.enabled);
            return (
              <div key={p.id} className="cv-box">
                <div className="cv-box-h">
                  <b>{p.name}</b>
                  <span className="cv-pill" style={{ "--c": hc } as React.CSSProperties}>
                    {hl}
                  </span>
                  <small>
                    {p.origins.filter((o) => o.enabled).length} de {p.origins.length} origens
                    ligadas
                  </small>
                  <span className="r">
                    {busy === p.id && <Loader2 size={15} className="animate-spin" />}
                    <button className="cf-btn sm" onClick={() => setEdit(p)}>
                      <Pencil size={12} /> Editar pool
                    </button>
                  </span>
                </div>
                {p.origins.map((o) => {
                  const [ol, oc] = health(o.healthy, o.enabled);
                  return (
                    <div key={o.name} className="cv-origin">
                      <span
                        className="cv-dot"
                        style={{ "--c": oc } as React.CSSProperties}
                        title={ol}
                      />
                      <span style={{ minWidth: 0 }}>
                        <b style={{ fontWeight: 500 }}>{o.name}</b>{" "}
                        <span className="cv-mono">{o.address}</span>
                        <br />
                        <small
                          style={{
                            color: o.healthy === false ? "var(--v2-crit)" : "var(--v2-fg-3)",
                          }}
                        >
                          {ol}
                          {o.failure ? ` · ${o.failure}` : ""}
                        </small>
                      </span>
                      <span className="cv-mono">peso {o.weight}</span>
                      <span className="cv-mono">
                        {o.rttMs !== null ? `${Math.round(o.rttMs)} ms` : "—"}
                      </span>
                      <Switch
                        checked={o.enabled}
                        disabled={busy === p.id}
                        onCheckedChange={(v) => toggleOrigin(p, o.name, v)}
                        aria-label={`${o.enabled ? "Desligar" : "Ligar"} ${o.name}`}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </>
      ) : null}
      <PoolDialog
        pool={edit}
        busy={!!edit && busy === edit.id}
        onClose={() => setEdit(null)}
        onSave={(origins, enabled) =>
          edit ? savePool(edit, { origins, enabled }) : Promise.resolve(false)
        }
      />
    </div>
  );
}

type OriginDraft = { name: string; address: string; enabled: boolean; weight: number };
function PoolDialog({
  pool,
  busy,
  onClose,
  onSave,
}: {
  pool: LbPool | null;
  busy: boolean;
  onClose: () => void;
  onSave: (origins: OriginDraft[], enabled: boolean) => Promise<boolean>;
}) {
  const [rows, setRows] = React.useState<OriginDraft[]>([]);
  const [enabled, setEnabled] = React.useState(true);
  React.useEffect(() => {
    if (!pool) return;
    setRows(
      pool.origins.map((o) => ({
        name: o.name,
        address: o.address,
        enabled: o.enabled,
        weight: o.weight,
      })),
    );
    setEnabled(pool.enabled);
  }, [pool]);
  const valid =
    rows.length > 0 &&
    rows.every((r) => r.name.trim() && r.address.trim() && r.weight >= 0 && r.weight <= 1);
  const patch = (i: number, p: Partial<OriginDraft>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  return (
    <Dialog open={!!pool} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle>Editar pool {pool?.name}</DialogTitle>
        </DialogHeader>
        <div style={{ display: "grid", gap: 12 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13.5 }}>
            <Switch checked={enabled} onCheckedChange={setEnabled} /> Pool ativa
          </label>
          <div className="cv-grid cv-lbl">
            <span>Nome</span>
            <span>Endereço</span>
            <span>Peso (0–1)</span>
            <span>Ligada</span>
            <span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="cv-grid">
              <input
                className="cv-in"
                value={r.name}
                onChange={(e) => patch(i, { name: e.target.value })}
                aria-label="Nome da origem"
              />
              <input
                className="cv-in m"
                value={r.address}
                onChange={(e) => patch(i, { address: e.target.value })}
                aria-label="Endereço da origem"
              />
              <input
                className="cv-in m"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={r.weight}
                onChange={(e) => patch(i, { weight: Number(e.target.value) })}
                aria-label="Peso"
              />
              <Switch
                checked={r.enabled}
                onCheckedChange={(v) => patch(i, { enabled: v })}
                aria-label="Origem ligada"
              />
              <button
                className="cf-btn sm"
                style={{ padding: "0 8px" }}
                disabled={rows.length <= 1}
                onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                aria-label="Remover origem"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <button
            className="cf-btn sm"
            style={{ justifySelf: "start" }}
            onClick={() =>
              setRows((rs) => [...rs, { name: "", address: "", enabled: true, weight: 1 }])
            }
          >
            <Plus size={12} /> Adicionar origem
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "var(--v2-fg-3)" }}>
            O monitor de saúde e o balanceador (ordem dos pools, steering) continuam sendo ajustados
            no painel da Cloudflare.
          </p>
        </div>
        <DialogFooter>
          <button className="cf-btn" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="cf-btn primary"
            disabled={!valid || busy}
            onClick={async () => {
              if (
                await onSave(
                  rows.map((r) => ({ ...r, name: r.name.trim(), address: r.address.trim() })),
                  enabled,
                )
              )
                onClose();
            }}
          >
            {busy && <Loader2 size={13} className="animate-spin" />} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
