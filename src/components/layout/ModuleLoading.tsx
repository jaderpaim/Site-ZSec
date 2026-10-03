import { BrandMark } from "@/components/layout/AppSidebar";

/**
 * Tela de carregamento padrão: o mesmo logo pulsando + "Carregando…" do
 * refresh da aplicação. `fullScreen` ocupa a janela inteira (shell); sem ele,
 * ocupa a área do módulo.
 */
export function ModuleLoading({ fullScreen = false }: { fullScreen?: boolean }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`font-ui flex flex-col items-center justify-center gap-3 text-v2-fg-3 text-[13px] ${
        fullScreen ? "min-h-screen bg-v2-bg" : "min-h-[50vh] w-full"
      }`}
    >
      <BrandMark className="w-8 h-9 animate-pulse motion-reduce:animate-none" />
      Carregando…
    </div>
  );
}
