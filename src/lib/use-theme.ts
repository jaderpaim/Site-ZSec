import * as React from "react";
import { useUserSettings } from "@/lib/use-user-settings";

export type Theme = "dark" | "light";

const STORAGE_KEY = "bsec.theme";

function applyToDom(next: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", next);
  // As variantes `dark:` do Tailwind dependem da classe .dark no <html>
  root.classList.toggle("dark", next === "dark");
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage indisponível: só perde o cache da primeira pintura */
  }
}

/**
 * Tema da interface v2. Fonte da verdade: user_settings.theme (segue o usuário
 * entre máquinas). O localStorage é só cache para o script inline do
 * __root.tsx pintar o tema certo antes do React carregar.
 */
export function useTheme() {
  const { row, update } = useUserSettings();
  const [theme, setThemeState] = React.useState<Theme>("dark");

  React.useEffect(() => {
    setThemeState(
      document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
    );
  }, []);

  // O que está salvo no perfil vence o cache local (ex.: trocou o tema em outra máquina)
  const savedTheme = row?.theme;
  React.useEffect(() => {
    if (!savedTheme) return;
    applyToDom(savedTheme);
    setThemeState(savedTheme);
  }, [savedTheme]);

  const setTheme = React.useCallback(
    (next: Theme) => {
      applyToDom(next);
      setThemeState(next);
      update({ theme: next });
    },
    [update],
  );

  return { theme, setTheme };
}
