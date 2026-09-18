/**
 * src/components/Map.tsx
 * ========================
 * Interaktiv karta som visar ANTINGEN en arts prognos (score_total)
 * ELLER det generella fuktighetslagret (moisture_score), beroende på
 * `layer`-propen -- samma union-typ som LayerSelector.tsx producerar
 * (LayerSelection, definierad i lib/api.ts).
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  GeolocateControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { getPredictions, getMoistureLayer, ApiError, type LayerSelection } from "../lib/api";
import swedenLandData from "../data/sweden-land.json";

setWorkerUrl("/maplibre/maplibre-gl-worker.mjs");

const PREDICTIONS_SOURCE_ID = "fungi-data";
const HEATMAP_LAYER_ID = "fungi-heatmap";
const CLICK_POINTS_LAYER_ID = "fungi-click-points";
const MOVE_DEBOUNCE_MS = 400;
const SWEDEN_BOUNDS: [[number, number], [number, number]] = [
  [10, 55],
  [24, 69],
];
const MIN_VISIBLE_VALUE = 0.08;
const SWEDEN_LAND = swedenLandData as unknown as Feature<Polygon | MultiPolygon>;

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Normaliserar VILKEN som helst av våra två lagertyper till en
 * gemensam form där heatmap-vikten alltid ligger under properties.score.
 */
function toRenderableFeatureCollection(
  layer: LayerSelection,
  response: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>,
): FeatureCollection {
  if (layer.type === "species") {
    const r = response as Awaited<ReturnType<typeof getPredictions>>;
    return {
      type: "FeatureCollection",
      features: r.features
        .filter(
          (f) =>
            f.properties.score_total > MIN_VISIBLE_VALUE &&
            (f.properties.score_forest ?? 0) > 0 &&
            isOnSwedishLand(f.geometry.coordinates),
        )
        .map((f) => ({
          type: "Feature" as const,
          geometry: f.geometry,
          properties: { ...f.properties, score: Math.max(0, Math.min(1, f.properties.score_total)) },
        })),
    };
  }
  const r = response as Awaited<ReturnType<typeof getMoistureLayer>>;
  return {
    type: "FeatureCollection",
    features: r.features
      .filter((f) => (f.properties.moisture_score ?? 0) > MIN_VISIBLE_VALUE && isOnSwedishLand(f.geometry.coordinates))
      .map((f) => ({
        type: "Feature" as const,
        geometry: f.geometry,
        properties: { ...f.properties, score: Math.max(0, Math.min(1, f.properties.moisture_score ?? 0)) },
      })),
  };
}

/** Tar bort hav och större insjöar med en lokal landmask för Sverige. */
function isOnSwedishLand(coordinates: [number, number]): boolean {
  return booleanPointInPolygon(point(coordinates), SWEDEN_LAND);
}

export interface MapProps {
  layer: LayerSelection | null;
  minScore?: number;
  onError?: (error: ApiError) => void;
  onFeatureCountChange?: (count: number) => void;
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
  className = "relative h-full w-full",
  initialCenter = [15, 62],
  initialZoom = 5,
  focusTarget = null,
}: MapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mapReady, setMapReady] = useState(false);

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
        currentLayer.type === "species"
          ? await getPredictions(bbox, currentLayer.speciesId, { minScore: minScoreRef.current })
          : await getMoistureLayer(bbox);

      const rendered = toRenderableFeatureCollection(currentLayer, response);
      source?.setData(rendered);
      onFeatureCountChange?.(rendered.features.length);
    } catch (err) {
      onError?.(err instanceof ApiError ? err : new ApiError(0, err instanceof Error ? err.message : "Okänt fel"));
      source?.setData(EMPTY_FEATURE_COLLECTION);
    }
  }, [onError, onFeatureCountChange]);

  const scheduleFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fetchAndRenderLayer, MOVE_DEBOUNCE_MS);
  }, [fetchAndRenderLayer]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: initialCenter,
      zoom: initialZoom,
      maxBounds: SWEDEN_BOUNDS,
    });

    if (!window.matchMedia("(max-width: 767px)").matches) {
      map.addControl(new NavigationControl(), "top-right");
    }
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      // 1. Lägg till GeoJSON-källan
      map.addSource(PREDICTIONS_SOURCE_ID, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

      // 2. RIKTIGT HEATMAP-LAGER (WebGL-beräknad densitet)
      map.addLayer({
        id: HEATMAP_LAYER_ID,
        type: "heatmap",
        source: PREDICTIONS_SOURCE_ID,
        paint: {
          // Använd 'score' (0.0 - 1.0) från properties
          "heatmap-weight": ["interpolate", ["linear"], ["get", "score"], 0, 0, 1, 1],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 9, 3],
          // Mjuk färgskala: Genomskinlig -> Grön -> Gul -> Orange -> Lila
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(0,0,0,0)",
            0.2,
            "rgba(34,197,94,0.45)",
            0.5,
            "rgba(234,179,8,0.75)",
            0.8,
            "rgba(249,115,22,0.88)",
            1.0,
            "rgba(168,85,247,0.95)",
          ],
          // Stor radie vid zoom level 7 (50px) gör att 100m/grid-punkterna smälter ihop helt
          "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 3, 15, 7, 50, 12, 20],
          "heatmap-opacity": 0.8,
        },
      });

      // 3. OSYNLIGT CIRKELLAGER (Möjliggör klickhändelser på heatmapen)
      map.addLayer({
        id: CLICK_POINTS_LAYER_ID,
        type: "circle",
        source: PREDICTIONS_SOURCE_ID,
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 8, 12, 18],
          "circle-color": "transparent",
          "circle-stroke-width": 0,
        },
      });

      // Klick-hantering via det osynliga klicklagret
      map.on("click", CLICK_POINTS_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, number | null>;
        onFeatureClick?.(props);
      });

      map.on("mouseenter", CLICK_POINTS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", CLICK_POINTS_LAYER_ID, () => {
        map.getCanvas().style.cursor = "";
      });

      mapRef.current = map;
      setMapReady(true);
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.on("moveend", scheduleFetch);
    return () => {
      map.off("moveend", scheduleFetch);
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
