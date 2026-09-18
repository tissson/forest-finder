/**
 * src/components/Map.tsx
 * =======================
 * Kartkomponent med MapLibre GL JS: fasta prognosrutor, klick-hantering,
 * GPS-positionering och gränser för Sverige.
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
  Geometry,
  Point,
  Polygon,
} from "geojson";

import { getPredictions, getMoistureLayer, ApiError } from "../lib/api";
import type { LayerSelection, PredictionsResponse, MoistureLayerResponse } from "../lib/api";

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
const MIN_VISIBLE_SCORE = 0.01;
const MIN_MAP_ZOOM = 4.5;
const MAX_MAP_ZOOM = 16;
const FALLBACK_CELL_SPAN_DEGREES = 0.04;

// Sveriges geografiska begränsning [SW, NE]
const SWEDEN_BOUNDS: LngLatBoundsLike = [
  [10.5, 55.2],
  [24.2, 69.1],
];

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

function pointsToSeamlessGrid(
  features: Array<Feature<Point, GeoJsonProperties>>,
): Array<Feature<Polygon, GeoJsonProperties>> {
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

  return features.flatMap((feature) => {
    const longitude = feature.geometry.coordinates[0];
    const latitude = feature.geometry.coordinates[1];
    if (longitude === undefined || latitude === undefined) return [];
    const rowLongitudes = longitudesByLatitude.get(latitude);
    if (!rowLongitudes) return [];
    const [west, east] = getCellBounds(rowLongitudes, longitude);
    const [south, north] = getCellBounds(latitudes, latitude);

    return [{
      type: "Feature",
      properties: feature.properties,
      geometry: {
        type: "Polygon",
        coordinates: [[
          [west, south],
          [east, south],
          [east, north],
          [west, north],
          [west, south],
        ]],
      },
    }];
  });
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

    const fetchDataAndRender = async () => {
      const bounds = map.getBounds();
      const bbox: [number, number, number, number] = [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ];

      try {
        let geojson: PredictionsResponse | MoistureLayerResponse;

        if (layer?.type === "moisture") {
          geojson = await getMoistureLayer(bbox, obsDate);
        } else {
          const speciesId = layer?.type === "species" ? layer.speciesId : 1;
          geojson = await getPredictions(bbox, speciesId, {
            ...(obsDate ? { obsDate } : {}),
            limit: 10000,
          });
        }

        const rawFeatures = geojson.features as unknown as Array<{
          type: "Feature";
          geometry: Geometry;
          properties: Record<string, unknown> | null;
        }>;

        const scoredFeatures = rawFeatures.flatMap((feature) => {
          if (feature.geometry.type !== "Point") return [];
          const properties = feature.properties ?? {};
          const total = properties["score_total"];
          const moisture = properties["moisture_score"];
          const rawScore = typeof total === "number" ? total : typeof moisture === "number" ? moisture : 0;
          return rawScore >= MIN_VISIBLE_SCORE
            ? [{ geometry: feature.geometry, properties, rawScore }]
            : [];
        });
        const highestScore = Math.max(MIN_VISIBLE_SCORE, ...scoredFeatures.map(({ rawScore }) => rawScore));
        const pointFeatures: Array<Feature<Point, GeoJsonProperties>> = scoredFeatures.map(({ geometry, properties, rawScore }) => {
          const score = Math.max(0, Math.min(1, rawScore / highestScore));
          return {
            type: "Feature",
            geometry: {
              type: "Point",
              coordinates: geometry.coordinates,
            },
            properties: { ...properties, raw_score: rawScore, score },
          };
        });
        const processedFeatures = pointsToSeamlessGrid(pointFeatures);

        const featureCollection: FeatureCollection<Polygon, GeoJsonProperties> = {
          type: "FeatureCollection",
          features: processedFeatures,
        };

        onFeatureCountChange?.(processedFeatures.length);

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
                0.2, "rgba(59, 130, 246, 0.45)",
                0.4, "rgba(16, 185, 129, 0.55)",
                0.7, "rgba(245, 158, 11, 0.70)",
                0.9, "rgba(239, 68, 68, 0.85)",
              ],
              "fill-opacity": 0.75,
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
        console.error("Kunde inte hämta kartdata:", err);
        if (err instanceof ApiError) onError?.(err);
      }
    };

    void fetchDataAndRender();

    const handleMoveEnd = () => {
      void fetchDataAndRender();
    };

    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [isLoaded, layer, obsDate, onCellClick, onError, onFeatureCountChange]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default Map;
