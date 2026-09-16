import { useEffect, useState } from "react";

type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; status: number; body: string }
  | { kind: "error"; name: string; message: string };

// Tillfällig diagnostikruta – endast utvecklingsläge (import.meta.env.DEV).
// Ta bort hela filen + referensen i src/routes/index.tsx när felsökningen är klar.
export function DiagnosticPanel() {
  if (!import.meta.env.DEV) return null;
  return <PanelInner />;
}

function PanelInner() {
  const [health, setHealth] = useState<HealthState>({ kind: "loading" });

  const baseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!baseUrl) {
        setHealth({
          kind: "error",
          name: "ConfigError",
          message: "VITE_API_BASE_URL är inte satt – ingen URL att anropa.",
        });
        return;
      }
      try {
        const res = await fetch(`${baseUrl}/health`);
        const body = await res.text();
        if (!cancelled) setHealth({ kind: "ok", status: res.status, body });
      } catch (err) {
        if (cancelled) return;
        const e = err as Error;
        setHealth({
          kind: "error",
          name: e?.name ?? "Unknown",
          message: e?.message ?? String(err),
        });
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  return (
    <div className="relative z-30 mx-4 mt-4 rounded-xl border border-amber-500/50 bg-card/95 p-3 font-mono text-[11px] leading-relaxed text-card-foreground shadow-xl backdrop-blur">
      <div className="mb-1 font-sans text-xs font-semibold text-amber-600">
        🛠 Diagnostik (endast dev)
      </div>
      <div>
        VITE_API_BASE_URL = <strong>{baseUrl || "(saknas)"}</strong>
      </div>
      <div>
        VITE_SUPABASE_URL = <strong>{supabaseUrl || "(saknas)"}</strong>
      </div>
      <div>
        VITE_SUPABASE_ANON_KEY = <strong>{anonKey ? "satt" : "saknas"}</strong>
      </div>
      <div className="mt-1 border-t border-border pt-1">
        <div>
          GET {baseUrl || "(saknas)"}/health →{" "}
          {health.kind === "loading" && "anropar…"}
          {health.kind === "ok" && (
            <span className="text-green-600">
              status {health.status}: {health.body.slice(0, 300) || "(tom kropp)"}
            </span>
          )}
          {health.kind === "error" && (
            <span className="text-red-600">
              {health.name}: {health.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
