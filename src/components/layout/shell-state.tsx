import * as React from "react";

/**
 * Estado compartilhado do shell: menu lateral aberto no mobile e busca ⌘K.
 * Fica no layout /app porque o AppHeader é renderizado por cada módulo.
 */
type ShellState = {
  navOpen: boolean;
  setNavOpen: (open: boolean) => void;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
};

const ShellContext = React.createContext<ShellState | null>(null);

export function ShellStateProvider({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = React.useMemo(
    () => ({ navOpen, setNavOpen, searchOpen, setSearchOpen }),
    [navOpen, searchOpen],
  );
  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShellState() {
  const ctx = React.useContext(ShellContext);
  if (!ctx) throw new Error("useShellState precisa estar dentro de <ShellStateProvider>");
  return ctx;
}
