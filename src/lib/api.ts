/**
 * src/lib/api.ts
 * ================
 * Datalager mot Lovable Cloud (Supabase). Ingen separat Python/FastAPI-
 * server längre -- allt går direkt mot databasen via den inloggade
 * användarens session (RLS + auth.uid()) eller mot publika tabeller.
 *
 * Funktionsnamnen och typerna här är desamma som tidigare, så
 * komponenterna behöver inte ändras.
 */

import { supabase } from './supabase';

/** Behålls för bakåtkompatibilitet -- backend är alltid konfigurerad nu. */
export const isApiConfigured = true;

// ---------------------------------------------------------------------
// Feltyper
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

export class AuthRequiredError extends ApiError {
  constructor(message: string) {
    super(401, message);
    this.name = 'AuthRequiredError';
  }
}

/** Översätter ett Postgres-/Supabase-fel till våra feltyper. */
function toApiError(message: string | undefined | null): ApiError {
  const text = message ?? 'Okänt fel mot databasen.';
  if (text.includes('PREMIUM_REQUIRED')) {
    return new PremiumRequiredError('Det här lagret ingår i premium.');
  }
  if (text.includes('AUTH_REQUIRED')) {
    return new AuthRequiredError('Du måste vara inloggad för att göra det här.');
  }
  if (text.includes('LOW_CONFIDENCE')) {
    return new ApiError(422, 'Bilden kunde inte bekräftas säkert nog.');
  }
  return new ApiError(500, text);
}

// ---------------------------------------------------------------------
// Svarstyper
// ---------------------------------------------------------------------

export interface Species {
  id: number;
  slug: string;
  name_sv: string;
  tier: 'free' | 'premium';
  season_start: string | null;
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
  metadata: { species_id: number; obs_date: string | null; count: number };
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
// Publika läsningar (fungerar utan inloggning)
// ---------------------------------------------------------------------

export async function getSpecies(): Promise<Species[]> {
  const { data, error } = await supabase
    .from('species')
    .select('id, slug, name_sv, tier, season_start, season_end')
    .order('name_sv');
  if (error) throw toApiError(error.message);
  return (data ?? []) as Species[];
}

export interface GetPredictionsOptions {
  obsDate?: string; // YYYY-MM-DD
  minScore?: number;
  limit?: number;
}

/** bbox: [minLon, minLat, maxLon, maxLat] (WGS84). */
export async function getPredictions(
  bbox: [number, number, number, number],
  speciesId: number,
  options: GetPredictionsOptions = {}
): Promise<PredictionsResponse> {
  const { data, error } = await supabase.rpc('get_predictions', {
    p_species_id: speciesId,
    p_min_lon: bbox[0],
    p_min_lat: bbox[1],
    p_max_lon: bbox[2],
    p_max_lat: bbox[3],
    p_obs_date: options.obsDate ?? null,
    p_min_score: options.minScore ?? 0.05,
    p_limit: options.limit ?? 2000,
  });
  if (error) throw toApiError(error.message);

  const rows = (data ?? []) as Array<{
    lon: number;
    lat: number;
    obs_date: string | null;
    score_total: number;
    score_soil: number | null;
    score_forest: number | null;
    score_weather: number | null;
  }>;

  return {
    type: 'FeatureCollection',
    metadata: {
      species_id: speciesId,
      obs_date: rows[0]?.obs_date ?? options.obsDate ?? null,
      count: rows.length,
    },
    features: rows.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] as [number, number] },
      properties: {
        score_total: r.score_total,
        score_soil: r.score_soil,
        score_forest: r.score_forest,
        score_weather: r.score_weather,
      },
    })),
  };
}

export async function getMoistureLayer(
  bbox: [number, number, number, number],
  obsDate?: string
): Promise<MoistureLayerResponse> {
  const { data, error } = await supabase.rpc('get_moisture_layer', {
    p_min_lon: bbox[0],
    p_min_lat: bbox[1],
    p_max_lon: bbox[2],
    p_max_lat: bbox[3],
    p_obs_date: obsDate ?? null,
    p_limit: 2000,
  });
  if (error) throw toApiError(error.message);

  const rows = (data ?? []) as Array<{
    lon: number;
    lat: number;
    obs_date: string | null;
    moisture_score: number | null;
    precip_7d_sum: number | null;
    precip_10d_sum: number | null;
    temp_mean: number | null;
  }>;

  return {
    type: 'FeatureCollection',
    metadata: { layer: 'moisture', obs_date: rows[0]?.obs_date ?? obsDate ?? null, count: rows.length },
    features: rows.map((r) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] as [number, number] },
      properties: {
        moisture_score: r.moisture_score,
        precip_7d_sum: r.precip_7d_sum,
        precip_10d_sum: r.precip_10d_sum,
        temp_mean: r.temp_mean,
      },
    })),
  };
}

