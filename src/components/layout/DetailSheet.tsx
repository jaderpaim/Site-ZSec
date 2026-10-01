import * as React from "react";
import * as SheetPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

/**
 * Painel lateral de detalhe da interface v2 (abre ao clicar numa linha de tabela).
 * Estrutura fixa: cabeçalho (linha de contexto + fechar, título, etiquetas),
 * corpo com rolagem própria e rodapé com as ações, sempre visível.
 */
export function DetailSheet({
  open,
  onOpenChange,
  eyebrow,
  title,
  badges,
  footer,
  children,
  width = 520,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Linha pequena acima do título (data, ID, Ray ID…) */
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  /** Pílulas/etiquetas logo abaixo do título */
  badges?: React.ReactNode;
  /** Botões de ação do rodapé */
  footer?: React.ReactNode;
  children: React.ReactNode;
  width?: number;
}) {
  return (
    <SheetPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <SheetPrimitive.Portal>
        <SheetPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <SheetPrimitive.Content
          className="font-ui fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-v2-line bg-v2-surface text-v2-fg shadow-2xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right data-[state=closed]:duration-200 data-[state=open]:duration-300"
          style={{ maxWidth: width, paddingTop: "env(safe-area-inset-top, 0px)" }}
          aria-describedby={undefined}
        >
          <header className="grid gap-2 border-b border-v2-line px-5 py-4">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-data text-[12.5px] text-v2-fg-3">
                {eyebrow}
              </span>
              <SheetPrimitive.Close
                className="grid size-8 shrink-0 place-items-center rounded-lg text-v2-fg-2 transition-colors hover:bg-v2-hover hover:text-v2-fg focus-visible:outline-2 focus-visible:outline-v2-accent"
                aria-label="Fechar"
              >
                <X className="size-4" />
              </SheetPrimitive.Close>
            </div>
            <SheetPrimitive.Title className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-v2-fg">
              {title}
            </SheetPrimitive.Title>
            {badges && <div className="flex flex-wrap items-center gap-2.5">{badges}</div>}
          </header>

          <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 py-4">
            {children}
          </div>

          {footer && (
            <footer
              className="flex flex-wrap justify-end gap-2 border-t border-v2-line px-5 pt-3.5"
              style={{ paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))" }}
            >
              {footer}
            </footer>
          )}
        </SheetPrimitive.Content>
      </SheetPrimitive.Portal>
    </SheetPrimitive.Root>
  );
}

/** Lista "rótulo → valor" do corpo do painel (mesmo formato do preview). */
export function DetailList({ items }: { items: Array<[string, React.ReactNode, boolean?]> }) {
  return (
    <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2.5 text-[13px] sm:grid-cols-[140px_minmax(0,1fr)]">
      {items.map(([k, v, mono]) => (
        <React.Fragment key={k}>
          <dt className="text-v2-fg-3">{k}</dt>
          <dd
            className={`m-0 min-w-0 [overflow-wrap:anywhere] ${mono ? "font-data text-[12.5px]" : ""}`}
          >
            {v}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

/** Título de seção dentro do painel. */
export function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-v2-fg-3">
        {title}
      </h3>
      {children}
    </section>
  );
}
