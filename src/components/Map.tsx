/**
 * src/components/Map.tsx
 * ========================
 * Interaktiv karta som visar ANTINGEN en arts prognos (score_total)
 * ELLER det generella fuktighetslagret (moisture_score), beroende på
 * `layer`-propen -- samma union-typ som LayerSelector.tsx producerar
 * (LayerSelection, definierad i lib/api.ts).
 *
 * VIKTIGT för Lovable/Vite: kräver paketet 'maplibre-gl' (npm install
 * maplibre-gl) -- se importförklaring i svarstexten, INKLUSIVE att
 * senaste versionen (6.x) INTE har ett default export längre.
 *
 * VANLIGASTE FELET vid MapLibre-i-React: kartan blir blank/0px hög
 * eftersom container-diven saknar en EXPLICIT höjd. className-propen
 * default:ar till 'h-full w-full' -- FÖRÄLDERN måste i sin tur ha en
 * definierad höjd, annars förblir "h-full" 0px.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Map as MapLibreMap,
  NavigationControl,
  GeolocateControl,
  setWorkerUrl,
  type GeoJSONSource,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { getPredictions, getMoistureLayer, ApiError, type LayerSelection } from '../lib/api';
import swedenLandData from '../data/sweden-land.json';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const PREDICTIONS_SOURCE_ID = 'predictions-source';
const MOVE_DEBOUNCE_MS = 400;
const SWEDEN_BOUNDS: [[number, number], [number, number]] = [[10, 55], [24, 69]];
const MIN_VISIBLE_VALUE = 0.08;
const SWEDEN_LAND = swedenLandData as unknown as Feature<Polygon | MultiPolygon>;

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Bygger en cirka 5×5 km stor zon runt väderpunktens centrum. */
function pointToZonePolygon(coordinates: [number, number]): Polygon {
  const [longitude, latitude] = coordinates;

  // Robusta gradsteg för Norden (~60°N) med täckning och överlapp
  const halfLat = 0.035; // ~3.8 km
  const halfLon = 0.065; // ~3.6 km

  return {
    type: 'Polygon',
    coordinates: [[
      [longitude - halfLon, latitude - halfLat],
      [longitude + halfLon, latitude - halfLat],
      [longitude + halfLon, latitude + halfLat],
      [longitude - halfLon, latitude + halfLat],
      [longitude - halfLon, latitude - halfLat],
    ]],
  };
}

/**
 * Normaliserar VILKEN som helst av våra två lagertyper till en
 * gemensam form där heatmap-vikten alltid ligger under properties.score
 * -- det gör att MapLibres paint-uttryck kan vara statiskt och alltid
 * referera ['get', 'score'], oavsett om
 * det är score_total (art) eller moisture_score (fuktighet) som visas.
 * Originalfälten behålls också, så onFeatureClick fortfarande får
 * fullständig detalj (score_soil/score_forest/etc, eller
 * precip_7d_sum/temp_mean/etc).
 */
function toRenderableFeatureCollection(
  layer: LayerSelection,
  response: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>
): FeatureCollection {
  if (layer.type === 'species') {
    const r = response as Awaited<ReturnType<typeof getPredictions>>;
    return {
      type: 'FeatureCollection',
      features: r.features.filter((f) => (
        f.properties.score_total > MIN_VISIBLE_VALUE
        && (f.properties.score_forest ?? 0) > 0
        && isOnSwedishLand(f.geometry.coordinates)
      )).map((f) => ({
        type: 'Feature' as const,
        geometry: pointToZonePolygon(f.geometry.coordinates),
        properties: { ...f.properties, score: f.properties.score_total },
      })),
    };
  }
  const r = response as Awaited<ReturnType<typeof getMoistureLayer>>;
  return {
    type: 'FeatureCollection',
    features: r.features.filter((f) => (
      (f.properties.moisture_score ?? 0) > MIN_VISIBLE_VALUE
      && isOnSwedishLand(f.geometry.coordinates)
    )).map((f) => ({
      type: 'Feature' as const,
      geometry: pointToZonePolygon(f.geometry.coordinates),
      properties: { ...f.properties, score: f.properties.moisture_score ?? 0 },
    })),
  };
}

/** Tar bort hav och större insjöar med en lokal landmask för Sverige. */
function isOnSwedishLand(coordinates: [number, number]): boolean {
  return booleanPointInPolygon(point(coordinates), SWEDEN_LAND);
}

