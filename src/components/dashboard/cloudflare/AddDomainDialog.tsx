import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { createCloudflareZone, listZoneAccounts } from "@/lib/cloudflare.functions";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import {
  ArrowLeft,
  ArrowLeftRight,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Copy,
  Gauge,
  Info,
  AlertTriangle,
  Upload,
} from "lucide-react";
import { OPS_CSS } from "./OperationsTab";

// Mesmos tokens do OperationsTab (CSS vars do tema). As classes .ops-* vêm do
// OPS_CSS, injetado no próprio Dialog (ele abre pelo menu Ações, fora da tela
// de Operações).
const T = {
  surface: "var(--v2-surface)",
  surfaceAlt: "var(--v2-surface-2)",
  border: "var(--v2-line)",
  borderHi: "var(--v2-line-strong)",
  accent: "var(--v2-accent)",
  accentGlow: "color-mix(in oklch, var(--v2-accent) 14%, transparent)",
  success: "var(--v2-ok)",
  successBg: "color-mix(in oklch, var(--v2-ok) 12%, transparent)",
  warning: "var(--v2-high)",
  warningBg: "color-mix(in oklch, var(--v2-high) 12%, transparent)",
  text: "var(--v2-fg)",
  text2: "var(--v2-fg-2)",
};

type AiPolicy = "disabled" | "block" | "only_on_ad_pages" | "disallow";
type DnsImport = "auto" | "manual" | "zone_file";
type Step = "choose" | "connect" | "done";

const POLICY_OPTIONS: Record<"search" | "agent" | "training", Array<{ value: AiPolicy; label: string }>> = {
  search: [
    { value: "block", label: "Bloquear" },
    { value: "only_on_ad_pages", label: "Bloquear em páginas com anúncios" },
    { value: "disabled", label: "Permitir (não bloquear)" },
  ],
  agent: [
    { value: "block", label: "Bloquear" },
    { value: "only_on_ad_pages", label: "Bloquear em páginas com anúncios" },
    { value: "disabled", label: "Permitir (não bloquear)" },
  ],
  training: [
    { value: "block", label: "Bloquear" },
    { value: "only_on_ad_pages", label: "Bloquear em páginas com anúncios" },
    { value: "disallow", label: "Disallow" },
    { value: "disabled", label: "Permitir (não bloquear)" },
  ],
};

const POLICY_ROWS: Array<{ key: "search" | "agent" | "training"; title: string; desc: string }> = [
  { key: "search", title: "Search", desc: "Bots que varrem o site para ele aparecer em resultados de busca." },
  { key: "agent", title: "Agent", desc: "Bots que buscam informação do site para responder perguntas de usuários." },
  { key: "training", title: "Training", desc: "Crawlers que coletam conteúdo para treinar modelos de IA." },
];

const MAX_ZONE_FILE_BYTES = 1_000_000;

