/**
 * src/lib/api.ts
 * ================
 * Klient mot vår egen FastAPI-backend (api_server.py). Bifogar
 * Supabase-JWT:n automatiskt som Authorization-header på ALLA anrop
 * (anonyma requests fungerar ändå -- backend behandlar avsaknad av
 * header som "anonym/gratis", se get_current_user() i api_server.py).
 *
 * Miljövariabel: VITE_API_BASE_URL (t.ex. https://api.dittdomän.se
 * eller http://localhost:8000 lokalt).
 *
 * Typerna nedan är medvetet skrivna för att matcha api_server.py:s
 * Pydantic-svarsmodeller FÄLT FÖR FÄLT -- om ni ändrar en respons-
 * modell i backend, uppdatera motsvarande interface här också.
 */

import { getAccessToken, supabase } from './supabase';

const API_BASE_URL = import.meta.env['VITE_API_BASE_URL'] as string | undefined;

export const isApiConfigured = Boolean(API_BASE_URL);

if (!isApiConfigured) {
  // Kastar INTE vid import -- appen ska kunna renderas innan
  // VITE_API_BASE_URL är satt; anropen misslyckas tills dess.
  console.warn('Saknar VITE_API_BASE_URL -- sätt den i .env (se .env.example).');
}

// ---------------------------------------------------------------------
// Feltyper -- gör det möjligt för UI att skilja "kräver premium" (403)
// från övriga fel utan att behöva tolka statuskoder på anropsplatsen.
// ---------------------------------------------------------------------

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export class PremiumRequiredError extends ApiError {
  constructor(message: string) {
    super(403, message);
    this.name = 'PremiumRequiredError';
  }
}

// ---------------------------------------------------------------------
// Svarstyper -- matchar api_server.py:s Pydantic-modeller/dict-svar.
// ---------------------------------------------------------------------

export interface Species {
  id: number;
  slug: string;
  name_sv: string;
  tier: 'free' | 'premium';
  season_start: string | null; // ISO-datum (YYYY-MM-DD)
  season_end: string | null;
}

export interface PredictionFeatureProperties {
  score_total: number;
  score_soil: number | null;
  score_forest: number | null;
  score_weather: number | null;
}

export interface PredictionFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] }; // [lon, lat]
  properties: PredictionFeatureProperties;
}

export interface PredictionsResponse {
  type: 'FeatureCollection';
  metadata: {
    species_id: number;
    obs_date: string | null;
    count: number;
  };
  features: PredictionFeature[];
}

export interface UserProfile {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  total_points: number;
  level: number;
}

export interface Discovery {
  id: number;
  species_id: number;
  species_name: string;
  weather_zone_id: number;
  image_url: string;
  ai_confidence: number;
  points_awarded: number;
  created_at: string;
}

export interface Badge {
  badge_key: string;
  title: string;
  description: string | null;
  icon_url: string | null;
  unlocked_at: string;
}

export interface WeeklyChallenge {
  id: number;
  year: number;
  week_number: number;
  species_id: number;
  species_name: string;
  bonus_points: number;
  badge_key: string;
  start_date: string;
  end_date: string;
}

export interface DiscoveryUploadResult {
  points_awarded: number;
  new_total_points: number;
  badge_unlocked: string | null;
  image_url: string;
}

// ---------------------------------------------------------------------
// Lagerval -- delad typ mellan LayerSelector.tsx och Map.tsx, definierad
// här (i datalagret) snarare än i en UI-komponent, så båda kan importera
// från samma ställe utan att komponenter behöver känna till varandra.
// ---------------------------------------------------------------------

export type LayerSelection =
  | { type: 'species'; speciesId: number; speciesName: string; tier: 'free' | 'premium' }
  | { type: 'moisture' };

export interface MoistureFeatureProperties {
  moisture_score: number | null;
  precip_7d_sum: number | null;
  precip_10d_sum: number | null;
  temp_mean: number | null;
}

export interface MoistureFeature {
  type: 'Feature';
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: MoistureFeatureProperties;
}

export interface MoistureLayerResponse {
  type: 'FeatureCollection';
  metadata: { layer: 'moisture'; obs_date: string | null; count: number };
  features: MoistureFeature[];
}

// ---------------------------------------------------------------------
// Kärnhjälpare: sköter bas-URL, JWT-header, JSON-parsing och en (1)
// automatisk retry vid 401 efter explicit sessionsförnyelse.
// ---------------------------------------------------------------------

