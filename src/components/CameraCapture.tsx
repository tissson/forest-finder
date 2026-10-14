/**
 * src/components/CameraCapture.tsx
 * ===================================
 * Tar/väljer ett foto, komprimerar det i webbläsaren och slår upp vilken
 * weather_zone_id (5x5 km-ruta) positionen tillhör. Råa koordinater skickas
 * aldrig till databasen – bara zon-id:t sparas med fyndet.
 *
 * GPS-KÄLLA: webbläsarens Geolocation-API i första hand, bildens EXIF-GPS
 * (paketet 'exifr') som reserv. Koordinaterna används bara lokalt för att
 * hitta zonen via lookup_weather_zone.
 *
 * METADATA: canvas.toBlob() skriver aldrig EXIF, så komprimeringen tar redan
 * bort GPS ur bilden. Det är bara ett första skydd. Den auktoritativa spärren
 * ligger på servern: uploadDiscoveryImage (src/lib/discoveries.functions.ts)
 * rensar all metadata ur varje bild innan den sparas, och webbläsaren får inte
 * ladda upp direkt till lagringen.
 *
 * { imageOrientation: 'from-image' } behövs så att stående mobilfoton inte
 * blir liggande efter komprimeringen (createImageBitmap följer annars inte
 * EXIF-orienteringen konsekvent mellan webbläsare).
 */

import { useCallback, useRef, useState } from 'react';
import { lookupWeatherZone } from '../lib/api';

const MAX_DIMENSION_PX = 1600;
const JPEG_QUALITY = 0.82;
const GEOLOCATION_TIMEOUT_MS = 8000;

export type CaptureStatus =
  | { phase: 'idle' }
  | { phase: 'processing' }
  | { phase: 'locating' }
  | { phase: 'ready'; file: File; previewUrl: string; weatherZoneId: number | null }
  | { phase: 'error'; message: string };

export interface CameraCaptureProps {
  onReady?: (result: { file: File; weatherZoneId: number | null }) => void;
  className?: string;
}

async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, MAX_DIMENSION_PX / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Kunde inte skapa canvas-kontext för bildkomprimering.');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('Bildkomprimering misslyckades.');

  const newName = file.name.replace(/\.[^./]+$/, '') + '.jpg';
  return new File([blob], newName, { type: 'image/jpeg' });
}

function getBrowserLocation(): Promise<{ lat: number; lon: number } | null> {
  if (!('geolocation' in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null), // nekad/misslyckad -- fall tillbaka på EXIF, se anroparen
      { enableHighAccuracy: true, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 60_000 }
    );
  });
}

async function getExifLocation(file: File): Promise<{ lat: number; lon: number } | null> {
  try {
    // Dynamisk import -- exifr behövs bara i detta (mindre vanliga)
    // fallback-fall, ingen anledning att dra in det i huvudbundlen.
    const exifr = await import('exifr');
    const gps = await exifr.gps(file);
    if (!gps || typeof gps.latitude !== 'number' || typeof gps.longitude !== 'number') return null;
    return { lat: gps.latitude, lon: gps.longitude };
  } catch {
    return null; // ingen/oläsbar EXIF -- helt normalt, inte ett fel
  }
}

export function CameraCapture({ onReady, className = '' }: CameraCaptureProps) {
  const [status, setStatus] = useState<CaptureStatus>({ phase: 'idle' });
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileSelected = useCallback(
    async (rawFile: File) => {
      setStatus({ phase: 'processing' });

      let compressed: File;
      try {
        compressed = await compressImage(rawFile);
      } catch (err) {
        setStatus({ phase: 'error', message: err instanceof Error ? err.message : 'Kunde inte bearbeta bilden.' });
        return;
      }

      setStatus({ phase: 'locating' });

      // Webbläsarpositionering FÖRST (mer tillförlitlig än ett fotos
      // EXIF, som kan vara gammal), EXIF som fallback.
      const coords = (await getBrowserLocation()) ?? (await getExifLocation(rawFile));

      let weatherZoneId: number | null = null;
      if (coords) {
        try {
          const result = await lookupWeatherZone(coords.lat, coords.lon);
          weatherZoneId = result.weather_zone_id;
        } catch {
          // Utanför täckt område, nätverksfel, etc -- inte fatalt, låt
          // användaren välja zon manuellt i nästa steg (LogDiscoveryModal
          // bör hantera weatherZoneId === null genom att kräva manuellt val).
          weatherZoneId = null;
        }
      }

      const previewUrl = URL.createObjectURL(compressed);
      setStatus({ phase: 'ready', file: compressed, previewUrl, weatherZoneId });
      onReady?.({ file: compressed, weatherZoneId });
    },
    [onReady]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelected(file);
    e.target.value = ''; // tillåt att välja SAMMA fil igen senare
  };

  const reset = () => {
    if (status.phase === 'ready') URL.revokeObjectURL(status.previewUrl);
    setStatus({ phase: 'idle' });
  };

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleInputChange}
        className="hidden"
      />

      {status.phase === 'idle' && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-lg bg-orange-600 px-5 py-3 text-sm font-medium text-white hover:bg-orange-500"
        >
          📷 Ta eller välj foto
        </button>
      )}

      {(status.phase === 'processing' || status.phase === 'locating') && (
        <div className="flex flex-col items-center gap-2 text-sm text-stone-300">
          <span className="h-6 w-6 animate-spin rounded-full border-2 border-stone-600 border-t-orange-500" />
          <span>{status.phase === 'processing' ? 'Bearbetar bild…' : 'Hittar din plats…'}</span>
        </div>
      )}

      {status.phase === 'ready' && (
        <div className="flex flex-col items-center gap-2">
          <img
            src={status.previewUrl}
            alt="Förhandsvisning av fyndet"
            className="max-h-64 rounded-lg border border-stone-700 object-cover"
          />
          <p className="text-xs text-stone-400">
            {status.weatherZoneId !== null
              ? `Väderzon hittad (id ${status.weatherZoneId})`
              : 'Kunde inte fastställa väderzon -- välj manuellt i nästa steg.'}
          </p>
          <button type="button" onClick={reset} className="text-xs text-stone-500 underline hover:text-stone-300">
            Ta om
          </button>
        </div>
      )}

      {status.phase === 'error' && (
        <div className="flex flex-col items-center gap-2">
          <p className="rounded border border-red-800 bg-red-950/50 p-2 text-xs text-red-300">{status.message}</p>
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-stone-800 px-4 py-2 text-sm text-stone-200 hover:bg-stone-700"
          >
            Försök igen
          </button>
        </div>
      )}
    </div>
  );
}
