import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { MODULE_GROUPS, useVisibleModules } from "@/lib/use-visible-modules";
import { useShellState } from "@/components/layout/shell-state";

/** Busca ⌘K / Ctrl+K: vai direto para qualquer módulo visível ao usuário. */
export function CommandMenu() {
  const { searchOpen, setSearchOpen } = useShellState();
  const modules = useVisibleModules();
  const navigate = useNavigate();

  return (
    <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
      <CommandInput placeholder="Buscar módulo…" />
      <CommandList className="font-ui">
        <CommandEmpty>Nenhum módulo encontrado.</CommandEmpty>
        {MODULE_GROUPS.map((g) => {
          const items = modules.filter((m) => m.group === g);
          if (items.length === 0) return null;
          return (
            <CommandGroup key={g} heading={g}>
              {items.map((m) => {
                const Icon = m.icon;
                return (
                  <CommandItem
                    key={m.slug}
                    value={`${m.title} ${m.short} ${g}`}
                    onSelect={() => {
                      setSearchOpen(false);
                      navigate({ to: "/app/$module", params: { module: m.slug } });
                    }}
                  >
                    <Icon className="text-muted-foreground" />
                    <span>{m.title}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          );
        })}
      </CommandList>
    </CommandDialog>
  );
}