export function AddDomainDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const fetchAccounts = useServerFn(listZoneAccounts);
  const doCreate = useServerFn(createCloudflareZone);

  const [step, setStep] = React.useState<Step>("choose");
  const [name, setName] = React.useState("");
  const [accountId, setAccountId] = React.useState("");
  const [monetize, setMonetize] = React.useState(false);
  const [policies, setPolicies] = React.useState<Record<"search" | "agent" | "training", AiPolicy>>({
    search: "disabled",
    agent: "disabled",
    training: "disabled",
  });
  const [touched, setTouched] = React.useState<Set<string>>(new Set());
  const [botSync, setBotSync] = React.useState(true);
  const [importOpen, setImportOpen] = React.useState(false);
  const [dnsImport, setDnsImport] = React.useState<DnsImport>("auto");
  const [zoneFile, setZoneFile] = React.useState<{ name: string; content: string } | null>(null);
  const [zoneFileProxied, setZoneFileProxied] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [result, setResult] = React.useState<Extract<Awaited<ReturnType<typeof doCreate>>, { ok: true }> | null>(null);

  const { data: accountsData } = useQuery({
    queryKey: ["cloudflare-zone-accounts"],
    queryFn: () => fetchAccounts(),
    enabled: open,
  });
  const accounts = accountsData?.ok ? accountsData.accounts : [];
  React.useEffect(() => {
    if (!accountId && accounts.length === 1) setAccountId(accounts[0].id);
  }, [accounts, accountId]);

  // Recomendado segue o painel da Cloudflare: "Permitir" por padrão; quem
  // monetiza com anúncios passa a ter "Bloquear em páginas com anúncios" como
  // recomendado — e as políticas ainda não mexidas acompanham.
  const recommended: AiPolicy = monetize ? "only_on_ad_pages" : "disabled";
  function toggleMonetize(v: boolean) {
    setMonetize(v);
    const rec: AiPolicy = v ? "only_on_ad_pages" : "disabled";
    setPolicies((p) => ({
      search: touched.has("search") ? p.search : rec,
      agent: touched.has("agent") ? p.agent : rec,
      training: touched.has("training") ? p.training : rec,
    }));
  }

  function reset() {
    setStep("choose");
    setName("");
    setMonetize(false);
    setPolicies({ search: "disabled", agent: "disabled", training: "disabled" });
    setTouched(new Set());
    setBotSync(true);
    setImportOpen(false);
    setDnsImport("auto");
    setZoneFile(null);
    setZoneFileProxied(false);
    setResult(null);
  }

  function handleOpenChange(v: boolean) {
    if (loading) return;
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  }

  const domain = name.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const domainValid = /^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(domain);
  const canContinue =
    domainValid && !!accountId && (dnsImport !== "zone_file" || !!zoneFile?.content.trim()) && !loading;

  async function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_ZONE_FILE_BYTES) {
      toast.error("Arquivo de zona maior que 1 MB.");
      return;
    }
    setZoneFile({ name: f.name, content: await f.text() });
  }

  async function execute() {
    setConfirmOpen(false);
    setLoading(true);
    try {
      let res: Awaited<ReturnType<typeof doCreate>>;
      try {
        res = await doCreate({
          data: {
            name: domain,
            accountId,
            aiSearch: policies.search as "disabled" | "block" | "only_on_ad_pages",
            aiUser: policies.agent as "disabled" | "block" | "only_on_ad_pages",
            aiTraining: policies.training,
            botPreferenceSync: botSync,
            dnsImport,
            zoneFile: dnsImport === "zone_file" ? zoneFile?.content : undefined,
            zoneFileProxied: dnsImport === "zone_file" ? zoneFileProxied : undefined,
          },
        });
      } catch (err: any) {
        toast.error(err?.message ?? "Erro inesperado ao adicionar domínio.");
        return;
      }
      if (res.ok) {
        toast.success(`Domínio ${res.zoneName} adicionado à Cloudflare.`);
        setResult(res);
        setStep("done");
        qc.invalidateQueries({ queryKey: ["cloudflare-zones"] });
        qc.invalidateQueries({ queryKey: ["cloudflare-zones-list"] });
      } else {
        toast.error(res.error ?? "Erro ao adicionar domínio.");
      }
    } finally {
      setLoading(false);
    }
  }

  const accountName = accounts.find((a) => a.id === accountId)?.name ?? accountId;
  const policyLabel = (k: "search" | "agent" | "training") =>
    POLICY_OPTIONS[k].find((o) => o.value === policies[k])?.label ?? policies[k];
  const importLabel =
    dnsImport === "auto"
      ? "Importar automaticamente"
      : dnsImport === "manual"
        ? "Inserir manualmente"
        : `Arquivo de zona (${zoneFile?.name ?? "—"})`;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <style dangerouslySetInnerHTML={{ __html: OPS_CSS }} />
        <div className="ops-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <DialogHeader>
            {step === "connect" && (
              <button
                type="button"
                className="ops-btn ghost"
                style={{ alignSelf: "flex-start", padding: "2px 4px", fontSize: 12 }}
                onClick={() => setStep("choose")}
                disabled={loading}
              >
                <ArrowLeft size={12} /> Voltar
              </button>
            )}
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 20 }}>
              {step === "choose" ? "Adicionar um site" : step === "connect" ? "Conectar seu domínio" : "Domínio adicionado"}
            </DialogTitle>
            <div style={{ fontSize: 13, color: T.text2 }}>
              {step === "choose"
                ? "Conecte ou transfira domínios existentes para a Cloudflare, ou registre um novo domínio."
                : step === "connect"
                  ? "Deixe seu site mais rápido, mais seguro e mais confiável."
                  : "Aponte os nameservers abaixo no registrador do domínio para ativar a zona."}
            </div>
          </DialogHeader>

          {step === "choose" && (
            <TooltipProvider delayDuration={150}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <ChoiceCard
                  icon={<Gauge size={16} />}
                  title="Conectar um domínio"
                  desc="Deixe seu site mais rápido, mais seguro e mais confiável"
                  onClick={() => setStep("connect")}
                />
                <ChoiceCard
                  icon={<ArrowLeftRight size={16} />}
                  title="Transferir um domínio"
                  desc="Mova o registro do domínio para a Cloudflare e economize nas renovações"
                  disabledReason="Transferência de registro só pode ser feita no painel da Cloudflare (exige código EPP e pagamento)."
                />
                <ChoiceCard
                  icon={<CircleDollarSign size={16} />}
                  title="Comprar um domínio"
                  desc="Registre um novo domínio sem taxa de intermediação"
                  disabledReason="Compra de domínio só pode ser feita no painel da Cloudflare (exige pagamento)."
                />
              </div>
            </TooltipProvider>
          )}

          {step === "connect" && (
            <>
              <div className="ops-field">
                <span className="ops-label">Nome do domínio</span>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="exemplo.com.br"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canContinue) setConfirmOpen(true);
                  }}
                />
                {name && !domainValid && (
                  <span style={{ fontSize: 11, color: "var(--v2-crit)" }}>Informe só o domínio raiz, ex.: exemplo.com.br</span>
                )}
              </div>

              {accounts.length > 1 && (
                <div className="ops-field">
                  <span className="ops-label">Conta Cloudflare</span>
                  <Select value={accountId} onValueChange={setAccountId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name ?? a.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {accountsData?.ok && accounts.length === 0 && (
                <div style={{ fontSize: 12, color: T.warning, display: "flex", gap: 6, alignItems: "center" }}>
                  <AlertTriangle size={13} /> Nenhuma conta conhecida — sincronize as zonas da Cloudflare primeiro.
                </div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 10, color: T.text2, fontSize: 12 }}>
                Configuração adicional
                <div style={{ flex: 1, height: 1, background: T.border }} />
              </div>

              <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ padding: "14px 16px", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    Políticas de treinamento e busca de IA
                    <InfoTip text="Define como crawlers de IA podem acessar o domínio. Pode ser alterado depois em Security → Settings → Bot traffic." />
                  </div>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 13, cursor: "pointer" }}>
                    <Checkbox checked={monetize} onCheckedChange={(v) => toggleMonetize(!!v)} />
                    Monetizo páginas que exibem anúncios
                    <InfoTip text="Muda a recomendação para bloquear crawlers de IA só nas páginas com anúncios." />
                  </label>
                </div>
                {POLICY_ROWS.map((row) => (
                  <div
                    key={row.key}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 16,
                      padding: "12px 16px",
                      borderBottom: `1px solid ${T.border}`,
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{row.title}</div>
                      <div style={{ fontSize: 12, color: T.text2 }}>{row.desc}</div>
                    </div>
                    <div style={{ flex: "0 1 300px", width: 300, maxWidth: "100%" }}>
                      <Select
                        value={policies[row.key]}
                        onValueChange={(v) => {
                          setPolicies((p) => ({ ...p, [row.key]: v as AiPolicy }));
                          setTouched((s) => new Set(s).add(row.key));
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {POLICY_OPTIONS[row.key].map((o) => (
                            <SelectItem key={o.value} value={o.value}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                                {o.label}
                                {o.value === recommended && <RecommendedBadge />}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "12px 16px" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>Ativar Bot Preference Sync</div>
                    <div style={{ fontSize: 12, color: T.text2 }}>
                      Prefixa o robots.txt do site com as preferências configuradas na Cloudflare.
                    </div>
                  </div>
                  <Switch checked={botSync} onCheckedChange={setBotSync} />
                </div>
              </div>

              <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                <button
                  type="button"
                  onClick={() => setImportOpen((v) => !v)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    background: "transparent",
                    border: "none",
                    color: T.text,
                    cursor: "pointer",
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    Importar registros DNS
                    <InfoTip text="Como os registros DNS atuais do domínio entram na zona nova." />
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Badge>{dnsImport === "auto" ? "Automático" : dnsImport === "manual" ? "Manual" : "Arquivo de zona"}</Badge>
                    {importOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>
                {importOpen && (
                  <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, color: T.text2, marginBottom: 2 }}>Como os registros DNS devem ser importados?</div>
                    <ImportOption
                      selected={dnsImport === "auto"}
                      onSelect={() => setDnsImport("auto")}
                      title="Importar registros DNS automaticamente"
                      badge={<RecommendedBadge />}
                      desc="A Cloudflare procura os registros DNS comuns e importa para você"
                    />
                    <ImportOption
                      selected={dnsImport === "manual"}
                      onSelect={() => setDnsImport("manual")}
                      title="Inserir registros DNS manualmente"
                      badge={<Badge>Avançado</Badge>}
                      desc="Você adiciona os registros depois (botão Adicionar DNS)"
                    />
                    <ImportOption
                      selected={dnsImport === "zone_file"}
                      onSelect={() => setDnsImport("zone_file")}
                      title="Enviar arquivo de zona DNS"
                      badge={<Badge>Avançado</Badge>}
                      desc="Importa registros de um arquivo de zona no formato BIND"
                    />
                    {dnsImport === "zone_file" && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 4 }}>
                        <label className="ops-btn outline sm" style={{ alignSelf: "flex-start" }}>
                          <Upload size={12} /> {zoneFile ? zoneFile.name : "Selecionar arquivo"}
                          <input type="file" accept=".txt,.zone,.bind,.db" hidden onChange={onPickFile} />
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, cursor: "pointer" }}>
                          <Checkbox checked={zoneFileProxied} onCheckedChange={(v) => setZoneFileProxied(!!v)} />
                          Ativar proxy da Cloudflare nos registros importados (A/AAAA/CNAME)
                        </label>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="ops-btn primary" disabled={!canContinue} onClick={() => setConfirmOpen(true)}>
                  {loading ? "Adicionando…" : "Continuar"}
                </button>
              </div>
            </>
          )}

          {step === "done" && result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "12px 14px",
                  borderRadius: 8,
                  background: T.successBg,
                  color: T.success,
                  fontSize: 13,
                }}
              >
                <CheckCircle2 size={16} />
                <span>
                  <strong>{result.zoneName}</strong> criado com status <strong>{result.status ?? "—"}</strong>.
                </span>
              </div>

              <div className="ops-field">
                <span className="ops-label">Nameservers da Cloudflare</span>
                {result.nameServers.length === 0 && <span style={{ fontSize: 12 }}>—</span>}
                {result.nameServers.map((ns) => (
                  <div
                    key={ns}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "8px 12px",
                      border: `1px solid ${T.border}`,
                      borderRadius: 6,
                      background: T.surfaceAlt,
                      fontFamily: "var(--font-data)",
                      fontSize: 12,
                    }}
                  >
                    {ns}
                    <button
                      className="ops-btn ghost"
                      title="Copiar"
                      onClick={() => {
                        navigator.clipboard?.writeText(ns).then(
                          () => toast.success("Copiado."),
                          () => toast.error("Não foi possível copiar."),
                        );
                      }}
                    >
                      <Copy size={12} />
                    </button>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: 12 }}>
                <span className="ops-label">Importação DNS: </span>
                {result.dnsImportNote}
              </div>

              {result.warnings.length > 0 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "10px 12px",
                    borderRadius: 8,
                    background: T.warningBg,
                    color: T.warning,
                    fontSize: 12,
                  }}
                >
                  {result.warnings.map((w) => (
                    <div key={w} style={{ display: "flex", gap: 6 }}>
                      <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /> {w}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="ops-btn primary" onClick={() => handleOpenChange(false)}>
                  Concluir
                </button>
              </div>
            </div>
          )}
        </div>

        <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar novo domínio</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div style={{ fontSize: 13, fontFamily: "var(--font-data)", display: "flex", flexDirection: "column", gap: 4 }}>
                  <div>
                    Domínio: <strong>{domain}</strong>
                  </div>
                  <div>
                    Conta: <strong>{accountName}</strong>
                  </div>
                  <div>
                    Search: <strong>{policyLabel("search")}</strong>
                  </div>
                  <div>
                    Agent: <strong>{policyLabel("agent")}</strong>
                  </div>
                  <div>
                    Training: <strong>{policyLabel("training")}</strong>
                  </div>
                  <div>
                    Bot Preference Sync: <strong>{botSync ? "Ativo" : "Desativado"}</strong>
                  </div>
                  <div>
                    DNS: <strong>{importLabel}</strong>
                  </div>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={execute} disabled={loading}>
                Adicionar domínio
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function ChoiceCard({
  icon,
  title,
  desc,
  onClick,
  disabledReason,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick?: () => void;
  disabledReason?: string;
}) {
  const card = (
    <button
      type="button"
      onClick={disabledReason ? undefined : onClick}
      aria-disabled={!!disabledReason}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "16px 18px",
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        background: T.surface,
        color: T.text,
        textAlign: "left",
        cursor: disabledReason ? "not-allowed" : "pointer",
        opacity: disabledReason ? 0.5 : 1,
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!disabledReason) e.currentTarget.style.borderColor = "var(--v2-line-strong)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--v2-line)";
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 8,
          border: `1px solid ${T.border}`,
          background: T.surfaceAlt,
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{title}</span>
        <span style={{ fontSize: 12, color: T.text2 }}>{desc}</span>
      </span>
    </button>
  );
  if (!disabledReason) return card;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div>{card}</div>
      </TooltipTrigger>
      <TooltipContent>{disabledReason}</TooltipContent>
    </Tooltip>
  );
}

function ImportOption({
  selected,
  onSelect,
  title,
  badge,
  desc,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  badge: React.ReactNode;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "12px 14px",
        border: `1px solid ${selected ? T.borderHi : T.border}`,
        borderRadius: 8,
        background: selected ? T.surfaceAlt : "transparent",
        color: T.text,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          {title} {badge}
        </span>
        <span style={{ fontSize: 12, color: T.text2 }}>{desc}</span>
      </span>
      <span
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: `1.5px solid ${selected ? T.text : T.borderHi}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {selected && <span style={{ width: 8, height: 8, borderRadius: "50%", background: T.text }} />}
      </span>
    </button>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 600,
        padding: "2px 7px",
        borderRadius: 5,
        background: T.surfaceAlt,
        border: `1px solid ${T.border}`,
        color: T.text,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function RecommendedBadge() {
  return <Badge>Recomendado</Badge>;
}

function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span style={{ display: "inline-flex", color: T.text2, cursor: "help" }} onClick={(e) => e.preventDefault()}>
            <Info size={12} />
          </span>
        </TooltipTrigger>
        <TooltipContent style={{ maxWidth: 280 }}>{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
