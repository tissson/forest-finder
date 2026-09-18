/**
 * src/components/Map.tsx
 * =======================
 * Kartkomponent med MapLibre GL JS: fasta prognosrutor, klick-hantering,
 * GPS-positionering och gränser för Sverige. Rutor filtreras mot en svensk
 * landmask (havs- och sjörutor ritas aldrig) och värden under tröskeln är
 * helt transparenta.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  GeolocateControl,
  type GeoJSONSource,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type {
  Feature,
  FeatureCollection,
  GeoJsonProperties,
  Point,
  Polygon,
} from "geojson";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

import {
  getPredictions,
  getMoistureLayer,
  getPredictionLodOptions,
  ApiError,
} from "../lib/api";
import type { LayerSelection } from "../lib/api";

interface MapProps {
  layer?: LayerSelection | null;
  obsDate?: string;
  onError?: (error: ApiError) => void;
  onFeatureCountChange?: (count: number | null) => void;
  focusTarget?: { center: [number, number]; key: number } | null;
  onCellClick?: (cellData: Record<string, unknown>) => void;
}

const PREDICTIONS_SOURCE_ID = "predictions-source";
const GRID_FILL_LAYER_ID = "fungi-grid-fill";
const MIN_VISIBLE_VALUE = 0.01;
const MIN_MAP_ZOOM = 4.5;
const MAX_MAP_ZOOM = 16;
const FALLBACK_CELL_SPAN_DEGREES = 0.04;
const MAP_FETCH_DEBOUNCE_MS = 300;

// Sveriges geografiska begränsning [SW, NE]
const SWEDEN_BOUNDS: LngLatBoundsLike = [
  [10.5, 55.2],
  [24.2, 69.1],
];

// ---------------------------------------------------------------------
// Svensk landmask (havs- och sjöfiltrering)
// ---------------------------------------------------------------------
type LandMask = Feature<Polygon, GeoJsonProperties> | null;
let landMaskPromise: Promise<LandMask> | null = null;

function loadSwedenLandMask(): Promise<LandMask> {
  if (!landMaskPromise) {
    landMaskPromise = fetch("/sweden-landmask.json")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => (data ?? null) as LandMask)
      .catch((err) => {
        console.warn("Kunde inte ladda svensk landmask:", err);
        return null;
      });
  }
  return landMaskPromise;
}

function isOnSwedishLand([lng, lat]: [number, number], landMask: LandMask): boolean {
  if (!landMask) return true; // landmask saknas → filtrera inte bort någonting
  return booleanPointInPolygon([lng, lat], landMask);
}

// ---------------------------------------------------------------------
// Sömlös gittergeometri: varje punkt täcker sin cell (kant-i-kant)
// ---------------------------------------------------------------------
function getCellBounds(values: number[], value: number): [number, number] {
  const index = values.indexOf(value);
  if (index < 0 || values.length === 1) {
    const halfSpan = FALLBACK_CELL_SPAN_DEGREES / 2;
    return [value - halfSpan, value + halfSpan];
  }

  const previous = values[index - 1];
  const next = values[index + 1];
  const lower = previous === undefined
    ? value - ((next ?? value + FALLBACK_CELL_SPAN_DEGREES) - value) / 2
    : (previous + value) / 2;
  const upper = next === undefined
    ? value + (value - (previous ?? value - FALLBACK_CELL_SPAN_DEGREES)) / 2
    : (value + next) / 2;
  return [lower, upper];
}

type GridIndex = {
  latitudes: number[];
  longitudesByLatitude: globalThis.Map<number, number[]>;
};

const gridIndexCache = new WeakMap<object, GridIndex>();

function getGridIndex(features: Array<Feature<Point, GeoJsonProperties>>): GridIndex {
  const cached = gridIndexCache.get(features);
  if (cached) return cached;

  const latitudeValues = features.flatMap((feature) => {
    const latitude = feature.geometry.coordinates[1];
    return typeof latitude === "number" ? [latitude] : [];
  });
  const latitudes = [...new Set<number>(latitudeValues)].sort((a, b) => a - b);
  const longitudesByLatitude = new globalThis.Map<number, number[]>();

  for (const feature of features) {
    const longitude = feature.geometry.coordinates[0];
    const latitude = feature.geometry.coordinates[1];
    if (longitude === undefined || latitude === undefined) continue;
    const row = longitudesByLatitude.get(latitude) ?? [];
    row.push(longitude);
    longitudesByLatitude.set(latitude, row);
  }

  for (const [latitude, longitudes] of longitudesByLatitude) {
    longitudesByLatitude.set(latitude, [...new Set(longitudes)].sort((a, b) => a - b));
  }

  const index: GridIndex = { latitudes, longitudesByLatitude };
  gridIndexCache.set(features, index);
  return index;
}

/**
 * Beräknar den sömlösa cell-polygonen för en punkt utifrån mittpunkterna
 * mellan verkliga grannkoordinater i det fulla features-setet.
 */
function calculateBoundingPolygon(
  coordinates: [number, number],
  features: Array<Feature<Point, GeoJsonProperties>>,
): Polygon {
  const { latitudes, longitudesByLatitude } = getGridIndex(features);
  const [longitude, latitude] = coordinates;

  const rowLongitudes = longitudesByLatitude.get(latitude) ?? [longitude];
  const [west, east] = getCellBounds(rowLongitudes, longitude);
  const [south, north] = getCellBounds(latitudes, latitude);

  return {
    type: "Polygon",
    coordinates: [[
      [west, south],
      [east, south],
      [east, north],
      [west, north],
      [west, south],
    ]],
  };
}

