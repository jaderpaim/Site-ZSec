import * as React from "react";
import { cn } from "@/lib/utils";

export type Criticidade = "Baixo" | "Médio" | "Alto" | "Crítico";
export type CmdbStatus = "Ativo" | "Em manutenção" | "Desativado";
export type CmdbDisplayStatus = CmdbStatus | "Alerta" | "Inativo";

export const CRITICIDADE_ORDER: Record<Criticidade, number> = {
  "Crítico": 0,
  "Alto": 1,
  "Médio": 2,
  "Baixo": 3,
};

export const CRITICIDADE_META: Record<
  Criticidade,
  { badge: string; bar: string; header: string; dot: string }
> = {
  "Crítico": {
    badge: "bg-red-500/15 text-red-400 border border-red-500/30",
    bar: "border-l-red-500",
    header: "bg-red-500/15 text-red-400 border border-red-500/30",
    dot: "bg-red-500",
  },
  "Alto": {
    badge: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    bar: "border-l-amber-500",
    header: "bg-amber-500/15 text-amber-400 border border-amber-500/30",
    dot: "bg-amber-500",
  },
  "Médio": {
    badge: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    bar: "border-l-blue-500",
    header: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
    dot: "bg-blue-500",
  },
  "Baixo": {
    badge: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    bar: "border-l-emerald-500",
    header: "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
    dot: "bg-emerald-500",
  },
};

const STATUS_META: Record<CmdbDisplayStatus, string> = {
  "Ativo": "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30",
  "Em manutenção": "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  "Desativado": "bg-muted text-muted-foreground border border-border",
  "Alerta": "bg-amber-500/15 text-amber-400 border border-amber-500/30",
  "Inativo": "bg-red-500/15 text-red-400 border border-red-500/30",
};

export function CriticidadeBadge({ value, className }: { value: Criticidade; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        CRITICIDADE_META[value].badge,
        className,
      )}
    >
      {value}
    </span>
  );
}

export function StatusBadge({ value, className }: { value: CmdbDisplayStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        STATUS_META[value],
        className,
      )}
    >
      {value}
    </span>
  );
}

export function TipoBadge({ value }: { value: string }) {
  return (
    <span className="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
      {value}
    </span>
  );
}
