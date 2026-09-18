/**
 * Nattlig väder-ingest + prognosberäkning.
 *
 * POST /api/public/ingest-weather
 * Authorization: Bearer <LOVABLE_CRON_SECRET>
 *
 * 1. Läser alla väderzoner (5x5 km-rutor) ur databasen.
 * 2. Hämtar nederbörd (7/10 dygn) och medeltemperatur från Open-Meteo
 *    (fri, ingen API-nyckel; täcker SMHI/FMI-området via ECMWF/ICON).
 * 3. Skriver weather_observations för dagens datum.
 * 4. Anropar recompute_predictions() så att fuktighet och artprognoser
 *    räknas om för alla rutor.
 */
import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

type Zone = { id: number; center_lat: number; center_lon: number };

const CHUNK = 50;
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

function sum(values: Array<number | null>, lastN: number): number {
  const slice = values.slice(-lastN);
  return Math.round(slice.reduce<number>((a, v) => a + (v ?? 0), 0) * 10) / 10;
}

function mean(values: Array<number | null>): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, v) => a + v, 0) / nums.length) * 10) / 10;
}

async function fetchChunk(zones: Zone[]) {
  const url =
    `${OPEN_METEO}?latitude=${zones.map((z) => z.center_lat.toFixed(4)).join(',')}` +
    `&longitude=${zones.map((z) => z.center_lon.toFixed(4)).join(',')}` +
    `&daily=precipitation_sum,temperature_2m_mean&past_days=10&forecast_days=1&timezone=UTC`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Open-Meteo ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as unknown;
  // Ett enda koordinatpar ger ett objekt, flera ger en array.
  return Array.isArray(json) ? json : [json];
}

export const Route = createFileRoute('/api/public/ingest-weather')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Godkänn antingen den schemalagda nyckeln (pg_cron) eller plattformens.
        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
        const weatherSecret = process.env['WEATHER_CRON_SECRET'];
        if (!weatherSecret || token !== weatherSecret) {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');

        const { data: zones, error: zoneError } = await supabaseAdmin
          .from('weather_zones')
          .select('id, center_lat, center_lon')
          .order('id');

        if (zoneError) {
          return Response.json({ error: zoneError.message }, { status: 500 });
        }
        if (!zones || zones.length === 0) {
          return Response.json({ error: 'Inga väderzoner i databasen.' }, { status: 400 });
        }

        const obsDate = new Date().toISOString().slice(0, 10);
        const rows: Array<{
          weather_zone_id: number;
          obs_date: string;
          precip_7d_sum: number;
          precip_10d_sum: number;
          temp_mean: number | null;
        }> = [];
        const failures: string[] = [];

        for (let i = 0; i < zones.length; i += CHUNK) {
          const chunk = zones.slice(i, i + CHUNK) as Zone[];
          try {
            const results = await fetchChunk(chunk);
            results.forEach((entry, idx) => {
              const zone = chunk[idx];
              const daily = (entry as { daily?: { precipitation_sum?: Array<number | null>; temperature_2m_mean?: Array<number | null> } }).daily;
              if (!zone || !daily?.precipitation_sum) return;
              rows.push({
                weather_zone_id: zone.id,
                obs_date: obsDate,
                precip_7d_sum: sum(daily.precipitation_sum, 7),
                precip_10d_sum: sum(daily.precipitation_sum, 10),
                temp_mean: mean(daily.temperature_2m_mean ?? []),
              });
            });
          } catch (err) {
            failures.push(err instanceof Error ? err.message : String(err));
          }
        }

        if (rows.length === 0) {
          return Response.json(
            { error: 'Ingen väderdata kunde hämtas.', failures },
            { status: 502 },
          );
        }

        for (let i = 0; i < rows.length; i += 500) {
          const { error } = await supabaseAdmin
            .from('weather_observations')
            .upsert(rows.slice(i, i + 500), { onConflict: 'weather_zone_id,obs_date' });
          if (error) {
            return Response.json({ error: error.message, stage: 'upsert' }, { status: 500 });
          }
        }

        const { data: predictionRows, error: rpcError } = await supabaseAdmin.rpc(
          'recompute_predictions',
          { p_obs_date: obsDate },
        );
        if (rpcError) {
          return Response.json({ error: rpcError.message, stage: 'recompute' }, { status: 500 });
        }

        return Response.json({
          ok: true,
          obs_date: obsDate,
          zones: zones.length,
          observations_written: rows.length,
          predictions_written: predictionRows ?? 0,
          failures,
        });
      },
    },
  },
});
