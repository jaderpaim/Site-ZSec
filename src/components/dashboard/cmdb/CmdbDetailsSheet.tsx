import * as React from "react";
import { AlertTriangle, Pencil, Trash2 } from "lucide-react";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import type { CmdbAtivo } from "@/lib/cmdb.functions";
import { critColor, statusColor, type Criticidade, type CmdbDisplayStatus } from "./CmdbBadges";

export function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
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
      <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">
        {title}
      </h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 bg-accent/30 rounded-md">
        {children}
      </div>
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
        Zabbix desatualizado: o NSLOOKUP confirma o hostname{" "}
        <span className="font-medium">{ativo.nome}</span> para o IP{" "}
        <span className="font-mono">{d.ip}</span> (igual ao CMDB), mas o Zabbix está cadastrado com{" "}
        <span className="font-medium">{zbx}</span>.
      </>
    );
  }
  if (d.dns.matchesZabbix) {
    return (
      <>
        CMDB desatualizado: o DNS confirma o hostname{" "}
        <span className="font-medium">{d.dns.hostname}</span> para o IP{" "}
        <span className="font-mono">{d.ip}</span> (igual ao Zabbix), mas este ativo está cadastrado
        no CMDB como <span className="font-medium">{ativo.nome}</span>.
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

/** Selo com ponto colorido (mesmo formato dos cards do CMDB). */
export function CmdbPill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 text-xs font-medium"
      style={{
        background: `color-mix(in oklch, ${color} 14%, transparent)`,
        color: `color-mix(in oklch, ${color} 72%, var(--v2-fg))`,
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {children}
    </span>
  );
}

type Divergence = {
  ip: string;
  zabbixHosts: string[];
  dns: { hostname: string; matchesCmdb: boolean; matchesZabbix: boolean } | null;
  dnsStatus: "no_ptr" | "timeout" | "unknown";
};

export function CmdbDetailsSheet({
  open,
  onOpenChange,
  ativo,
  status,
  siem,
  zabbix,
  siemStale,
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
  /** null = fonte não ligada: a linha some do detalhe. */
  siem: boolean | null;
  zabbix: "ok" | "unknown" | "off" | null;
  siemStale: boolean;
  zabbixDivergence?: Divergence | null;
  onEdit: (a: CmdbAtivo) => void;
  onDelete: (a: CmdbAtivo) => void;
  canEdit: boolean;
  canDelete: boolean;
}) {
  if (!ativo) return null;
  const crit = ativo.criticidade as Criticidade;
  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow={[ativo.tipo, ativo.ip_hostname].filter(Boolean).join(" · ")}
      title={ativo.nome}
      badges={
        <>
          <CmdbPill color={statusColor(status)}>{status}</CmdbPill>
          <CmdbPill color={critColor(crit)}>{crit}</CmdbPill>
          {ativo.status && ativo.status !== "Ativo" && (
            <CmdbPill color={statusColor(ativo.status as CmdbDisplayStatus) ?? "var(--v2-fg-3)"}>
              {ativo.status}
            </CmdbPill>
          )}
          {zabbixDivergence && <CmdbPill color="var(--v2-med)">Divergência de hostname</CmdbPill>}
        </>
      }
      footer={
        (canEdit || canDelete) && (
          <>
            {canDelete && (
              <button
                className="mr-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium text-v2-crit hover:bg-v2-hover"
                onClick={() => onDelete(ativo)}
              >
                <Trash2 className="size-3.5" /> Excluir
              </button>
            )}
            {canEdit && (
              <button
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-v2-accent bg-v2-accent px-3 text-[13px] font-medium text-v2-accent-ink hover:brightness-110"
                onClick={() => onEdit(ativo)}
              >
                <Pencil className="size-3.5" /> Editar
              </button>
            )}
          </>
        )
      }
    >
      {zabbixDivergence && (
        <div
          className="flex gap-2.5 rounded-lg px-3 py-2.5 text-[13px] leading-relaxed text-v2-fg-2"
          style={{
            background: "color-mix(in oklch, var(--v2-med) 10%, transparent)",
            border: "1px solid color-mix(in oklch, var(--v2-med) 35%, transparent)",
          }}
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" style={{ color: "var(--v2-med)" }} />
          <span>{divergenceMessage(ativo, zabbixDivergence)}</span>
        </div>
      )}
      <DetailSection title="Identificação">
        <DetailList
          items={[
            ["IP / hostname", ativo.ip_hostname ?? "—", true],
            ["Tipo", ativo.tipo ?? "—"],
            ["Fabricante / modelo", ativo.fabricante_modelo ?? "—"],
            ["Sistema operacional", ativo.sistema_operacional ?? "—"],
          ]}
        />
      </DetailSection>
      <DetailSection title="Responsabilidade">
        <DetailList
          items={[
            ["Departamento", ativo.departamento_nome ?? "—"],
            ["Localização", ativo.localizacao ?? "—"],
            ["Criticidade", crit],
            ["Situação cadastral", ativo.status ?? "—"],
          ]}
        />
      </DetailSection>
      {(siem !== null || zabbix !== null) && (
        <DetailSection title="Monitoramento">
          <DetailList
            items={[
              ...(siem !== null
                ? [
                    [
                      "SIEM (QRadar)",
                      siem
                        ? "Recebendo eventos"
                        : siemStale
                          ? "Sem confirmação (sincronização do QRadar atrasada)"
                          : "Sem eventos",
                    ] as [string, string],
                  ]
                : []),
              ...(zabbix !== null
                ? [
                    [
                      "Zabbix",
                      zabbix === "ok"
                        ? "Disponível"
                        : zabbix === "unknown"
                          ? "Cadastrado, disponibilidade não confirmada"
                          : "Não encontrado",
                    ] as [string, string],
                  ]
                : []),
            ]}
          />
        </DetailSection>
      )}
      {ativo.observacoes && (
        <DetailSection title="Observações">
          <p className="m-0 whitespace-pre-wrap text-[13px] leading-relaxed text-v2-fg-2">
            {ativo.observacoes}
          </p>
        </DetailSection>
      )}
    </DetailSheet>
  );
}
