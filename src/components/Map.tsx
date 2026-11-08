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
  type ExpressionSpecification,
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
const TILE_STYLE_VERSION = "species-v4-trees";
const USE_HEATMAP = true;
const DOT_LAYER_ID = "fungi-stipple-dots";
const PATTERN_LAYER_ID = "fungi-stipple-patterns";

// zone_id is the cell identifier emitted by the existing MVT, not a feature ID.
// Multiplicative hashing remains safely within integer precision for these IDs.
const CELL_HASH: ExpressionSpecification = ["%", ["*", ["to-number", ["get", "zone_id"]], 48271], 2147483647];
const DOT_PERCENT: ExpressionSpecification = [
  "interpolate", ["linear"], ["get", "score"],
  0.2, 0, 0.35, 25, 0.5, 60, 0.7, 100,
];

// Resolve the existing semantic palette to sRGB for both MapLibre and canvas.
function stippleColor(speciesId: number): string {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string) => styles.getPropertyValue(name).trim();
  const colors: Record<number, string> = {
    1: token("--mushroom"),
    2: `color-mix(in srgb, ${token("--accent")} 68%, ${token("--foreground")})`,
    3: token("--map-berry-low"),
    4: `color-mix(in srgb, ${token("--destructive")} 85%, ${token("--map-berry-high")})`,
    5: `color-mix(in srgb, ${token("--foreground")} 75%, ${token("--accent")})`,
    6: `color-mix(in srgb, ${token("--mushroom")} 70%, ${token("--accent")})`,
  };
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 1;
  const context = canvas.getContext("2d");
  if (!context) return token("--map-berry-low");
  context.fillStyle = colors[speciesId] ?? colors[1];
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
}

