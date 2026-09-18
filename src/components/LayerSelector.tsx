/**
 * src/components/LayerSelector.tsx
 * ===================================
 * Växlar vilket lager Map.tsx ska visa: en specifik arts prognos,
 * eller det generella fuktighetslagret (GET /layers/moisture i
 * api_server.py -- se svarstexten där den endpointen byggdes).
 */

import { useEffect, useState } from 'react';
import { LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getSpecies, type Species, type LayerSelection } from '../lib/api';

export type { LayerSelection };

export interface LayerSelectorProps {
  value: LayerSelection | null;
  onChange: (selection: LayerSelection) => void;
  className?: string;
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

  return (
    <section aria-label="Kartlager" className={`flex flex-col gap-3 rounded-2xl border border-border/70 bg-card/90 p-3 text-card-foreground shadow-xl backdrop-blur-xl ${className}`}>
      <div className="flex items-center justify-between px-1">
        <h2 className="text-sm font-semibold">Vad letar du efter?</h2>
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">Kartlager</span>
      </div>

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
