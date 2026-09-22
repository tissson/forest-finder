/**
 * src/components/Map.tsx
 * =======================
 * Kartkomponent med MapLibre GL JS. Prognos- och fuktlagret renderas som
 * riktiga vektorrutor (MVT) från vår tile-endpoint, vilket ger sömlösa
 * ytor och snabb panorering/zoomning även vid hög datatäthet.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  Map as MapLibreMap,
  NavigationControl,
  GeolocateControl,
  Popup,
  type LngLatBoundsLike,
  type MapLayerMouseEvent,
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

import { ApiError, PremiumRequiredError } from "../lib/api";
import type { LayerSelection } from "../lib/api";
import { supabase } from "../lib/supabase";

interface MapProps {
  layer?: LayerSelection | null;
  obsDate?: string;
  onError?: (error: ApiError) => void;
  onFeatureCountChange?: (count: number | null) => void;
  focusTarget?: { center: [number, number]; key: number } | null;
  onCellClick?: (cellData: Record<string, unknown>) => void;
}

const TILE_SOURCE_ID = "predictions-tiles";
const TILE_SOURCE_LAYER = "predictions";
const HEATMAP_LAYER_ID = "fungi-heatmap";
const HIT_LAYER_ID = "fungi-hit";
const MIN_MAP_ZOOM = 5;
const MAX_MAP_ZOOM = 16;
const TILE_MIN_ZOOM = 5;
const TILE_MAX_ZOOM = 12;
const TILE_STYLE_VERSION = "species-v3-dense";

// Sveriges geografiska begränsning [SW, NE]
const SWEDEN_BOUNDS: LngLatBoundsLike = [
  [10.5, 55.2],
  [24.2, 69.1],
];

function tileUrl(layer: LayerSelection | null | undefined, obsDate?: string): string {
  const key = layer?.type === "moisture" ? "moisture" : String(layer?.type === "species" ? layer.speciesId : 1);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const params = new URLSearchParams({ v: TILE_STYLE_VERSION });
  if (obsDate) params.set("date", obsDate);
  const dateQuery = `?${params.toString()}`;
  return `${origin}/api/public/tiles/${key}/{z}/{x}/{y}${dateQuery}`;
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
  const accessTokenRef = useRef<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Håll inloggningstoken aktuell så premiumlager fungerar i tile-anropen.
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active) accessTokenRef.current = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

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
      transformRequest: (url, resourceType) => {
        if (resourceType === "Tile" && url.includes("/api/public/tiles/") && accessTokenRef.current) {
          return { url, headers: { Authorization: `Bearer ${accessTokenRef.current}` } };
        }
        return { url };
      },
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

  // 3. Koppla vektorkällan till valt lager
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoaded) return;

    const url = tileUrl(layer, obsDate);

    if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
    if (map.getLayer(HIT_LAYER_ID)) map.removeLayer(HIT_LAYER_ID);
    if (map.getSource(TILE_SOURCE_ID)) map.removeSource(TILE_SOURCE_ID);

    map.addSource(TILE_SOURCE_ID, {
      type: "vector",
      tiles: [url],
      minzoom: TILE_MIN_ZOOM,
      maxzoom: TILE_MAX_ZOOM,
    });

    // Mjuk, sömlös värmekarta utan synliga rutor.
    map.addLayer({
      id: HEATMAP_LAYER_ID,
      type: "heatmap",
      source: TILE_SOURCE_ID,
      "source-layer": TILE_SOURCE_LAYER,
      paint: {
        "heatmap-weight": [
          "case",
          ["<", ["get", "score"], 0.2],
          0,
          [
            "interpolate",
            ["linear"],
            ["get", "score"],
            0.2, 0.04,
            0.35, 0.12,
            0.5, 0.24,
            0.7, 0.46,
            0.85, 0.68,
            1, 0.9,
          ],
        ],
        // Den täta 2 km-källan ska flyta ihop utan att mätta hela landet.
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          5, 0.55,
          8, 0.9,
          12, 1.3,
          16, 1.6,
        ],
        // Grönt vid tröskeln → gult → orange, lila/djuprött ENDAST på
        // de mest intensiva topparna (density > 0.85).
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(0, 0, 0, 0)",
          0.08, "rgba(34, 197, 94, 0.34)",
          0.25, "rgba(16, 185, 129, 0.62)",
          0.46, "rgba(234, 179, 8, 0.78)",
          0.66, "rgba(249, 115, 22, 0.88)",
          0.86, "rgba(219, 39, 119, 0.94)",
          1, "rgba(107, 33, 168, 0.97)",
        ],
        "heatmap-radius": [
          "interpolate",
          ["exponential", 1.35],
          ["zoom"],
          5, 20,
          8, 42,
          12, 72,
          16, 112,
        ],
        "heatmap-opacity": 0.86,
      },
    });

    // Osynligt träffyta-lager så att man fortfarande kan klicka på en ruta.
    map.addLayer({
      id: HIT_LAYER_ID,
      type: "circle",
      source: TILE_SOURCE_ID,
      "source-layer": TILE_SOURCE_LAYER,
      paint: {
        "circle-radius": 10,
        "circle-color": "rgba(0, 0, 0, 0)",
        "circle-opacity": 0,
        "circle-stroke-width": 0,
      },
    });


    const popup = new Popup({ closeButton: true, closeOnClick: true, maxWidth: "260px" });

    const handleClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const props = (feature.properties ?? {}) as Record<string, unknown>;
      const score = Number(props["score"] ?? 0);
      const moisture = Number(props["moisture"] ?? 0);
      const title = layer?.type === "moisture" ? "Markfuktighet" : (layer?.speciesName ?? "Prognos");
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font-family:inherit;font-size:13px;line-height:1.5">
             <strong>${title}</strong><br/>
             Chans: ${(score * 100).toFixed(0)} %<br/>
             Markfukt: ${(moisture * 100).toFixed(0)} %<br/>
             <span style="opacity:.6">${String(props["obs_date"] ?? "")}</span>
           </div>`,
        )
        .addTo(map);
      onCellClick?.(props);
    };

    const handleEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    const handleIdle = () => {
      if (!map.getLayer(HIT_LAYER_ID)) return;
      onFeatureCountChange?.(map.queryRenderedFeatures({ layers: [HIT_LAYER_ID] }).length);
    };
    const handleSourceError = (event: unknown) => {
      const status = (event as { error?: { status?: number } })?.error?.status;
      if (status === 403) {
        onError?.(new PremiumRequiredError("Det här lagret ingår i premium."));
      }
    };

    map.on("click", HIT_LAYER_ID, handleClick);
    map.on("mouseenter", HIT_LAYER_ID, handleEnter);
    map.on("mouseleave", HIT_LAYER_ID, handleLeave);
    map.on("idle", handleIdle);
    map.on("error", handleSourceError);

    return () => {
      popup.remove();
      map.off("click", HIT_LAYER_ID, handleClick);
      map.off("mouseenter", HIT_LAYER_ID, handleEnter);
      map.off("mouseleave", HIT_LAYER_ID, handleLeave);
      map.off("idle", handleIdle);
      map.off("error", handleSourceError);
      if (map.getLayer(HIT_LAYER_ID)) map.removeLayer(HIT_LAYER_ID);
      if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
      if (map.getSource(TILE_SOURCE_ID)) map.removeSource(TILE_SOURCE_ID);
    };
  }, [isLoaded, layer, obsDate, onCellClick, onError, onFeatureCountChange]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default Map;