export async function getCurrentChallenge(): Promise<{ active_challenge: WeeklyChallenge | null }> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('weekly_challenges')
    .select('*, species(name_sv)')
    .lte('start_date', today)
    .gte('end_date', today)
    .maybeSingle();
  if (error) throw toApiError(error.message);
  if (!data) return { active_challenge: null };

  const row = data as Record<string, unknown> & { species?: { name_sv?: string } | null };
  return {
    active_challenge: {
      id: row['id'] as number,
      year: row['year'] as number,
      week_number: row['week_number'] as number,
      species_id: row['species_id'] as number,
      species_name: row.species?.name_sv ?? '',
      bonus_points: row['bonus_points'] as number,
      badge_key: row['badge_key'] as string,
      start_date: row['start_date'] as string,
      end_date: row['end_date'] as string,
    },
  };
}

/**
 * Slår upp vilken 5x5 km-ruta en koordinat hör till. Koordinaten
 * används ENDAST för slagningen och sparas aldrig -- bara zon-id:t
 * följer med fyndet vidare.
 */
export async function lookupWeatherZone(
  lat: number,
  lon: number
): Promise<{ weather_zone_id: number }> {
  const { data, error } = await supabase.rpc('lookup_weather_zone', { p_lat: lat, p_lon: lon });
  if (error) throw toApiError(error.message);
  return { weather_zone_id: data as number };
}

// ---------------------------------------------------------------------
// Kräver inloggning (RLS gör att allt scopas till auth.uid())
// ---------------------------------------------------------------------

async function requireUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new AuthRequiredError('Du måste vara inloggad.');
  return data.user.id;
}

export async function getMyProfile(): Promise<UserProfile> {
  const { data, error } = await supabase.rpc('get_or_create_profile');
  if (error) throw toApiError(error.message);
  const row = (Array.isArray(data) ? data[0] : data) as UserProfile;
  return row;
}

export async function updateMyProfile(update: {
  display_name?: string;
  avatar_url?: string;
}): Promise<UserProfile> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('user_profiles')
    .update(update)
    .eq('user_id', userId)
    .select('user_id, display_name, avatar_url, total_points, level')
    .single();
  if (error) throw toApiError(error.message);
  return data as UserProfile;
}

export async function getMyDiscoveries(
  limit = 50,
  offset = 0
): Promise<{ discoveries: Discovery[]; limit: number; offset: number }> {
  const { data, error } = await supabase
    .from('user_discoveries')
    .select('id, species_id, weather_zone_id, image_url, ai_confidence, points_awarded, created_at, species(name_sv)')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw toApiError(error.message);

  const rows = (data ?? []) as Array<Record<string, unknown> & { species?: { name_sv?: string } | null }>;
  const discoveries: Discovery[] = rows.map((r) => ({
    id: r['id'] as number,
    species_id: r['species_id'] as number,
    species_name: r.species?.name_sv ?? '',
    weather_zone_id: r['weather_zone_id'] as number,
    image_url: r['image_url'] as string,
    ai_confidence: r['ai_confidence'] as number,
    points_awarded: r['points_awarded'] as number,
    created_at: r['created_at'] as string,
  }));
  return { discoveries, limit, offset };
}

export async function getMyBadges(): Promise<{ badges: Badge[] }> {
  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_key, title, description, icon_url, unlocked_at')
    .order('unlocked_at', { ascending: false });
  if (error) throw toApiError(error.message);
  return { badges: (data ?? []) as Badge[] };
}

/**
 * Laddar upp bilden till lagringsutrymmet (privat hink, mappad per
 * användare) och registrerar fyndet via log_species_discovery(), som
 * räknar poäng och låser upp utmärkelser server-side.
 */
export async function uploadDiscovery(params: {
  file: File;
  speciesId: number;
  weatherZoneId: number;
  aiConfidence: number;
  notes?: string | undefined;
  quantity?: string | undefined;
}): Promise<DiscoveryUploadResult> {
  const userId = await requireUserId();

  const extension = params.file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from('discoveries')
    .upload(path, params.file, {
      contentType: params.file.type || 'image/jpeg',
      upsert: false,
    });
  if (uploadError) throw toApiError(uploadError.message);

  const { data, error } = await supabase.rpc('log_species_discovery', {
    p_species_id: params.speciesId,
    p_weather_zone_id: params.weatherZoneId,
    p_image_url: path,
    p_ai_confidence: params.aiConfidence,
    p_notes: params.notes ?? null,
    p_quantity: params.quantity ?? null,
  });
  if (error) {
    await supabase.storage.from('discoveries').remove([path]);
    throw toApiError(error.message);
  }

  const row = (Array.isArray(data) ? data[0] : data) as {
    points_awarded: number;
    new_total_points: number;
    badge_unlocked: string | null;
  };

  return {
    points_awarded: row?.points_awarded ?? 0,
    new_total_points: row?.new_total_points ?? 0,
    badge_unlocked: row?.badge_unlocked ?? null,
    image_url: await getDiscoveryImageUrl(path),
  };
}

/** Skapar en tillfällig (1 h) visningslänk för en fyndbild. */
export async function getDiscoveryImageUrl(path: string): Promise<string> {
  const { data } = await supabase.storage.from('discoveries').createSignedUrl(path, 3600);
  return data?.signedUrl ?? '';
}
