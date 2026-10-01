import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { CmdbAtivo } from "@/lib/cmdb.functions";
import { CriticidadeBadge, StatusBadge, TipoBadge, type Criticidade, type CmdbDisplayStatus } from "./CmdbBadges";

export function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <div className="text-mono-xs text-muted-foreground mb-0.5">{label}</div>
      <div className={mono ? "font-mono text-sm" : "text-sm"}>{value ?? "—"}</div>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">{title}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-accent/30 rounded-md">{children}</div>
    </div>
  );
}

const DNS_STATUS_LABEL: Record<"no_ptr" | "timeout" | "unknown", string> = {
  no_ptr: "nslookup não resolvido — o IP não tem registro PTR na AD",
  timeout: "nslookup sem resposta — o DNS não respondeu a tempo",
  unknown: "hostname ainda não verificado por DNS — aguardando próximo refresh",
};

function divergenceMessage(
  ativo: CmdbAtivo,
  d: {
    ip: string;
    zabbixHosts: string[];
    dns: { hostname: string; matchesCmdb: boolean; matchesZabbix: boolean } | null;
    dnsStatus: "no_ptr" | "timeout" | "unknown";
  },
): React.ReactNode {
  const zbx = d.zabbixHosts.join(", ");
  if (!d.dns) {
    return (
      <>
        Hostname divergente: o Zabbix reporta <span className="font-medium">{zbx}</span> para o IP{" "}
        <span className="font-mono">{d.ip}</span>, mas este ativo está cadastrado no CMDB como{" "}
        <span className="font-medium">{ativo.nome}</span>.{" "}
        <span className="italic opacity-80">({DNS_STATUS_LABEL[d.dnsStatus]})</span>
      </>
    );
  }
  if (d.dns.matchesCmdb) {
    return (
      <>
        Zabbix desatualizado: o NSLOOKUP confirma o hostname <span className="font-medium">{ativo.nome}</span> para o IP{" "}
        <span className="font-mono">{d.ip}</span> (igual ao CMDB), mas o Zabbix está cadastrado com{" "}
        <span className="font-medium">{zbx}</span>.
      </>
    );
  }
  if (d.dns.matchesZabbix) {
    return (
      <>
        CMDB desatualizado: o DNS confirma o hostname <span className="font-medium">{d.dns.hostname}</span> para o IP{" "}
        <span className="font-mono">{d.ip}</span> (igual ao Zabbix), mas este ativo está cadastrado no CMDB como{" "}
        <span className="font-medium">{ativo.nome}</span>.
      </>
    );
  }
  return (
    <>
      Inconsistência tripla para o IP <span className="font-mono">{d.ip}</span>: o DNS resolve{" "}
      <span className="font-medium">{d.dns.hostname}</span>, o Zabbix está cadastrado com{" "}
      <span className="font-medium">{zbx}</span>, e o CMDB tem este ativo como{" "}
      <span className="font-medium">{ativo.nome}</span> — os três divergem.
    </>
  );
}

export function CmdbDetailsSheet({
  open,
  onOpenChange,
  ativo,
  status,
  zabbixDivergence,
  onEdit,
  onDelete,
  canEdit,
  canDelete,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ativo: CmdbAtivo | null;
  status: CmdbDisplayStatus;
  zabbixDivergence?: {
    ip: string;
    zabbixHosts: string[];
    dns: { hostname: string; matchesCmdb: boolean; matchesZabbix: boolean } | null;
    dnsStatus: "no_ptr" | "timeout" | "unknown";
  } | null;
  onEdit: (a: CmdbAtivo) => void;
  onDelete: (a: CmdbAtivo) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  if (!ativo) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="space-y-3">
          <SheetTitle className="text-xl">{ativo.nome}</SheetTitle>
          <div className="flex flex-wrap items-center gap-2">
            <CriticidadeBadge value={ativo.criticidade as Criticidade} />
            <StatusBadge value={status} />
            <TipoBadge value={ativo.tipo} />
          </div>
        </SheetHeader>

        <div className="space-y-5 pt-6">
          <Section title="Identificação">
            <Field label="Nome do ativo" value={ativo.nome} />
            <Field label="Tipo" value={ativo.tipo} />
          </Section>

          <Section title="Internas">
            <Field label="IP / Hostname" value={ativo.ip_hostname} mono />
            <Field label="Fabricante / Modelo" value={ativo.fabricante_modelo} />
            <Field label="Sistema Operacional" value={ativo.sistema_operacional} />
            <Field label="Localização" value={ativo.localizacao} />
            <Field label="Status" value={<StatusBadge value={status} />} />
          </Section>

          <Section title="Responsabilidade">
            <Field label="Departamento" value={ativo.departamento_nome ?? "—"} />
          </Section>

          {ativo.observacoes && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Observações</h4>
              <div className="p-3 bg-accent/30 rounded-md text-sm whitespace-pre-wrap">{ativo.observacoes}</div>
            </div>
          )}

          {zabbixDivergence && (
            <div>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Alertas</h4>
              <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-md text-sm text-amber-600 dark:text-amber-400">
                {divergenceMessage(ativo, zabbixDivergence)}
              </div>
            </div>
          )}

          {(canEdit || canDelete) && (
            <div className="flex justify-end gap-2 pt-4 border-t border-border">
              {canEdit && (
                <Button variant="outline" onClick={() => onEdit(ativo)}>
                  <Pencil className="size-4 mr-1" /> Editar
                </Button>
              )}
              {canDelete && (
                <Button variant="destructive" onClick={() => onDelete(ativo)}>
                  <Trash2 className="size-4 mr-1" /> Excluir
                </Button>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
