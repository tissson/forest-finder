/**
 * src/components/Map.tsx
 * =======================
 * Kartkomponent med MapLibre GL JS: heatmap-lager, klick-hantering,
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
import type { Feature, FeatureCollection, Geometry } from "geojson";

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
const HEATMAP_LAYER_ID = "predictions-heatmap";
const CLICK_TARGET_LAYER_ID = "fungi-click-target";

// Sveriges geografiska begränsning [SW, NE]
const SWEDEN_BOUNDS: LngLatBoundsLike = [
  [10.5, 55.2],
  [24.2, 69.1],
];

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

        const processedFeatures: Feature[] = rawFeatures.map((f) => {
          const props = (f.properties ?? {}) as Record<string, unknown>;
          const total = props["score_total"];
          const moisture = props["moisture_score"];
          const score = typeof total === "number" ? total : typeof moisture === "number" ? moisture : 0;
          return {
            type: "Feature",
            geometry: f.geometry,
            properties: { ...props, score_total: score },
          };
        });

        const featureCollection: FeatureCollection = {
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

        // Heatmap-lager
        if (!map.getLayer(HEATMAP_LAYER_ID)) {
          map.addLayer({
            id: HEATMAP_LAYER_ID,
            type: "heatmap",
            source: PREDICTIONS_SOURCE_ID,
            maxzoom: 15,
            paint: {
              "heatmap-weight": ["interpolate", ["linear"], ["get", "score_total"], 0, 0, 1, 1],
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 2, 9, 3.5],
              "heatmap-color": [
                "interpolate",
                ["linear"],
                ["heatmap-density"],
                0,
                "rgba(255, 255, 255, 0)",
                0.2,
                "rgba(250, 204, 21, 0.45)",
                0.5,
                "rgba(34, 197, 94, 0.70)",
                0.8,
                "rgba(21, 128, 61, 0.85)",
                1.0,
                "rgba(15, 81, 50, 0.95)",
              ],
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 6, 45, 10, 80],
              "heatmap-opacity": 0.8,
            },
          });
        }

        // Osynligt klick-lager för interaktion
        if (!map.getLayer(CLICK_TARGET_LAYER_ID)) {
          map.addLayer({
            id: CLICK_TARGET_LAYER_ID,
            type: "circle",
            source: PREDICTIONS_SOURCE_ID,
            minzoom: 10,
            paint: {
              "circle-radius": 12,
              "circle-color": "transparent",
            },
          });

          map.on("click", CLICK_TARGET_LAYER_ID, (e: MapLayerMouseEvent) => {
            const feature = e.features?.[0];
            if (!feature || !onCellClick) return;
            onCellClick((feature.properties ?? {}) as Record<string, unknown>);
          });

          map.on("mouseenter", CLICK_TARGET_LAYER_ID, () => {
            map.getCanvas().style.cursor = "pointer";
          });

          map.on("mouseleave", CLICK_TARGET_LAYER_ID, () => {
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
