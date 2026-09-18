# Byt prognosytor till heatmap

## Ändringar
- Ta bort all polygon- och fill-logik i `Map.tsx`, inklusive zoomstyrd rutstorlek.
- Behåll prognosdata som rena GeoJSON Point-features med normaliserad `score`.
- Skapa endast lagret `fungi-heatmap` mot `predictions-source` med exakt angiven vikt, intensitet, färg, radie och opacitet.
- Koppla eventuell interaktion till heatmap-lagret och säkerställ att inga gamla polygonlager finns kvar.

## Verifiering
- Kontrollera källkoden efter `Polygon`, `fill` och gamla lager-id:n.
- Öppna mobilförhandsvisningen och bekräfta att kartan visar mjuka värmezoner utan fyrkanter eller körfel.
