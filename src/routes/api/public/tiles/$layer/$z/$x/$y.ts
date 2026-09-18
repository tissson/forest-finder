/**
 * Vektorruttor (MVT) för kartlagren.
 * GET /api/public/tiles/:layer/:z/:x/:y
 *   layer = "moisture" eller ett art-id (t.ex. "1")
 * Premiumkontrollen sker i databasfunktionen via användarens token.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function decodeTile(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0) return new Uint8Array();
  if (value.startsWith("\\x")) {
    const hex = value.slice(2);
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i += 1) {
      out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
  }
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export const Route = createFileRoute("/api/public/tiles/$layer/$z/$x/$y")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const z = Number(params.z);
        const x = Number(params.x);
        const y = Number(String(params.y).replace(/\.(pbf|mvt)$/, ""));
        if (!Number.isFinite(z) || !Number.isFinite(x) || !Number.isFinite(y)) {
          return new Response("Ogiltig rutkoordinat", { status: 400 });
        }

        const url = new URL(request.url);
        const dateParam = url.searchParams.get("date");
        const obsDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : null;

        const supabaseUrl = process.env["SUPABASE_URL"];
        const supabaseKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !supabaseKey) {
          return new Response("Backend saknar konfiguration", { status: 500 });
        }

        const authHeader = request.headers.get("authorization");
        const supabase = createClient(supabaseUrl, supabaseKey, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.set("apikey", supabaseKey);
              if (authHeader) headers.set("Authorization", authHeader);
              else if (supabaseKey.startsWith("sb_")) headers.delete("Authorization");
              return fetch(input, { ...init, headers });
            },
          },
        });

        const isMoisture = params.layer === "moisture";
        const { data, error } = isMoisture
          ? await supabase.rpc("get_moisture_tile", { z, x, y, p_obs_date: obsDate })
          : await supabase.rpc("get_prediction_tile", {
              z,
              x,
              y,
              p_species_id: Number(params.layer),
              p_obs_date: obsDate,
            });

        if (error) {
          const message = error.message ?? "";
          if (message.includes("PREMIUM_REQUIRED")) {
            return new Response("PREMIUM_REQUIRED", { status: 403 });
          }
          console.error("Tile-fel:", message);
          return new Response("Kunde inte generera kartruta", { status: 500 });
        }

        const bytes = decodeTile(data);
        return new Response(bytes.length === 0 ? null : (bytes as unknown as BodyInit), {
          status: bytes.length === 0 ? 204 : 200,
          headers: {
            "Content-Type": "application/vnd.mapbox-vector-tile",
            "Cache-Control": "private, max-age=300",
          },
        });
      },
    },
  },
});