async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  allowRetryOn401 = true
): Promise<T> {
  const token = await getAccessToken();

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  // FormData sätter sin egen Content-Type (med boundary) -- rör den inte.
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });

  if (response.status === 401 && allowRetryOn401) {
    // Kan bero på att access-token gick ut exakt vid detta anrop,
    // innan Supabases bakgrundsförnyelse hann agera. Försök EN gång
    // till efter en explicit refresh -- annars, ge upp och låt felet
    // gå vidare (t.ex. för att visa en "logga in igen"-vy).
    const { data: refreshed } = await supabase.auth.refreshSession();
    if (refreshed.session) {
      return apiFetch<T>(path, options, false);
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    const message = typeof body?.detail === 'string' ? body.detail : `HTTP ${response.status}`;
    if (response.status === 403) {
      throw new PremiumRequiredError(message);
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

// ---------------------------------------------------------------------
// Publika endpoints (fungerar utan inloggning)
// ---------------------------------------------------------------------

export function getSpecies(): Promise<Species[]> {
  return apiFetch<Species[]>('/species');
}

export interface GetPredictionsOptions {
  obsDate?: string; // YYYY-MM-DD, default = senaste tillgängliga
  minScore?: number; // default 0.05, matchar backendens default
  limit?: number;
}

/**
 * bbox: [minLon, minLat, maxLon, maxLat] (WGS84) -- t.ex. från
 * MapLibres map.getBounds() i Map.tsx.
 */
export function getPredictions(
  bbox: [number, number, number, number],
  speciesId: number,
  options: GetPredictionsOptions = {}
): Promise<PredictionsResponse> {
  const params = new URLSearchParams({
    bbox: bbox.join(','),
    species_id: String(speciesId),
  });
  if (options.obsDate) params.set('obs_date', options.obsDate);
  if (options.minScore !== undefined) params.set('min_score', String(options.minScore));
  if (options.limit !== undefined) params.set('limit', String(options.limit));

  return apiFetch<PredictionsResponse>(`/predictions?${params.toString()}`);
}

export function getCurrentChallenge(): Promise<{ active_challenge: WeeklyChallenge | null }> {
  return apiFetch('/challenges/current');
}

export function getMoistureLayer(
  bbox: [number, number, number, number],
  obsDate?: string
): Promise<MoistureLayerResponse> {
  const params = new URLSearchParams({ bbox: bbox.join(',') });
  if (obsDate) params.set('obs_date', obsDate);
  return apiFetch<MoistureLayerResponse>(`/layers/moisture?${params.toString()}`);
}

/**
 * Slår upp weather_zone_id för en koordinat. Koordinaten skickas EN
 * gång för denna slagning och sparas ALDRIG server-side (se
 * /zones/lookup i api_server.py) -- använd resultatet, kasta
 * koordinaten. Skicka ALDRIG lat/lon vidare till uploadDiscovery().
 */
export function lookupWeatherZone(lat: number, lon: number): Promise<{ weather_zone_id: number }> {
  return apiFetch(`/zones/lookup?lat=${lat}&lon=${lon}`);
}

// ---------------------------------------------------------------------
// Endpoints som kräver inloggning (backend svarar 401 annars)
// ---------------------------------------------------------------------

export function getMyProfile(): Promise<UserProfile> {
  return apiFetch<UserProfile>('/user/profile');
}

export function updateMyProfile(update: {
  display_name?: string;
  avatar_url?: string;
}): Promise<UserProfile> {
  return apiFetch<UserProfile>('/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(update),
  });
}

export function getMyDiscoveries(
  limit = 50,
  offset = 0
): Promise<{ discoveries: Discovery[]; limit: number; offset: number }> {
  return apiFetch(`/user/discoveries?limit=${limit}&offset=${offset}`);
}

export function getMyBadges(): Promise<{ badges: Badge[] }> {
  return apiFetch('/user/badges');
}

/**
 * OBS: ai_confidence måste redan vara beräknad INNAN detta anrop --
 * ingen AI-bildklassificering byggs här (se api_server.py:s docstring
 * för /discoveries). Detta anrop hanterar bara upload + EXIF-strippning
 * + poänglogik server-side.
 */
export function uploadDiscovery(params: {
  file: File;
  speciesId: number;
  weatherZoneId: number;
  aiConfidence: number;
  notes?: string | undefined;
  quantity?: string | undefined;
}): Promise<DiscoveryUploadResult> {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append('species_id', String(params.speciesId));
  formData.append('weather_zone_id', String(params.weatherZoneId));
  formData.append('ai_confidence', String(params.aiConfidence));
  if (params.notes) formData.append('notes', params.notes);
  if (params.quantity) formData.append('quantity', params.quantity);

  return apiFetch<DiscoveryUploadResult>('/discoveries', {
    method: 'POST',
    body: formData,
  });
}
