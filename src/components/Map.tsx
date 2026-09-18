/**
 * src/components/Map.tsx
 * =======================
 * Kartkomponent med MapLibre GL JS: finkorniga prognospunkter, klick-hantering,
 * GPS-positionering och gränser för Sverige. Punkter filtreras mot en svensk
 * landmask och låga värden tas bort.
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
const MICROPIXEL_LAYER_ID = "fungi-micropixels";
const MIN_VISIBLE_VALUE = 0.001;
const MIN_MAP_ZOOM = 4.5;
const MAX_MAP_ZOOM = 16;
const MAP_FETCH_DEBOUNCE_MS = 300;
// Liten marginal runt vyn så punkterna redan finns när kartan flyttas.
const BBOX_PADDING_RATIO = 0.12;

function splitBoundingBox(
  [minLon, minLat, maxLon, maxLat]: [number, number, number, number],
  columns: number,
  rows: number,
): Array<[number, number, number, number]> {
  const width = (maxLon - minLon) / columns;
  const height = (maxLat - minLat) / rows;
  const boxes: Array<[number, number, number, number]> = [];

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      boxes.push([
        minLon + column * width,
        minLat + row * height,
        minLon + (column + 1) * width,
        minLat + (row + 1) * height,
      ]);
    }
  }

  return boxes;
}


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
// Renderbar FeatureCollection: landmask + tröskel + rena punkter
// ---------------------------------------------------------------------
function toRenderableFeatureCollection(
  layer: LayerSelection,
  response: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>,
  landMask: LandMask,
  /** Högsta kända råvärde för aktivt lager — används för normalisering. */
  referenceMax: number,
): FeatureCollection<Point, GeoJsonProperties> {
  const scaleMax = Math.max(referenceMax, MIN_VISIBLE_VALUE);
  const normalize = (raw: number) => Math.max(0, Math.min(1, raw / scaleMax));

  if (layer.type === "species") {
    const r = response as Awaited<ReturnType<typeof getPredictions>>;
    return {
      type: "FeatureCollection",
      features: r.features
        .filter((f) => f.properties.score_total > MIN_VISIBLE_VALUE && isOnSwedishLand(f.geometry.coordinates, landMask))
        .map((f) => ({
          type: "Feature" as const,
          geometry: {
            type: "Point" as const,
            coordinates: f.geometry.coordinates,
          },
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
        geometry: {
          type: "Point" as const,
          coordinates: f.geometry.coordinates,
        },
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

      const zoom = map.getZoom();
      const baseLod = getPredictionLodOptions(zoom);
      // Sverigevyn behöver ett tätare urval än det vanliga översiktsläget
      // för att skogsprognosen ska bilda ett rikt mikropixelmönster.
      const lod = zoom <= 8
        ? { ...baseLod, limit: 12_000, minScore: MIN_VISIBLE_VALUE, step: 3 }
        : baseLod;
      const activeLayerKey = layer?.type === "species" ? `species:${layer.speciesId}` : (layer?.type ?? "species:1");
      const queryKey = JSON.stringify({ bbox, lod, layer: activeLayerKey, obsDate: obsDate ?? null });
      if (queryKey === lastQueryKey) return;
      lastQueryKey = queryKey;

      try {
        let geojson: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>;
        const requestBoxes = zoom <= 8 ? splitBoundingBox(bbox, 3, 2) : [bbox];

        if (layer?.type === "moisture") {
          const responses = await Promise.all(
            requestBoxes.map((requestBox) => getMoistureLayer(requestBox, obsDate, lod)),
          );
          geojson = {
            type: "FeatureCollection",
            metadata: {
              layer: "moisture",
              obs_date: responses[0]?.metadata.obs_date ?? obsDate ?? null,
              count: responses.reduce((count, response) => count + response.features.length, 0),
            },
            features: responses.flatMap((response) => response.features),
          };
        } else {
          const speciesId = layer?.type === "species" ? layer.speciesId : 1;
          const responses = await Promise.all(
            requestBoxes.map((requestBox) => getPredictions(requestBox, speciesId, {
              ...(obsDate ? { obsDate } : {}),
              ...lod,
            })),
          );
          geojson = {
            type: "FeatureCollection",
            metadata: {
              species_id: speciesId,
              obs_date: responses[0]?.metadata.obs_date ?? obsDate ?? null,
              count: responses.reduce((count, response) => count + response.features.length, 0),
            },
            features: responses.flatMap((response) => response.features),
          };
        }

        const landMask = await loadSwedenLandMask();
        if (disposed || requestId !== requestSequence) return;
        const activeLayer: LayerSelection = layer ?? { type: "species", speciesId: 1, speciesName: "", tier: "free" };
        referenceMax = Math.max(referenceMax, getMaxRawScore(activeLayer, geojson));
        const featureCollection = toRenderableFeatureCollection(activeLayer, geojson, landMask, referenceMax);

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

        if (!map.getLayer(MICROPIXEL_LAYER_ID)) {
          map.addLayer({
            id: MICROPIXEL_LAYER_ID,
            type: "circle",
            source: PREDICTIONS_SOURCE_ID,
            paint: {
              "circle-radius": [
                "interpolate",
                ["linear"],
                ["zoom"],
                4.5, 1.8,
                7, 2.2,
                9, 2.8,
                13, 5,
                16, 10,
              ],
              "circle-color": [
                "interpolate",
                ["linear"],
                ["get", "score"],
                0, "rgba(0, 0, 0, 0)",
                0.1, "rgba(216, 180, 254, 0.55)",
                0.4, "rgba(192, 132, 252, 0.75)",
                0.7, "rgba(168, 85, 247, 0.9)",
                1, "rgba(147, 51, 234, 1)",
              ],
              "circle-opacity": 0.65,
              "circle-stroke-width": 0,
            },
          });

          map.on("click", MICROPIXEL_LAYER_ID, (e: MapLayerMouseEvent) => {
            const feature = e.features?.[0];
            if (!feature || !onCellClick) return;
            onCellClick((feature.properties ?? {}) as Record<string, unknown>);
          });

          map.on("mouseenter", MICROPIXEL_LAYER_ID, () => {
            map.getCanvas().style.cursor = "pointer";
          });

          map.on("mouseleave", MICROPIXEL_LAYER_ID, () => {
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
