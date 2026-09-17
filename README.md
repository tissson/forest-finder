# Forest Finder

### Product Context & Goal
We are building a Swedish forage & mushroom forecasting PWA/mobile app ("Svamp- & Bärprognos"). 
The app helps users find top locations for mushrooms and berries based on weather and biotope data, with a privacy-first approach (5x5km grid anonymity). The UI should feel modern, clean, mobile-first, and forest-inspired (moss greens, warm chanterelle oranges, neutral slates).

Please integrate the provided production-ready React, TypeScript, and MapLibre components along with Supabase and API client modules. Wire up the full layout and install all required dependencies.

---

### 1. Dependencies to Install
Ensure the following npm packages are added to `package.json`:
- `maplibre-gl` (v6.9.0 or latest)
- `@supabase/supabase-js`
- `@types/geojson` (as a dev dependency)

### 2. Environment Variables Configuration
Expect and read the following environment variables (defined in `.env` / Project Settings):
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_BASE_URL`

---

### 3. File & Directory Structure

Please create/replace the files below with the following exact architecture:

- `src/lib/supabase.ts`: Supabase JS client setup utilizing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- `src/lib/api.ts`: FastAPI client handling JWT authorization headers, GeoJSON fetchers for `/predictions` and `/layers/moisture`, and discovery logging API calls.
- `src/components/Map.tsx`: MapLibre GL JS interactive map component using named imports (`import { Map, NavigationControl, GeolocateControl } from 'maplibre-gl'`). Handles dynamic Bounding Box querying (`GET /predictions?bbox=...`) on map movement and renders forage scoring layers.
- `src/components/LayerSelector.tsx`: Species and Moisture layer selection bar.
- `src/components/CameraCapture.tsx`: Mobile/Browser camera capture and file uploader with client-side image compression, EXIF rotation preservation (`imageOrientation: 'from-image'`), and privacy-first location lookup (`GET /zones/lookup?lat=...&lon=...` returning a 5x5km `weather_zone_id`).
- `src/components/LogDiscoveryModal.tsx`: Modal form capturing forage species, optional `quantity` (text), and `notes` (text up to 500 chars).
- `src/components/DiscoverySuccessModal.tsx`: Reward & gamification modal displaying earned XP/points and badge unlocks from the backend response.

---

### File Contents

#### File: `src/lib/supabase.ts`
[KLISTRA IN KODEN FÖR src/lib/supabase.ts HÄR]

#### File: `src/lib/api.ts`
[KLISTRA IN KODEN FÖR src/lib/api.ts HÄR]

#### File: `src/components/Map.tsx`
[KLISTRA IN KODEN FÖR src/components/Map.tsx HÄR]

#### File: `src/components/LayerSelector.tsx`
[KLISTRA IN KODEN FÖR src/components/LayerSelector.tsx HÄR]

#### File: `src/components/CameraCapture.tsx`
[KLISTRA IN KODEN FÖR src/components/CameraCapture.tsx HÄR]

#### File: `src/components/LogDiscoveryModal.tsx`
[KLISTRA IN KODEN FÖR src/components/LogDiscoveryModal.tsx HÄR]

#### File: `src/components/DiscoverySuccessModal.tsx`
[KLISTRA IN KODEN FÖR src/components/DiscoverySuccessModal.tsx HÄR]

---

### 4. Page Wiring & Layout Integration
Combine these components into `src/pages/Index.tsx` (or your main view):
1. Render the `Map` component as the full-screen background layer.
2. Overlay `LayerSelector` floating cleanly near the top of the screen.
3. Add a prominent Floating Action Button (FAB) for `CameraCapture` at the bottom right/center for quick access in the field.
4. Chain the modal flow upon capturing a photo: `CameraCapture` -> `LogDiscoveryModal` -> `DiscoverySuccessModal`.
5. Display a toast notification if a 403 response occurs on premium species layers.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/af8c4c78-4a38-4438-88cc-3e4c04f86b10).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
