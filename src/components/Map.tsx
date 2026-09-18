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
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import { getPredictions, getMoistureLayer, ApiError, type LayerSelection } from '../lib/api';

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
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
          },
        },
        layers: [{ id: 'osm-base', type: 'raster', source: 'osm' }],
      },
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
            0, 'rgba(49, 86, 58, 0)',
            0.2, '#31563a',
            0.4, '#739a48',
            0.6, '#d7b445',
            0.8, '#ef812f',
            1, '#c93624',
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
            0, '#31563a',
            0.25, '#739a48',
            0.5, '#d7b445',
            0.75, '#ef812f',
            1, '#c93624',
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
          'line-color': '#263c2c',
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
    fetchAndRenderLayer();
  }, [mapReady, layer, minScore, fetchAndRenderLayer]);

  return <div ref={containerRef} className={className} data-testid="map-container" />;
}
