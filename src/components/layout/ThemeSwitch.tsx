import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type Theme } from "@/lib/use-theme";

/** Opções de tema, na ordem do seletor (menu da conta e tela de perfil) */
export const THEME_OPTIONS = [
  { value: "light", label: "Claro", Icon: Sun },
  { value: "dark", label: "Escuro", Icon: Moon },
  { value: "system", label: "Auto", Icon: Monitor },
] as const satisfies ReadonlyArray<{ value: Theme; label: string; Icon: typeof Sun }>;

export const SEGMENT_BASE =
  "h-7 inline-flex items-center justify-center gap-1.5 rounded-[5px] text-[12.5px] outline-none transition-colors";
export const SEGMENT_ON =
  "bg-v2-surface text-v2-fg shadow-[0_1px_2px_rgb(0_0_0/0.12),0_0_0_1px_var(--v2-line)]";
export const SEGMENT_OFF = "text-v2-fg-2 hover:text-v2-fg focus-visible:bg-v2-hover";

/** Seletor segmentado Claro/Escuro/Auto para uso fora de menus (ex.: tela de perfil) */
export function ThemeSegmented({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={`grid grid-cols-3 gap-0.5 p-0.5 rounded-[7px] bg-v2-surface-2 ${className}`}
    >
      {THEME_OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={theme === value}
          onClick={() => setTheme(value)}
          className={`${SEGMENT_BASE} px-3 ${theme === value ? SEGMENT_ON : SEGMENT_OFF}`}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