export interface MapProps {
  /** Vilket lager som ska visas. null = inget lager ritas. */
  layer: LayerSelection | null;
  /** Filtrerar bort celler under detta score_total (gäller bara artlagret). Default 0.05. */
  minScore?: number;
  onError?: (error: ApiError) => void;
  /** Anropas efter varje lyckad hämtning, t.ex. för att visa "N träffar". */
  onFeatureCountChange?: (count: number) => void;
  /** Löst typad -- fältnamnen skiljer sig mellan art-/fuktighetslagret, se toRenderableFeatureCollection. */
  onFeatureClick?: (properties: Record<string, number | null>) => void;
  className?: string;
  initialCenter?: [number, number];
  initialZoom?: number;
  focusTarget?: { center: [number, number]; key: number } | null;
}

export function Map({
  layer,
  minScore = 0.05,
  onError,
  onFeatureCountChange,
  onFeatureClick,
  className = 'relative h-full w-full',
  initialCenter = [15, 62],
  initialZoom = 5,
  focusTarget = null,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Refs så att den EN-gång-registrerade moveend-lyssnaren alltid läser
  // AKTUELLA prop-värden istället för de som gällde vid mount.
  const layerRef = useRef(layer);
  const minScoreRef = useRef(minScore);
  layerRef.current = layer;
  minScoreRef.current = minScore;

  const fetchAndRenderLayer = useCallback(async () => {
    const map = mapRef.current;
    if (!map) return;

    const currentLayer = layerRef.current;
    const source = map.getSource(PREDICTIONS_SOURCE_ID) as GeoJSONSource | undefined;

    if (currentLayer === null) {
      source?.setData(EMPTY_FEATURE_COLLECTION);
      onFeatureCountChange?.(0);
      return;
    }

    const bounds = map.getBounds();
    const bbox: [number, number, number, number] = [
      bounds.getWest(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getNorth(),
    ];
    try {
      const response =
        currentLayer.type === 'species'
          ? await getPredictions(bbox, currentLayer.speciesId, { minScore: minScoreRef.current })
          : await getMoistureLayer(bbox);

      const rendered = toRenderableFeatureCollection(currentLayer, response);
      source?.setData(rendered);
      onFeatureCountChange?.(rendered.features.length);
    } catch (err) {
      onError?.(err instanceof ApiError ? err : new ApiError(0, err instanceof Error ? err.message : 'Okänt fel'));
      source?.setData(EMPTY_FEATURE_COLLECTION);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- se refs ovan
  }, [onError, onFeatureCountChange]);

  const scheduleFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchAndRenderLayer, MOVE_DEBOUNCE_MS);
  }, [fetchAndRenderLayer]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      center: initialCenter,
      zoom: initialZoom,
      maxBounds: SWEDEN_BOUNDS,
    });

    if (!window.matchMedia('(max-width: 767px)').matches) {
      map.addControl(new NavigationControl(), 'top-right');
    }
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      'bottom-right'
    );

    map.on('load', () => {
      map.addSource(PREDICTIONS_SOURCE_ID, { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });

      map.addLayer({
        id: 'predictions-zone-fill',
        type: 'fill',
        source: PREDICTIONS_SOURCE_ID,
        paint: {
          'fill-color': [
            'interpolate',
            ['cubic-bezier', 0.42, 0, 0.58, 1],
            ['get', 'score'],
            0.00, 'transparent',
            0.15, 'rgba(147, 197, 253, 0.35)',
            0.40, 'rgba(52, 211, 153, 0.55)',
            0.70, 'rgba(251, 146, 60, 0.75)',
            0.90, 'rgba(225, 29, 72, 0.85)',
          ],
          'fill-outline-color': 'transparent',
          'fill-opacity': 0.78,
        },
      });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initieras avsiktligt bara en gång
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.on('moveend', scheduleFetch);
    return () => {
      map.off('moveend', scheduleFetch);
    };
  }, [mapReady, scheduleFetch]);

  useEffect(() => {
    if (!mapReady) return;
    fetchAndRenderLayer();
  }, [mapReady, layer, minScore, fetchAndRenderLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusTarget) return;
    map.flyTo({ center: focusTarget.center, zoom: 8, duration: 900, essential: true });
  }, [focusTarget, mapReady]);

  return <div ref={containerRef} className={className} data-testid="map-container" />;
}
