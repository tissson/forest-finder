/**
 * src/components/LogDiscoveryModal.tsx
 * =======================================
 * Modal där användaren väljer art (och valfritt mängd/anteckning)
 * för ett foto som redan capturats av CameraCapture.tsx, och skickar
 * det till POST /discoveries.
 *
 * TVÅ SAKER ATT KÄNNA TILL:
 *
 * 1. RÄTT ENDPOINT-SÖKVÄG: den faktiska, byggda endpointen heter
 *    "/discoveries" (ingen /api-prefix) -- se uploadDiscovery() i lib/api.ts.
 *
 * 2. ai_confidence=1.0 FÖR MANUELLA FYND: /discoveries kräver
 *    ai_confidence >= 0.700 (se log_species_discovery). Eftersom
 *    ingen AI-klassificeringsmodell finns byggd än skickar denna modal
 *    ai_confidence=1.0 för manuellt valda arter -- ett medvetet
 *    produktbeslut (bekräftat), inte en neutral implementationsdetalj.
 *
 * notes/quantity SPARAS nu på riktigt (se migration_add_discovery_notes.sql
 * + den uppdaterade /discoveries-endpointen i api_server.py) -- max
 * 500 respektive 100 tecken, samma gräns som databasens CHECK-constraints.
 */

import { useEffect, useState } from 'react';
import { getSpecies, uploadDiscovery, type Species, type DiscoveryUploadResult } from '../lib/api';

const MANUAL_ENTRY_CONFIDENCE = 1.0; // se punkt 2 i filhuvudet
const MAX_NOTES_LENGTH = 500;
const MAX_QUANTITY_LENGTH = 100;

export interface LogDiscoveryModalProps {
  isOpen: boolean;
  file: File | null;
  weatherZoneId: number | null;
  onClose: () => void;
  onSuccess: (result: DiscoveryUploadResult) => void;
}

export function LogDiscoveryModal({ isOpen, file, weatherZoneId, onClose, onSuccess }: LogDiscoveryModalProps) {
  const [species, setSpecies] = useState<Species[]>([]);
  const [selectedSpeciesId, setSelectedSpeciesId] = useState<number | null>(null);
  const [manualZoneId, setManualZoneId] = useState<string>('');
  const [quantity, setQuantity] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    getSpecies()
      .then(setSpecies)
      .catch(() => setError('Kunde inte hämta artlistan.'));
  }, [isOpen]);

  if (!isOpen) return null;

  const effectiveZoneId = weatherZoneId ?? (manualZoneId ? Number(manualZoneId) : null);
  const canSubmit = file !== null && selectedSpeciesId !== null && effectiveZoneId !== null && !submitting;

  const handleSubmit = async () => {
    if (!file || selectedSpeciesId === null || effectiveZoneId === null) return;

    setSubmitting(true);
    setError(null);
    try {
      const result = await uploadDiscovery({
        file,
        speciesId: selectedSpeciesId,
        weatherZoneId: effectiveZoneId,
        aiConfidence: MANUAL_ENTRY_CONFIDENCE,
        notes: note.trim() || undefined,
        quantity: quantity.trim() || undefined,
      });
      onSuccess(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte registrera fyndet.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-xl border border-stone-700 bg-stone-900 p-5 text-stone-100">
        <h2 className="mb-4 text-lg font-semibold">Registrera fynd</h2>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-stone-400">Art</label>
          <select
            value={selectedSpeciesId ?? ''}
            onChange={(e) => setSelectedSpeciesId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-sm"
          >
            <option value="">Välj art…</option>
            {species.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name_sv}
              </option>
            ))}
          </select>
        </div>

        {weatherZoneId === null && (
          <div className="mb-4">
            <label className="mb-1 block text-xs text-stone-400">
              Väderzon-ID (kunde inte fastställas automatiskt)
            </label>
            <input
              type="number"
              value={manualZoneId}
              onChange={(e) => setManualZoneId(e.target.value)}
              placeholder="Ange manuellt"
              className="w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs text-stone-400">Mängd</label>
          <input
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.slice(0, MAX_QUANTITY_LENGTH))}
            placeholder="t.ex. 'en handfull'"
            maxLength={MAX_QUANTITY_LENGTH}
            className="w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-sm"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-stone-400">
            Anteckning ({note.length}/{MAX_NOTES_LENGTH})
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTES_LENGTH))}
            rows={2}
            maxLength={MAX_NOTES_LENGTH}
            className="w-full rounded-md border border-stone-700 bg-stone-800 px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p className="mb-3 rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm text-stone-400 hover:text-stone-200"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Skickar…' : 'Registrera fynd'}
          </button>
        </div>
      </div>
    </div>
  );
}
