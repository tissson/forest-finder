/**
 * Nattlig väder-ingest + prognosberäkning.
 *
 * POST /api/public/ingest-weather
 * Authorization: Bearer <LOVABLE_CRON_SECRET>
 *
 * 1. Läser alla väderzoner (5x5 km-rutor) ur databasen.
 * 2. Hämtar nederbörd (7/10 dygn) och medeltemperatur från Open-Meteo
 *    (fri, ingen API-nyckel; täcker SMHI/FMI-området via ECMWF/ICON).
 * 3. Skriver weather_observations för dagens datum, högst 250 provpunkter
 *    per anrop (schemat anropar routen flera gånger tills remaining = 0).
 * 4. Prognos och fuktrutor räknas om av ett separat databasjobb
 *    (nightly-weather-finalize), utan serverns tidsgränser.
 */
import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';

type Zone = { id: number; center_lat: number; center_lon: number };

const CHUNK = 50;
const BATCH = 250;
const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Inget steg får hänga tyst: avbryt med namngivet fel i stället.
function withTimeout<T>(p: PromiseLike<T>, ms: number, stage: string): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Tidsgräns i steg: ${stage}`)), ms)),
  ]);
}

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

  let res = await withTimeout(fetch(url), 30000, 'open-meteo');
  // Open-Meteo har en minutbaserad gräns -- backa av och försök igen.
  for (let attempt = 0; attempt < 3 && (res.status === 429 || res.status >= 500); attempt++) {
    await sleep(20000);
    res = await withTimeout(fetch(url), 30000, 'open-meteo');
  }
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
      GET: async () => Response.json({ route: 'ingest-weather', version: 'stepwise-1' }),
      POST: async ({ request }) => {
        // Godkänn antingen den schemalagda nyckeln (pg_cron) eller plattformens.
        const token = /^Bearer ([^\s,]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
        const weatherSecret = process.env['WEATHER_CRON_SECRET'];
        if (!weatherSecret || token !== weatherSecret) {
          const unauthorized = await authenticateCronRequest(request);
          if (unauthorized) return unauthorized;
        }

        console.log('[ingest] auth ok');
        let supabaseAdmin: Awaited<typeof import('@/integrations/supabase/client.server')>['supabaseAdmin'];
        try {
          ({ supabaseAdmin } = await withTimeout(import('@/integrations/supabase/client.server'), 15000, 'import'));
        } catch (err) {
          return Response.json({ error: String(err), stage: 'import' }, { status: 500 });
        }
        console.log('[ingest] admin client ok');
        const obsDate = new Date().toISOString().slice(0, 10);

        // Ett anrop = ett litet steg (högst BATCH provpunkter). Hela hämtningen
        // i ett anrop tog > 2 min och avbröts alltid av servern. Schemat anropar
        // routen flera gånger; varje anrop hämtar nästa provpunkter som saknar
        // dagens väder. Omräkning av prognos och fuktrutor körs sedan i databasen.
        const readAll = async <T,>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) => {
          const out: T[] = [];
          for (let page = 0; page < 40; page++) {
            const { data, error } = await withTimeout(build(page * 1000, page * 1000 + 999), 20000, 'read');
            if (error) throw new Error(error.message);
            out.push(...(data ?? []));
            if (!data || data.length < 1000) break;
          }
          return out;
        };

        let zones: Zone[];
        let done: Set<number>;
        try {
          zones = await readAll<Zone>((a, b) =>
            supabaseAdmin.from('weather_zones').select('id, center_lat, center_lon')
              .eq('is_weather_sample', true).order('id').range(a, b));
          const have = await readAll<{ weather_zone_id: number }>((a, b) =>
            supabaseAdmin.from('weather_observations').select('weather_zone_id')
              .eq('obs_date', obsDate).order('weather_zone_id').range(a, b));
          done = new Set(have.map((r) => r.weather_zone_id));
          console.log('[ingest] read ok', zones.length, done.size);
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : String(err), stage: 'read' }, { status: 500 });
        }
        if (zones.length === 0) {
          return Response.json({ error: 'Inga väderzoner i databasen.' }, { status: 400 });
        }

        const missing = zones.filter((z) => !done.has(z.id));
        const batch = missing.slice(0, BATCH);
        if (batch.length === 0) {
          return Response.json({ ok: true, obs_date: obsDate, zones: zones.length, remaining: 0 });
        }

        const rows: Array<{
          weather_zone_id: number;
          obs_date: string;
          precip_7d_sum: number;
          precip_10d_sum: number;
          temp_mean: number | null;
        }> = [];
        const failures: string[] = [];

        for (let i = 0; i < batch.length; i += CHUNK) {
          const chunk = batch.slice(i, i + CHUNK);
          if (i > 0) await sleep(1500);
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

        if (rows.length > 0) {
          const { error } = await withTimeout(
            supabaseAdmin.from('weather_observations').upsert(rows, { onConflict: 'weather_zone_id,obs_date' }),
            20000,
            'upsert',
          );
          if (error) {
            return Response.json({ error: error.message, stage: 'upsert' }, { status: 500 });
          }
        }

        return Response.json(
          {
            ok: failures.length === 0,
            obs_date: obsDate,
            zones: zones.length,
            written: rows.length,
            remaining: missing.length - rows.length,
            failures,
          },
          { status: rows.length === 0 ? 502 : 200 },
        );
      },
    },
  },
});