function addStippleImages(map: MapLibreMap, speciesId: number, color: string) {
  // 128 CSS pixels per pattern; 2x raster avoids fuzzy dots on retina screens.
  // Nested, seeded samples keep every pattern stable across pans and redraws.
  for (let variant = 0; variant < 4; variant++) {
    for (let density = 0; density < 4; density++) {
      const imageId = `stipple-${speciesId}-${density}-${variant}`;
      if (map.hasImage(imageId)) continue;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) continue;
      context.fillStyle = color;
      let seed = 1709 + variant * 7919;
      const random = () => {
        seed = (seed * 48271) % 2147483647;
        return seed / 2147483647;
      };
      const count = [12, 36, 78, 132][density] ?? 12;
      const points: Array<[number, number]> = [];
      while (points.length < count) {
        const x = 7 + random() * 242;
        const y = 7 + random() * 242;
        if (points.some(([px, py]) => (px - x) ** 2 + (py - y) ** 2 < 70)) continue;
        points.push([x, y]);
        context.beginPath();
        context.arc(x, y, 1.65 + random() * 0.5, 0, Math.PI * 2);
        context.fill();
      }
      map.addImage(imageId, context.getImageData(0, 0, 256, 256), { pixelRatio: 2 });
    }
  }
}

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

  // Callbacks i refs: nya funktionsinstanser från föräldern får INTE
  // återskapa kartkällan (det laddade om alla kartrutor flera gånger).
  const onErrorRef = useRef(onError);
  const onFeatureCountChangeRef = useRef(onFeatureCountChange);
  const onCellClickRef = useRef(onCellClick);
  useEffect(() => {
    onErrorRef.current = onError;
    onFeatureCountChangeRef.current = onFeatureCountChange;
    onCellClickRef.current = onCellClick;
  }, [onError, onFeatureCountChange, onCellClick]);

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
    const stippling = new URLSearchParams(window.location.search).get("karta") === "d"
      && layer?.type === "species";

    if (map.getLayer(DOT_LAYER_ID)) map.removeLayer(DOT_LAYER_ID);
    if (map.getLayer(PATTERN_LAYER_ID)) map.removeLayer(PATTERN_LAYER_ID);
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
    if (USE_HEATMAP) map.addLayer({
      id: HEATMAP_LAYER_ID,
      type: "heatmap",
      source: TILE_SOURCE_ID,
      "source-layer": TILE_SOURCE_LAYER,
      layout: { visibility: stippling ? "none" : "visible" },
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
          5, 0.42,
          8, 0.5,
          12, 0.68,
          16, 0.82,
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
          5, 21,
          8, 42,
          12, 78,
          16, 112,
        ],
        "heatmap-opacity": 0.86,
      },
    });

    if (stippling && layer?.type === "species") {
      const color = stippleColor(layer.speciesId);
      addStippleImages(map, layer.speciesId, color);
      map.addLayer({
        id: DOT_LAYER_ID,
        type: "circle",
        source: TILE_SOURCE_ID,
        "source-layer": TILE_SOURCE_LAYER,
        maxzoom: 9.5,
        filter: ["<", ["%", CELL_HASH, 100], DOT_PERCENT],
        paint: {
          "circle-color": color,
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 0.8, 9.5, 1.4],
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 8.5, 0.68, 9.5, 0],
          "circle-blur": 0,
        },
      });
      map.addLayer({
        id: PATTERN_LAYER_ID,
        type: "symbol",
        source: TILE_SOURCE_ID,
        "source-layer": TILE_SOURCE_LAYER,
        minzoom: 8.5,
        layout: {
          "icon-image": ["concat", `stipple-${layer.speciesId}-`,
            ["to-string", ["step", ["get", "score"], 0, 0.35, 1, 0.5, 2, 0.7, 3]],
            "-", ["to-string", ["%", CELL_HASH, 4]]],
          // Web Mercator: a 2 km cell scales with 2^zoom / cos(latitude).
          // Score positions are jittered by the existing tile, left untouched.
          "icon-size": ["interpolate", ["exponential", 2], ["zoom"],
            8, 0.2044, 9, 0.4088, 10, 0.8176, 11, 1.6352,
            12, 3.2704, 13, 6.5408, 14, 13.0816, 15, 26.1632, 16, 52.3264],
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
          "icon-pitch-alignment": "map",
          "icon-rotation-alignment": "map",
        },
        paint: {
          "icon-opacity": ["interpolate", ["linear"], ["zoom"], 8.5, 0, 9.5, 0.64],
        },
      });
      // The same distance covers more screen pixels in northern Sweden.
      // Layer paint/layout updates never replace the vector source.
      const updatePatternScale = () => {
        if (!map.getLayer(PATTERN_LAYER_ID)) return;
        const latitudeScale = 0.5 / Math.cos(map.getCenter().lat * Math.PI / 180);
        map.setLayoutProperty(PATTERN_LAYER_ID, "icon-size", [
          "interpolate", ["exponential", 2], ["zoom"],
          ...Array.from({ length: 9 }, (_, i) => [8 + i, 0.2044 * 2 ** i * latitudeScale]).flat(),
        ]);
      };
      updatePatternScale();
      map.on("moveend", updatePatternScale);
      // Retain the callback locally for this layer's cleanup.
      removePatternScaleListener = () => map.off("moveend", updatePatternScale);
    }

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
      onCellClickRef.current?.(props);
    };

    const handleEnter = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const handleLeave = () => {
      map.getCanvas().style.cursor = "";
    };
    const handleIdle = () => {
      if (!map.getLayer(HIT_LAYER_ID)) return;
      onFeatureCountChangeRef.current?.(map.queryRenderedFeatures({ layers: [HIT_LAYER_ID] }).length);
    };
    const handleSourceError = (event: unknown) => {
      const status = (event as { error?: { status?: number } })?.error?.status;
      if (status === 403) {
        onErrorRef.current?.(new PremiumRequiredError("Det här lagret ingår i premium."));
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
      removePatternScaleListener();
      if (map.getLayer(DOT_LAYER_ID)) map.removeLayer(DOT_LAYER_ID);
      if (map.getLayer(PATTERN_LAYER_ID)) map.removeLayer(PATTERN_LAYER_ID);
      if (map.getLayer(HIT_LAYER_ID)) map.removeLayer(HIT_LAYER_ID);
      if (map.getLayer(HEATMAP_LAYER_ID)) map.removeLayer(HEATMAP_LAYER_ID);
      if (map.getSource(TILE_SOURCE_ID)) map.removeSource(TILE_SOURCE_ID);
    };
  }, [isLoaded, layer, obsDate]);

  return (
    <div className="relative w-full h-full min-h-[400px]">
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
    </div>
  );
};

export default Map;
