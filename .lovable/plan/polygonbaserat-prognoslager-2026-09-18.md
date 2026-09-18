# Polygonbaserat prognoslager

## Ändringar
- Behåll en enda GeoJSON-källa för prognosdata.
- Konvertera varje inkommande prognos- eller fuktighetspunkt till en kvadratisk polygon med normaliserad `score` mellan 0 och 1.
- Rendera endast ett MapLibre-lager av typen `fill` med den angivna gröna, gula, orange och lila färgskalan samt `fill-opacity: 0.75`.
- Koppla klick och pekmarkör direkt till fill-lagret.
- Ta bort alla rester av `heatmap`- och `circle`-lager och verifiera detta med kodsökning.

## Kontroll
- Kontrollera typningen av polygonernas koordinater och egenskaper.
- Öppna kartan i mobil storlek och bekräfta att ytorna visas och att inga körfel uppstår.
