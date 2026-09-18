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
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { getPredictions, getMoistureLayer, ApiError, type LayerSelection } from '../lib/api';

setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');

const LAYER_SOURCE_ID = 'layer-source';
const LAYER_HEATMAP_ID = 'layer-grid-heatmap';
const LAYER_FILL_ID = 'layer-grid-fill';
const LAYER_OUTLINE_ID = 'layer-grid-outline';
const MOVE_DEBOUNCE_MS = 400;
const SWEDEN_BOUNDS: [[number, number], [number, number]] = [[10, 55], [24, 69]];
const GRID_CELL_KM = 5;

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: 'FeatureCollection', features: [] };

/**
 * Normaliserar VILKEN som helst av våra två lagertyper till en
 * gemensam form där coloring-värdet alltid ligger under properties.value
 * -- det gör att MapLibres paint-uttryck
 * kan vara STATISKA och alltid referera ['get', 'value'], oavsett om
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
      features: r.features.flatMap((f) => {
        const properties = { value: f.properties.score_total, ...f.properties };
        return [
          { type: 'Feature' as const, geometry: pointToGridCell(f.geometry.coordinates), properties },
          { type: 'Feature' as const, geometry: f.geometry, properties },
        ];
      }),
    };
  }
  const r = response as Awaited<ReturnType<typeof getMoistureLayer>>;
  return {
    type: 'FeatureCollection',
    features: r.features.flatMap((f) => {
      const properties = { value: f.properties.moisture_score ?? 0, ...f.properties };
      return [
        { type: 'Feature' as const, geometry: pointToGridCell(f.geometry.coordinates), properties },
        { type: 'Feature' as const, geometry: f.geometry, properties },
      ];
    }),
  };
}

/** Bygger den anonymiserade 5×5 km-rutan runt databasens zoncentrum. */
function pointToGridCell([lon, lat]: [number, number]) {
  const halfLat = (GRID_CELL_KM / 2) / 111.32;
  const halfLon = (GRID_CELL_KM / 2) / (111.32 * Math.cos((lat * Math.PI) / 180));

  return {
    type: 'Polygon' as const,
    coordinates: [[
      [lon - halfLon, lat - halfLat],
      [lon + halfLon, lat - halfLat],
      [lon + halfLon, lat + halfLat],
      [lon - halfLon, lat + halfLat],
      [lon - halfLon, lat - halfLat],
    ]],
  };
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

function mapColor(token: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

function getLayerPalette(layer: LayerSelection | null): [string, string, string] {
  if (layer?.type === 'moisture') {
    return ['--map-moisture-low', '--map-moisture-mid', '--map-moisture-high'];
  }
  const berryLayer = layer?.type === 'species' && /bär|lingon|hjortron/i.test(layer.speciesName);
  return berryLayer
    ? ['--map-berry-low', '--map-berry-mid', '--map-berry-high']
    : ['--map-mushroom-low', '--map-mushroom-mid', '--map-mushroom-high'];
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
    const source = map.getSource(LAYER_SOURCE_ID) as GeoJSONSource | undefined;

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

      source?.setData(toRenderableFeatureCollection(currentLayer, response));
      onFeatureCountChange?.(response.metadata.count);
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

    map.addControl(new NavigationControl(), 'top-right');
    map.addControl(
      new GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }),
      'top-right'
    );

    map.on('load', () => {
      map.addSource(LAYER_SOURCE_ID, { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
      const [lowToken, midToken, highToken] = getLayerPalette(layerRef.current);
      const low = mapColor(lowToken);
      const mid = mapColor(midToken);
      const high = mapColor(highToken);

      map.addLayer({
        id: LAYER_HEATMAP_ID,
        type: 'heatmap',
        source: LAYER_SOURCE_ID,
        paint: {
          'heatmap-weight': ['coalesce', ['to-number', ['get', 'value']], 0],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 5, 0.9, 9, 1.35],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 18, 9, 28],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0, 'rgba(0, 0, 0, 0)',
            0.25, low,
            0.58, mid,
            1, high,
          ],
          'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.76, 9, 0.18],
        },
      });

      map.addLayer({
        id: LAYER_FILL_ID,
        type: 'fill',
        source: LAYER_SOURCE_ID,
        paint: {
          'fill-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['to-number', ['get', 'value']], 0],
            0, low,
            0.5, mid,
            1, high,
          ],
          'fill-opacity': [
            'interpolate',
            ['linear'],
            ['coalesce', ['to-number', ['get', 'value']], 0],
            0, 0.42,
            1, 0.88,
          ],
        },
      });

      map.addLayer({
        id: LAYER_OUTLINE_ID,
        type: 'line',
        source: LAYER_SOURCE_ID,
        paint: {
          'line-color': mapColor('--map-data-outline'),
          'line-opacity': 0.72,
          'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.35, 9, 1],
        },
      });

      map.on('click', LAYER_FILL_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (feature && onFeatureClick) {
          onFeatureClick(feature.properties as Record<string, number | null>);
        }
      });
      map.on('mouseenter', LAYER_FILL_ID, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER_FILL_ID, () => {
        map.getCanvas().style.cursor = '';
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
    const map = mapRef.current;
    if (map) {
      const [lowToken, midToken, highToken] = getLayerPalette(layer);
      const low = mapColor(lowToken);
      const mid = mapColor(midToken);
      const high = mapColor(highToken);
      map.setPaintProperty(LAYER_HEATMAP_ID, 'heatmap-color', [
        'interpolate', ['linear'], ['heatmap-density'],
        0, 'rgba(0, 0, 0, 0)', 0.25, low, 0.58, mid, 1, high,
      ]);
      map.setPaintProperty(LAYER_FILL_ID, 'fill-color', [
        'interpolate', ['linear'], ['coalesce', ['to-number', ['get', 'value']], 0],
        0, low, 0.5, mid, 1, high,
      ]);
    }
    fetchAndRenderLayer();
  }, [mapReady, layer, minScore, fetchAndRenderLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !focusTarget) return;
    map.flyTo({ center: focusTarget.center, zoom: 8, duration: 900, essential: true });
  }, [focusTarget, mapReady]);

  return <div ref={containerRef} className={className} data-testid="map-container" />;
}
