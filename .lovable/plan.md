# Finjustera värmekartan till tät Satokausi-stil

## Ändringar
- Behåll MVT-källan och dess täta, zoomstyrda punktdata.
- Sätt `heatmap-weight` till exakt noll under 0,35 och skala sedan vikten försiktigt upp mot 1,0.
- Minska radien till 10–25 px genom hela zoomspannet och sänk intensiteten så överlappande punkter inte mättar kartan.
- Kalibrera färggradienten från helt transparent via svagt blå/grönt, grönt, gult och orange till rosa/lila endast vid de högsta tätheterna.
- Behåll det osynliga klicklagret och befintliga popup-detaljer.

## Verifiering
- Kontrollera mobilvyn vid zoom 5, 9 och 12 för blåbär och kantarell.
- Bekräfta att torra områden är genomskinliga, att regelbundna cirklar inte syns och att kartan inte blir en enfärgad matta.
- Kontrollera att tile-anrop fungerar och att klick fortfarande öppnar detaljer.
