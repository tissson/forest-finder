/**
 * src/components/Map.tsx
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
const FILL_LAYER_ID = "fungi-fill";
const MOVE_DEBOUNCE_MS = 400;
const SWEDEN_BOUNDS: [[number, number], [number, number]] = [
  [10, 55],
  [24, 69],
];
const MIN_VISIBLE_VALUE = 0.08;
const SWEDEN_LAND = swedenLandData as unknown as Feature<Polygon | MultiPolygon>;

// Storlek på kvadratiska polygoner kring varje gitterpunkt (i grader, ~0.025 ≈ 2.5km täckning)
const HALF_GRID_SIZE_LAT = 0.015;
const HALF_GRID_SIZE_LNG = 0.025;

const EMPTY_FEATURE_COLLECTION: FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Konverterar en punkt till en kvadratisk Polygon-feature för ett täckande ytlager.
 */
function createGridPolygonFeature(coordinates: [number, number], properties: Record<string, any>): Feature<Polygon> {
  const [lng, lat] = coordinates;
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [lng - HALF_GRID_SIZE_LNG, lat - HALF_GRID_SIZE_LAT],
          [lng + HALF_GRID_SIZE_LNG, lat - HALF_GRID_SIZE_LAT],
          [lng + HALF_GRID_SIZE_LNG, lat + HALF_GRID_SIZE_LAT],
          [lng - HALF_GRID_SIZE_LNG, lat + HALF_GRID_SIZE_LAT],
          [lng - HALF_GRID_SIZE_LNG, lat - HALF_GRID_SIZE_LAT],
        ],
      ],
    },
    properties,
  };
}

function toRenderableFeatureCollection(
  layer: LayerSelection,
  response: Awaited<ReturnType<typeof getPredictions>> | Awaited<ReturnType<typeof getMoistureLayer>>,
): FeatureCollection {
  if (layer.type === "species") {
    const r = response as Awaited<ReturnType<typeof getPredictions>>;
    return {
      type: "FeatureCollection",
      features: (r.features || [])
        .filter(
          (f) =>
            (f.properties?.score_total ?? 0) > MIN_VISIBLE_VALUE &&
            (f.properties?.score_forest ?? 0) > 0 &&
            isOnSwedishLand(f.geometry.coordinates),
        )
        .map((f) => {
          const rawScore = f.properties?.score_total ?? 0;
          const normalizedScore = rawScore > 1 ? rawScore / 100 : rawScore;
          return createGridPolygonFeature(f.geometry.coordinates, {
            ...f.properties,
            score: Math.max(0, Math.min(1, normalizedScore)),
          });
        }),
    };
  }
  const r = response as Awaited<ReturnType<typeof getMoistureLayer>>;
  return {
    type: "FeatureCollection",
    features: (r.features || [])
      .filter((f) => (f.properties?.moisture_score ?? 0) > MIN_VISIBLE_VALUE && isOnSwedishLand(f.geometry.coordinates))
      .map((f) => {
        const rawScore = f.properties?.moisture_score ?? 0;
        const normalizedScore = rawScore > 1 ? rawScore / 100 : rawScore;
        return createGridPolygonFeature(f.geometry.coordinates, {
          ...f.properties,
          score: Math.max(0, Math.min(1, normalizedScore)),
        });
      }),
  };
}

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
      map.addSource(PREDICTIONS_SOURCE_ID, { type: "geojson", data: EMPTY_FEATURE_COLLECTION });

      // RIKTIGT YTLAGER (Polygon Fill)
      map.addLayer({
        id: FILL_LAYER_ID,
        type: "fill",
        source: PREDICTIONS_SOURCE_ID,
        paint: {
          // Färg baserad på 'score' (0.0 - 1.0)
          "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "score"],
            0.0,
            "transparent",
            0.15,
            "rgba(34, 197, 94, 0.4)", // Låg (Grön)
            0.4,
            "rgba(234, 179, 8, 0.6)", // Medel (Gul)
            0.7,
            "rgba(249, 115, 22, 0.75)", // Hög (Orange)
            0.9,
            "rgba(168, 85, 247, 0.85)", // Extrem (Lila)
          ],
          "fill-opacity": 0.75,
          "fill-antialias": true,
        },
      });

      // Klick-hantering direkt på polygon-ytorna
      map.on("click", FILL_LAYER_ID, (e: MapLayerMouseEvent) => {
        const feature = e.features?.[0];
        if (!feature) return;
        const props = feature.properties as Record<string, number | null>;
        onFeatureClick?.(props);
      });

      map.on("mouseenter", FILL_LAYER_ID, () => {
        map.getCanvas().style.cursor = "pointer";
      });

      map.on("mouseleave", FILL_LAYER_ID, () => {
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
