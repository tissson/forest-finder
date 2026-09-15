/**
 * src/components/LayerSelector.tsx
 * ===================================
 * Växlar vilket lager Map.tsx ska visa: en specifik arts prognos,
 * eller det generella fuktighetslagret (GET /layers/moisture i
 * api_server.py -- se svarstexten där den endpointen byggdes).
 */

import { useEffect, useState } from 'react';
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
    <div className={`flex flex-col gap-3 rounded-lg border border-stone-700 bg-stone-900/95 p-4 text-stone-100 ${className}`}>
      <h2 className="text-sm font-semibold text-stone-100">Lager</h2>

      {loading && <p className="text-xs text-stone-400">Laddar arter…</p>}
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
            <button
              type="button"
              onClick={() => onChange({ type: 'moisture' })}
              className={buttonClasses(isSelected({ type: 'moisture' }))}
            >
              Fuktighet
            </button>
          </LayerGroup>
        </>
      )}
    </div>
  );
}

function LayerGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs uppercase tracking-wide text-stone-500">{label}</span>
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
    <button type="button" onClick={onClick} className={buttonClasses(selected)}>
      {species.name_sv}
      {species.tier === 'premium' && (
        <span className="ml-1.5 rounded bg-amber-600/30 px-1 text-[10px] text-amber-300">PRO</span>
      )}
    </button>
  );
}

function buttonClasses(selected: boolean): string {
  const base = 'rounded-md px-3 py-1.5 text-sm transition-colors';
  return selected
    ? `${base} bg-orange-600 text-white`
    : `${base} bg-stone-800 text-stone-200 hover:bg-stone-700`;
}
