import { RefreshCw } from "lucide-react";

export function SocHeader({
  lastSync,
  syncing,
  onSync,
  error,
}: {
  lastSync: string;
  syncing: boolean;
  onSync: () => void;
  error?: string | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4 pb-2">
      <div className="flex items-center gap-4">
        <span
          aria-hidden
          className="block w-1.5 h-12 rounded-full"
          style={{ background: "var(--soc-grad-divider)" }}
        />
        <div>
          <h1 className="soc-display text-3xl font-semibold uppercase tracking-wide leading-none">
            Security Operations Center
          </h1>
          <p className="soc-body text-xs mt-1.5" style={{ color: "var(--soc-text-muted)" }}>
            IBM QRadar SIEM · Última atualização: <span className="font-medium">{lastSync}</span>
            {error && (
              <span className="ml-3" style={{ color: "var(--soc-warning)" }}>
                · {error}
              </span>
            )}
          </p>
        </div>
      </div>
      <button
        onClick={onSync}
        disabled={syncing}
        className="soc-body inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50"
        style={{
          background: "linear-gradient(135deg, var(--soc-primary), var(--soc-accent))",
          boxShadow: "0 4px 16px rgba(0, 102, 255, 0.35)",
        }}
      >
        <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
        {syncing ? "Sincronizando…" : "Sincronizar agora"}
      </button>
    </div>
  );
}
