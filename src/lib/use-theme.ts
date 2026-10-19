import * as React from "react";
import { useUserSettings, type ThemePreference } from "@/lib/use-user-settings";

export type Theme = ThemePreference;

const STORAGE_KEY = "bsec.theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

function resolve(pref: Theme): "dark" | "light" {
  if (pref !== "system") return pref;
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function applyToDom(pref: Theme) {
  const resolved = resolve(pref);
  const root = document.documentElement;
  root.setAttribute("data-theme", resolved);
  // As variantes `dark:` do Tailwind dependem da classe .dark no <html>
  root.classList.toggle("dark", resolved === "dark");
  try {
    // Guarda a preferência ("system" inclusive); o script do __root.tsx resolve na carga
    localStorage.setItem(STORAGE_KEY, pref);
  } catch {
    /* storage indisponível: só perde o cache da primeira pintura */
  }
}

function readCached(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "system") return v;
  } catch {
    /* storage indisponível: assume o padrão */
  }
  return "dark";
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
    setThemeState(readCached());
  }, []);

  // O que está salvo no perfil vence o cache local (ex.: trocou o tema em outra máquina)
  const savedTheme = row?.theme;
  React.useEffect(() => {
    if (!savedTheme) return;
    applyToDom(savedTheme);
    setThemeState(savedTheme);
  }, [savedTheme]);

  // Em "Auto", acompanha a troca de claro/escuro do sistema sem recarregar a página
  React.useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia(DARK_QUERY);
    const onChange = () => applyToDom("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

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