// ---------------------------------------------------------------------
// Renderbar FeatureCollection: landmask + tröskel + sömlösa celler
// ---------------------------------------------------------------------
function toRenderableFeatureCollection(
  layer: LayerSelection,
  response: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>,
  landMask: LandMask,
): FeatureCollection<Polygon, GeoJsonProperties> {
  if (layer.type === "species") {
    const r = response as Awaited<ReturnType<typeof getPredictions>>;
    return {
      type: "FeatureCollection",
      features: r.features
        .filter((f) => f.properties.score_total > MIN_VISIBLE_VALUE && isOnSwedishLand(f.geometry.coordinates, landMask))
        .map((f) => ({
          type: "Feature" as const,
          geometry: calculateBoundingPolygon(f.geometry.coordinates, r.features),
          properties: { ...f.properties, score: f.properties.score_total },
        })),
    };
  }
  const r = response as Awaited<ReturnType<typeof getMoistureLayer>>;
  return {
    type: "FeatureCollection",
    features: r.features
      .filter((f) => (f.properties.moisture_score ?? 0) > MIN_VISIBLE_VALUE && isOnSwedishLand(f.geometry.coordinates, landMask))
      .map((f) => ({
        type: "Feature" as const,
        geometry: calculateBoundingPolygon(f.geometry.coordinates, r.features),
        properties: { ...f.properties, score: f.properties.moisture_score ?? 0 },
      })),
  };
}

export const Map: React.FC<MapProps> = ({
  layer,
  obsDate,
  onError,
  onFeatureCountChange,
  focusTarget,
  onCellClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. Initialisera MapLibre-kartan
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [15.2, 62.0],
      zoom: 5,
      minZoom: MIN_MAP_ZOOM,
      maxZoom: MAX_MAP_ZOOM,
      maxBounds: SWEDEN_BOUNDS,
    });

    map.addControl(new NavigationControl({ showCompass: false }), "top-right");
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "top-right",
    );

    map.on("load", () => {
      setIsLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Flyg till vald plats
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusTarget) return;
    map.flyTo({ center: focusTarget.center, zoom: 9 });
  }, [focusTarget]);

  // 3. Hämta data och uppdatera kartlager
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    let requestSequence = 0;
    let disposed = false;
    let lastQueryKey = "";

    const fetchDataAndRender = async () => {
      const requestId = ++requestSequence;
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];
      const lod = getPredictionLodOptions(map.getZoom());
      const activeLayerKey = layer?.type === "species" ? `species:${layer.speciesId}` : (layer?.type ?? "species:1");
      const queryKey = JSON.stringify({ bbox, lod, layer: activeLayerKey, obsDate: obsDate ?? null });
      if (queryKey === lastQueryKey) return;
      lastQueryKey = queryKey;

      try {
        let geojson: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>;

        if (layer?.type === "moisture") {
          geojson = await getMoistureLayer(bbox, obsDate, lod);
        } else {
          const speciesId = layer?.type === "species" ? layer.speciesId : 1;
          geojson = await getPredictions(bbox, speciesId, {
            ...(obsDate ? { obsDate } : {}),
            ...lod,
          });
        }

        const landMask = await loadSwedenLandMask();
        if (disposed || requestId !== requestSequence) return;
        const activeLayer: LayerSelection = layer ?? { type: "species", speciesId: 1, speciesName: "", tier: "free" };
        const featureCollection = toRenderableFeatureCollection(activeLayer, geojson, landMask);

        onFeatureCountChange?.(featureCollection.features.length);

        const existingSource = map.getSource(PREDICTIONS_SOURCE_ID) as GeoJSONSource | undefined;
        if (existingSource) {
          existingSource.setData(featureCollection);
        } else {
          map.addSource(PREDICTIONS_SOURCE_ID, {
            type: "geojson",
            data: featureCollection,
          });
        }

        if (!map.getLayer(GRID_FILL_LAYER_ID)) {
          map.addLayer({
            id: GRID_FILL_LAYER_ID,
            type: "fill",
            source: PREDICTIONS_SOURCE_ID,
            paint: {
              "fill-color": [
                "interpolate",
                ["linear"],
                ["get", "score"],
                0.0, "transparent",
                0.08, "transparent",
                0.2, "rgba(59, 130, 246, 0.4)",
                0.5, "rgba(16, 185, 129, 0.6)",
                0.8, "rgba(245, 158, 11, 0.75)",
                1.0, "rgba(239, 68, 68, 0.85)",
              ],
              "fill-opacity": 0.7,
              "fill-outline-color": "transparent",
            },
          });

          map.on("click", GRID_FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
            const feature = e.features?.[0];
            if (!feature || !onCellClick) return;
            onCellClick((feature.properties ?? {}) as Record<string, unknown>);
          });

          map.on("mouseenter", GRID_FILL_LAYER_ID, () => {
            map.getCanvas().style.cursor = "pointer";
          });

          map.on("mouseleave", GRID_FILL_LAYER_ID, () => {
            map.getCanvas().style.cursor = "";
          });
        }
      } catch (err) {
        if (disposed || requestId !== requestSequence) return;
        console.error("Kunde inte hämta kartdata:", err);
        if (err instanceof ApiError) onError?.(err);
      }
    };

    void fetchDataAndRender();

    const scheduleFetch = () => {
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = undefined;
        void fetchDataAndRender();
      }, MAP_FETCH_DEBOUNCE_MS);
    };

    map.on("moveend", scheduleFetch);
    map.on("zoomend", scheduleFetch);

    return () => {
      disposed = true;
      requestSequence += 1;
      if (debounceTimer !== undefined) clearTimeout(debounceTimer);
      map.off("moveend", scheduleFetch);
      map.off("zoomend", scheduleFetch);
    };
  }, [isLoaded, layer, obsDate, onCellClick, onError, onFeatureCountChange]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default Map;
