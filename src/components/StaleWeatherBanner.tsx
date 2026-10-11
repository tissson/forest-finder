import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Skyddsnät: varna om senaste väderdagen är äldre än ~40 timmar
// (räknat från 02:00 UTC den dagen, då nattens hämtning startar).
export const STALE_HOURS = 40;

export function weatherAgeHours(latest: string, now = new Date()): number {
  return (now.getTime() - new Date(`${latest}T02:00:00Z`).getTime()) / 3_600_000;
}

export function StaleWeatherBanner() {
  const [latest, setLatest] = useState<string | null>(null);
  useEffect(() => {
    void supabase.rpc("get_weather_freshness").then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setLatest((row as { latest_obs_date?: string } | null)?.latest_obs_date ?? null);
    });
  }, []);
  if (!latest || weatherAgeHours(latest) <= STALE_HOURS) return null;
  return (
    <div role="alert" className="pointer-events-auto mx-auto flex max-w-3xl items-start gap-2 rounded-2xl border border-destructive/40 bg-card/95 px-4 py-3 text-sm text-foreground shadow-xl backdrop-blur-xl">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <span>
        Väderdatan är inte uppdaterad. Prognosen bygger på väder från {latest} och kan vara inaktuell.
      </span>
    </div>
  );
}
