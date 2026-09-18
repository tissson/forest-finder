# Sömlösa prognosytor på kartan

## Ändringar
- Ta bort `predictions-heatmap` och all heatmap-konfiguration från kartan.
- Omvandla varje API-punkt till en cirka 5×5 km GeoJSON-polygon centrerad på koordinaten.
- Behåll `score` mellan 0 och 1 på varje polygon.
- Lägg till exakt ett datalager: `predictions-zone-fill` av typen `fill`, kopplat till `predictions-source`.
- Använd den angivna blå–gröna–orange–röda färgskalan, transparent kant och 0,75 opacitet.
- Behåll befintlig landmask och tröskelfiltrering så hav och irrelevanta värden inte visas.

## Verifiering
- Kontrollera i koden att endast en prognoskälla och ett prognoslager finns.
- Kontrollera mobilförhandsvisningen och säkerställ att kartan renderas utan körfel.

## Teknisk detalj
Polygonernas longitudbredd justeras efter latitud, så varje cell motsvarar ungefär 5 km även längre norrut.
