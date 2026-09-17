import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type CheckState =
  | { kind: "loading" }
  | { kind: "ok"; detail: string }
  | { kind: "error"; name: string; message: string };

// Tillfällig diagnostikruta – endast utvecklingsläge (import.meta.env.DEV).
// Ta bort hela filen + referensen i src/routes/index.tsx när felsökningen är klar.
export function DiagnosticPanel() {
  if (!import.meta.env.DEV) return null;
  return <PanelInner />;
}

function PanelInner() {
  const [db, setDb] = useState<CheckState>({ kind: "loading" });
  const [auth, setAuth] = useState<CheckState>({ kind: "loading" });

  const env = import.meta.env as Record<string, string | undefined>;
  const supabaseUrl = env["VITE_SUPABASE_URL"];
  const publishableKey =
    env["VITE_SUPABASE_PUBLISHABLE_KEY"] || env["VITE_SUPABASE_ANON_KEY"];

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      // 1. Databasanslutning: en liten publik läsning mot species.
      try {
        const { data, error } = await supabase
          .from("species")
          .select("id", { count: "exact", head: false })
          .limit(5);
        if (cancelled) return;
        if (error) {
          setDb({ kind: "error", name: "PostgrestError", message: error.message });
        } else {
          setDb({ kind: "ok", detail: `läsning OK, ${data?.length ?? 0} arter hämtade` });
        }
      } catch (err) {
        if (cancelled) return;
        const e = err as Error;
        setDb({ kind: "error", name: e?.name ?? "Unknown", message: e?.message ?? String(err) });
      }

      // 2. Auth: finns en giltig session/användare?
      try {
        const { data, error } = await supabase.auth.getSession();
        if (cancelled) return;
        if (error) {
          setAuth({ kind: "error", name: "AuthError", message: error.message });
        } else if (data.session) {
          setAuth({
            kind: "ok",
            detail: `inloggad som ${data.session.user.email ?? data.session.user.id}`,
          });
        } else {
          setAuth({ kind: "ok", detail: "ingen session (utloggad)" });
        }
      } catch (err) {
        if (cancelled) return;
        const e = err as Error;
        setAuth({ kind: "error", name: e?.name ?? "Unknown", message: e?.message ?? String(err) });
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="pointer-events-auto rounded-xl border border-amber-500/50 bg-card/95 p-3 font-mono text-[11px] leading-relaxed text-card-foreground shadow-xl backdrop-blur">
      <div className="mb-1 font-sans text-xs font-semibold text-amber-600">
        🛠 Diagnostik (endast dev)
      </div>
      <div>
        VITE_SUPABASE_URL = <strong>{supabaseUrl || "(saknas)"}</strong>
      </div>
      <div>
        Publik nyckel = <strong>{publishableKey ? "satt" : "saknas"}</strong>
      </div>
      <div className="mt-1 border-t border-border pt-1">
        <div>
          Databas →{" "}
          {db.kind === "loading" && "kontrollerar…"}
          {db.kind === "ok" && <span className="text-green-600">{db.detail}</span>}
          {db.kind === "error" && (
            <span className="text-red-600">
              {db.name}: {db.message}
            </span>
          )}
        </div>
        <div>
          Auth →{" "}
          {auth.kind === "loading" && "kontrollerar…"}
          {auth.kind === "ok" && <span className="text-green-600">{auth.detail}</span>}
          {auth.kind === "error" && (
            <span className="text-red-600">
              {auth.name}: {auth.message}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
