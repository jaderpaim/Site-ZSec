import * as React from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "bsec.theme";

/**
 * Tema da interface v2. O valor inicial é aplicado no <html> por um script inline
 * em __root.tsx (antes da primeira pintura); aqui só lemos e alternamos.
 */
export function useTheme() {
  const [theme, setTheme] = React.useState<Theme>("dark");

  React.useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);

  const toggleTheme = React.useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === "light" ? "dark" : "light";
      const root = document.documentElement;
      root.setAttribute("data-theme", next);
      // As variantes `dark:` do Tailwind dependem da classe .dark no <html>
      root.classList.toggle("dark", next === "dark");
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* storage indisponível: o tema só não fica salvo */
      }
      return next;
    });
  }, []);

  return { theme, toggleTheme };
}
