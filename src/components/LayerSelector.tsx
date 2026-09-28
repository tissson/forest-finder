/**
 * src/components/LayerSelector.tsx
 * ===================================
 * Växlar vilket lager Map.tsx ska visa: en specifik arts prognos,
 * eller det generella fuktighetslagret.
 *
 * Visar en "Utanför säsong"-banner när vald art har season_start/
 * season_end satta och dagens datum ligger utanför det intervallet.
 * isOutOfSeason() nedan speglar EXAKT samma MM-DD-jämförelse (med
 * årsskiftes-wraparound) som redan används server-side i
 * get_prediction_tile (v_season-beräkningen) -- annars hade klient
 * och server kunnat säga emot varandra (t.ex. bannern visas inte,
 * men servern ändå multiplicerar poängen med 0.65).
 */

import { useEffect, useState } from 'react';
import { LockKeyhole, CalendarOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { getSpecies, type Species, type LayerSelection } from '../lib/api';

export type { LayerSelection };

export interface LayerSelectorProps {
  value: LayerSelection | null;
  onChange: (selection: LayerSelection) => void;
  className?: string;
}

function monthDay(isoDate: string): string {
  return isoDate.slice(5, 10); // "YYYY-MM-DD" -> "MM-DD"
}

/**
 * Speglar v_season-logiken i get_prediction_tile (SQL): jämför
 * MM-DD-strängar, med explicit hantering av säsonger som sträcker
 * sig över årsskiftet (t.ex. season_start='11-01', season_end='02-28').
 */
export function isOutOfSeason(
  seasonStart: string | null,
  seasonEnd: string | null,
  today: Date = new Date(),
): boolean {
  if (!seasonStart || !seasonEnd) return false;

  const todayMD = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const startMD = monthDay(seasonStart);
  const endMD = monthDay(seasonEnd);

  const inSeason =
    startMD <= endMD ? todayMD >= startMD && todayMD <= endMD : todayMD >= startMD || todayMD <= endMD;

  return !inSeason;
}

function formatSeasonRange(seasonStart: string, seasonEnd: string): string {
  const months = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  const fmt = (md: string): string => {
    const parts = md.split('-');
    const month = parts[0];
    const day = parts[1];
    if (!month || !day) return md; // oväntat format -- visa rådata hellre än att krascha
    const monthIndex = parseInt(month, 10) - 1;
    const monthName = months[monthIndex] ?? month;
    return `${parseInt(day, 10)} ${monthName}`;
  };

  return `${fmt(monthDay(seasonStart))}–${fmt(monthDay(seasonEnd))}`;
}

export function LayerSelector({ value, onChange, className = '' }: LayerSelectorProps) {
  const [species, setSpecies] = useState<Species[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getSpecies()
      .then((result) => {
        if (!cancelled) setSpecies(result);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : 'Kunde inte hämta arter.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const isSelected = (selection: LayerSelection): boolean => {
    if (!value) return false;
    if (selection.type === 'moisture') return value.type === 'moisture';
    return value.type === 'species' && value.speciesId === selection.speciesId;
  };

  const freeSpecies = species.filter((s) => s.tier === 'free');
  const premiumSpecies = species.filter((s) => s.tier === 'premium');

  const selectedSpecies =
    value?.type === 'species' ? species.find((s) => s.id === value.speciesId) ?? null : null;
  const outOfSeason =
    selectedSpecies !== null && isOutOfSeason(selectedSpecies.season_start, selectedSpecies.season_end);

  return (
    <section aria-label="Kartlager" className={`flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/90 p-3 text-card-foreground shadow-xl backdrop-blur-xl ${className}`}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Vad letar du efter?</h2>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Kartlager</span>
      </div>

      {outOfSeason && selectedSpecies?.season_start && selectedSpecies?.season_end && (
        <Alert className="border-amber-600/40 bg-amber-950/20 py-2">
          <CalendarOff className="h-4 w-4 text-amber-400" />
          <AlertTitle className="text-xs font-semibold text-amber-300">Utanför säsong</AlertTitle>
          <AlertDescription className="text-xs text-amber-200/80">
            {selectedSpecies.name_sv} har säsong {formatSeasonRange(selectedSpecies.season_start, selectedSpecies.season_end)}.
            Prognosen visas ändå, men vägs ner utanför säsong.
          </AlertDescription>
        </Alert>
      )}

      {loading && <p className="text-xs text-muted-foreground">Laddar arter…</p>}
      {loadError && (
        <p className="rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <>
          {freeSpecies.length > 0 && (
            <LayerGroup label="Gratis">
              {freeSpecies.map((s) => (
                <SpeciesButton
                  key={s.id}
                  species={s}
                  selected={isSelected({ type: 'species', speciesId: s.id, speciesName: s.name_sv, tier: s.tier })}
                  onClick={() =>
                    onChange({ type: 'species', speciesId: s.id, speciesName: s.name_sv, tier: s.tier })
                  }
                />
              ))}
            </LayerGroup>
          )}

          {premiumSpecies.length > 0 && (
            <LayerGroup label="Premium">
              {premiumSpecies.map((s) => (
                <SpeciesButton
                  key={s.id}
                  species={s}
                  selected={isSelected({ type: 'species', speciesId: s.id, speciesName: s.name_sv, tier: s.tier })}
                  onClick={() =>
                    onChange({ type: 'species', speciesId: s.id, speciesName: s.name_sv, tier: s.tier })
                  }
                />
              ))}
            </LayerGroup>
          )}

          <LayerGroup label="Väder">
            <Button
              type="button"
              variant={isSelected({ type: 'moisture' }) ? 'default' : 'ghost'}
              onClick={() => onChange({ type: 'moisture' })}
              className={buttonClasses(isSelected({ type: 'moisture' }))}
            >
              Fuktighet
            </Button>
          </LayerGroup>
        </>
      )}
    </section>
  );
}

function LayerGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="sr-only">{label}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function SpeciesButton({
  species,
  selected,
  onClick,
}: {
  species: Species;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <Button type="button" variant={selected ? 'default' : 'ghost'} onClick={onClick} className={buttonClasses(selected)}>
      {species.name_sv}
      {species.tier === 'premium' && (
        <LockKeyhole className="h-3 w-3 text-muted-foreground" aria-label="Premium" />
      )}
    </Button>
  );
}

function buttonClasses(selected: boolean): string {
  const base = 'h-9 rounded-xl px-3 text-sm shadow-none';
  return selected
    ? `${base} bg-primary text-primary-foreground hover:bg-primary/90`
    : `${base} bg-secondary/70 text-secondary-foreground hover:bg-secondary`;
}
