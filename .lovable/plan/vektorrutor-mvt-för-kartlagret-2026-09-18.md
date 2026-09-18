# Vektorrutor (MVT) för kartlagret

Kartan hämtar i dag långa punktlistor från databasen och ritar dem som cirklar i webbläsaren. Det begränsar hur många rutor vi kan visa. Vi byter till färdigritade kartrutor som servern levererar — samma teknik som Satokausi och Google Maps använder — så att kartan kan visa tio gånger fler rutor och ändå kännas snabb.

## Så blir resultatet

- Heltäckande mosaik av 2x2 km-ytor utan glipor, i skalan sval blå → mjuk grön → varm orange → djup bär-lila.
- Data laddas per kartruta och cachas, så panorering och zoomning känns omedelbar.
- Klick på en yta öppnar fortfarande detaljinformation (poäng, fukt, datum).
- Premiumarter förblir låsta för icke-betalande.

## Teknisk plan

### 1. Databas (migration)

Ny funktion `get_prediction_tile(z, x, y, p_species_id, p_obs_date)`:
- Beräknar samma score som `get_predictions` (0.50 fukt + 0.25 mark-hash + 0.25 skog, gånger säsong), joinar väder via `weather_sample_id`, filtrerar `is_active`.
- Väljer zoner med `weather_zones.geom && ST_TileEnvelope(z,x,y)` (GIST-index finns), klipper med `ST_AsMVTGeom` så polygonerna möts kant i kant.
- Zoomberoende glesning: z ≤ 6 → var 8:e ruta, z 7–9 → var 3:e, z ≥ 10 → alla. Sparar bandbredd utan synliga hål tack vare att geometrin är den faktiska rutan.
- Returnerar `bytea` (`ST_AsMVT` med lagernamnet `predictions`, attribut `score`, `zone_id`, `moisture`).
- Motsvarande `get_moisture_tile(z, x, y, p_obs_date)` för fuktlagret.
- Premiumkontroll i funktionen, precis som i dag (`user_profiles.is_premium`); SECURITY DEFINER + GRANT EXECUTE till anon/authenticated/service_role.

### 2. Tile-endpoint

Ny serverrutt `src/routes/api/public/tiles/$layer/$z/$x/$y.ts`:
- Anropar rätt databasfunktion, avkodar base64 och svarar med `application/vnd.mapbox-vector-tile`.
- `Cache-Control: private, max-age=300` (användarberoende premiumsvar).
- Skickar vidare användarens inloggningstoken när den finns, så premiumkontrollen fungerar.

### 3. Map.tsx

- `geojson`-källan och cirkellagret tas bort tillsammans med bbox-hämtning, debounce, delområden och normalisering i klienten.
- Ny `vector`-källa med `tiles: ["/api/public/tiles/{layer}/{z}/{x}/{y}?date=…"]`, `minzoom: 4`, `maxzoom: 12` (överzoomning ger skarpa rutor upp till zoom 16).
- Ett `fill`-lager (`source-layer: "predictions"`):
  - `fill-color`: interpolation på `score` — 0 genomskinligt, 0.15 sval blå, 0.4 mjuk grön, 0.7 varm orange, 1.0 djup bär-lila.
  - `fill-outline-color: "transparent"`, `fill-opacity: 0.78`, `fill-antialias: false`.
- Byte av art/lager uppdaterar källans `tiles`-URL (källan skapas om), utan att kartvyn rör sig.
- `transformRequest` lägger på inloggningstoken för tile-anropen.
- Klick på lagret öppnar en popup med art/fukt, poäng och datum och anropar fortfarande `onCellClick`.
- `onFeatureCountChange` rapporterar antal synliga rutor via `map.queryRenderedFeatures` efter `idle`.

### 4. Rensning

- Landmasken behövs inte längre i klienten — `is_land`/`is_active` filtreras redan i databasen; `@turf`-filtret tas bort från kartan.
- `getPredictions`/`getMoistureLayer` behålls i `src/lib/api.ts` (används av andra vyer), men kartan slutar anropa dem.

### 5. Verifiering

Playwright i mobilvy: zoom 5, 8 och 12 för blåbär och kantareller — kontroll av att rutor renderas kant i kant, att tile-anropen svarar 200 och att klick öppnar popupen.
