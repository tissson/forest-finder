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
const FALLBACK_CELL_SPAN_DEGREES = 0.02;
const MAP_FETCH_DEBOUNCE_MS = 300;
// Liten marginal runt vyn (andel av vyns storlek) så rutorna täcker kanterna
// utan att onödigt mycket data hämtas från det täta 2 km-rutnätet.
const BBOX_PADDING_RATIO = 0.12;


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
// Sömlös gittergeometri: varje punkt täcker exakt sin rutnätscell.
// Rutnätet i databasen är 2 km; vid glesare detaljnivå (step) täcker
// varje hämtad punkt step × 2 km, så cellerna möts kant-i-kant.
// ---------------------------------------------------------------------
const BASE_GRID_CELL_METERS = 2_000;
/** Fuktighetslagret kommer alltid från väderprovpunkter per 20 km-block. */
const MOISTURE_CELL_METERS = 20_000;

const METERS_PER_LATITUDE_DEGREE = 111_320;

/** Sömlös cell-polygon runt en punkt, given cellens storlek i meter. */
function calculateBoundingPolygon(
  coordinates: [number, number],
  cellSizeMeters: number,
): Polygon {
  const [longitude, latitude] = coordinates;
  const halfLat = cellSizeMeters / 2 / METERS_PER_LATITUDE_DEGREE;
  const cosLat = Math.max(0.2, Math.cos((latitude * Math.PI) / 180));
  const halfLon = halfLat / cosLat;
  const west = longitude - halfLon;
  const east = longitude + halfLon;
  const south = latitude - halfLat;
  const north = latitude + halfLat;

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
  /** Högsta kända råvärde för aktivt lager — används för normalisering. */
  referenceMax: number,
  /** Rutnätssteg (1 = 2 km-celler, 10 = 20 km-celler). */
  step: number,
): FeatureCollection<Polygon, GeoJsonProperties> {
  const scaleMax = Math.max(referenceMax, MIN_VISIBLE_VALUE);
  const normalize = (raw: number) => Math.max(0, Math.min(1, raw / scaleMax));
  const cellSizeMeters = BASE_GRID_CELL_METERS * Math.max(1, step);

  if (layer.type === "species") {
    const r = response as Awaited<ReturnType<typeof getPredictions>>;
    return {
      type: "FeatureCollection",
      features: r.features
        .filter((f) => f.properties.score_total > MIN_VISIBLE_VALUE && isOnSwedishLand(f.geometry.coordinates, landMask))
        .map((f) => ({
          type: "Feature" as const,
          geometry: calculateBoundingPolygon(f.geometry.coordinates, cellSizeMeters),
          properties: {
            ...f.properties,
            raw_score: f.properties.score_total,
            score: normalize(f.properties.score_total),
          },
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
        geometry: calculateBoundingPolygon(f.geometry.coordinates, MOISTURE_CELL_METERS),


        properties: {
          ...f.properties,
          raw_score: f.properties.moisture_score ?? 0,
          score: normalize(f.properties.moisture_score ?? 0),
        },
      })),
  };
}

/** Högsta råvärde i ett svar (0 om tomt). */
function getMaxRawScore(
  layer: LayerSelection,
  response: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>,
): number {
  if (layer.type === "species") {
    const r = response as Awaited<ReturnType<typeof getPredictions>>;
    return r.features.reduce((max, f) => Math.max(max, f.properties.score_total ?? 0), 0);
  }
  const r = response as Awaited<ReturnType<typeof getMoistureLayer>>;
  return r.features.reduce((max, f) => Math.max(max, f.properties.moisture_score ?? 0), 0);
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
    // Högsta kända råvärde för aktivt lager (nollställs när lagret byts).
    let referenceMax = 0;

    const fetchDataAndRender = async () => {
      const requestId = ++requestSequence;
      const bounds = map.getBounds();
      // Marginal på en gitterruta så att rutorna täcker hela vyn även
      // när man zoomar in mellan två datapunkter.
      const paddingLon = (bounds.getEast() - bounds.getWest()) * BBOX_PADDING_RATIO;
      const paddingLat = (bounds.getNorth() - bounds.getSouth()) * BBOX_PADDING_RATIO;
      const bbox: [number, number, number, number] = [
        bounds.getWest() - paddingLon,
        bounds.getSouth() - paddingLat,
        bounds.getEast() + paddingLon,
        bounds.getNorth() + paddingLat,
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
        referenceMax = Math.max(referenceMax, getMaxRawScore(activeLayer, geojson));
        const featureCollection = toRenderableFeatureCollection(activeLayer, geojson, landMask, referenceMax, lod.step);

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
