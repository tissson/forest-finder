/**
 * src/components/LogDiscoveryModal.tsx
 * =======================================
 * Modal där användaren väljer art (och valfritt mängd/anteckning) för ett
 * foto från CameraCapture.tsx. Skickar via uploadDiscovery() i lib/api.ts:
 * bilden laddas upp via servern (som rensar metadata), därefter sparas fyndet
 * med databasfunktionen log_species_discovery.
 *
 * Servern identifierar arten och säkerhetsgraden; klienten kan bara bekräfta
 * en avvikande art med ett serverlagrat bedömnings-ID, aldrig egen säkerhet.
 *
 * notes/quantity sparas, max 500 respektive 100 tecken (samma gräns som i
 * databasen).
 */

import { useEffect, useState } from 'react';
import { useServerFn } from '@tanstack/react-start';
import { getSpecies, type Species, type DiscoveryUploadResult } from '../lib/api';
import { uploadDiscoveryImage } from '../lib/discoveries.functions';
import { Button } from './ui/button';

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
  const [mismatch, setMismatch] = useState<{ identificationId: string; speciesId: number; speciesName: string; confidence: number } | null>(null);
  const upload = useServerFn(uploadDiscoveryImage);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedSpeciesId(null); setManualZoneId(''); setQuantity(''); setNote(''); setError(null); setMismatch(null);
    getSpecies()
      .then(setSpecies)
      .catch(() => setError('Kunde inte hämta artlistan.'));
  }, [isOpen]);

  if (!isOpen) return null;

  const effectiveZoneId = weatherZoneId ?? (manualZoneId ? Number(manualZoneId) : null);
  const canSubmit = file !== null && selectedSpeciesId !== null && effectiveZoneId !== null && !submitting;

  const handleSubmit = async (confirm = false) => {
    if (!file || selectedSpeciesId === null || effectiveZoneId === null) return;

    setSubmitting(true);
    setError(null);
    try {
      const form = new FormData();
      if (confirm && mismatch) form.set('identificationId', mismatch.identificationId);
      else form.set('file', file);
      form.set('speciesId', String(confirm && mismatch ? mismatch.speciesId : selectedSpeciesId));
      form.set('weatherZoneId', String(effectiveZoneId));
      form.set('notes', note.trim()); form.set('quantity', quantity.trim());
      const response = await upload({ data: form });
      if (response.status === 'saved') onSuccess(response.result);
      else if (response.status === 'mismatch') setMismatch(response);
      else setError(response.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunde inte registrera fyndet.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/60 p-4" role="dialog" aria-modal="true" aria-labelledby="discovery-title">
      <div className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-card p-5 text-card-foreground">
        <h2 id="discovery-title" className="mb-4 text-lg font-semibold">Registrera fynd</h2>

        <div className="mb-4">
          <label htmlFor="discovery-species" className="mb-1 block text-xs text-muted-foreground">Art</label>
          <select
            id="discovery-species"
            disabled={submitting || mismatch !== null}
            value={selectedSpeciesId ?? ''}
            onChange={(e) => setSelectedSpeciesId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
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
            <label className="mb-1 block text-xs text-muted-foreground">
              Väderzon-ID (kunde inte fastställas automatiskt)
            </label>
            <input
              type="number"
              value={manualZoneId}
              onChange={(e) => setManualZoneId(e.target.value)}
              placeholder="Ange manuellt"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted-foreground">Mängd</label>
          <input
            type="text"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value.slice(0, MAX_QUANTITY_LENGTH))}
            placeholder="t.ex. 'en handfull'"
            maxLength={MAX_QUANTITY_LENGTH}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs text-muted-foreground">
            Anteckning ({note.length}/{MAX_NOTES_LENGTH})
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, MAX_NOTES_LENGTH))}
            rows={2}
            maxLength={MAX_NOTES_LENGTH}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        {error && (
          <p role="alert" className="mb-3 rounded border border-destructive bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
        )}

        {mismatch && <p className="mb-4 text-sm" role="status">Vi tror det här är {mismatch.speciesName}, inte {species.find(s => s.id === selectedSpeciesId)?.name_sv} ({Math.round(mismatch.confidence * 100)} % säkerhetsgrad). Vill du ändra? Fyndet är inte sparat.</p>}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            onClick={onClose}
            disabled={submitting}
            variant="ghost"
          >
            Avbryt
          </Button>
          <Button
            type="button"
            onClick={() => handleSubmit(Boolean(mismatch))}
            disabled={!canSubmit}
          >
            {submitting ? 'Kontrollerar…' : mismatch ? 'Ändra och spara' : 'Registrera fynd'}
          </Button>
        </div>
      </div>
    </div>
  );
}
