/**
 * src/components/Map.tsx
 * =======================
 * Kartkomponent byggd med MapLibre GL JS.
 * Renderar artprognoser och fuktskikt som en sömlös heatmap.
 */

import React, { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { getPredictions, getMoistureLayer } from "../lib/api";
import type { LayerSelection, PredictionsResponse, MoistureLayerResponse } from "../lib/api";

interface MapProps {
  layerSelection?: LayerSelection;
  obsDate?: string;
}

const PREDICTIONS_SOURCE_ID = "predictions-source";
const HEATMAP_LAYER_ID = "predictions-heatmap";

export const Map: React.FC<MapProps> = ({ layerSelection, obsDate }) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // 1. Initialisera MapLibre-kartan
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
      center: [15.2, 62.0],
      zoom: 5,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      setIsLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // 2. Hämta data och uppdatera heatmap-lagret
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

        if (layerSelection?.type === "moisture") {
          geojson = await getMoistureLayer(bbox, obsDate);
        } else {
          const speciesId = layerSelection?.type === "species" ? layerSelection.speciesId : 1;
          geojson = await getPredictions(bbox, speciesId, { obsDate, limit: 10000 });
        }

        const rawFeatures = (geojson as any)?.features || [];
        const processedFeatures = rawFeatures.map((f: any) => ({
          ...f,
          properties: {
            ...(f.properties || {}),
            score_total:
              typeof f.properties?.score_total === "number"
                ? f.properties.score_total
                : (f.properties?.moisture_score ?? 0),
          },
        }));

        const featureCollection = {
          type: "FeatureCollection",
          features: processedFeatures,
        };

        const existingSource = map.getSource(PREDICTIONS_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
        if (existingSource) {
          existingSource.setData(featureCollection as any);
        } else {
          map.addSource(PREDICTIONS_SOURCE_ID, {
            type: "geojson",
            data: featureCollection as any,
          });
        }

        if (!map.getLayer(HEATMAP_LAYER_ID)) {
          map.addLayer({
            id: HEATMAP_LAYER_ID,
            type: "heatmap",
            source: PREDICTIONS_SOURCE_ID,
            maxzoom: 15,
            paint: {
              "heatmap-weight": ["interpolate", ["linear"], ["get", "score_total"], 0, 0, 1, 1] as any,
              "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 0, 1, 6, 2, 9, 3.5] as any,
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
              ] as any,
              "heatmap-radius": ["interpolate", ["linear"], ["zoom"], 0, 20, 6, 45, 10, 80] as any,
              "heatmap-opacity": 0.8,
            },
          });
        }
      } catch (err) {
        console.error("Kunde inte hämta kartdata:", err);
      }
    };

    fetchDataAndRender();

    const handleMoveEnd = () => {
      fetchDataAndRender();
    };

    map.on("moveend", handleMoveEnd);

    return () => {
      map.off("moveend", handleMoveEnd);
    };
  }, [isLoaded, layerSelection, obsDate]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default Map;
