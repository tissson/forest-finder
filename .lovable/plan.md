# Ren heatmap och mobil först

## Ändringar
- Skicka endast filtrerade GeoJSON-punkter med ett normaliserat `weight`-värde till MapLibre.
- Ta bort polygon-, fill-, line- och circle-lager helt och behåll ett enda `heatmap`-lager med dynamisk radie, mjuk transparens och lagerspecifika färgskalor.
- Dölj zoomknappar på mobil och placera GPS-kontrollen nere till höger ovanför bottenmenyn.
- Ersätt den alltid öppna lagerväljaren på mobil med en tumvänlig bottenmeny och en glidande bottom sheet för art/lager.
- Behåll en tydlig kameraåtgärd med minst 48×48 px tryckyta och säkra marginaler för mobilens nederkant.

## Kontroll
- Verifiera att kartans källa endast innehåller punkter och att endast heatmap-lagret finns.
- Kontrollera visuellt på mobil och dator att värmeytan är sammanhängande utan rutor eller kanter.
- Kontrollera på mobil att lagerpanelen öppnas nedifrån, GPS och kamera är lättåtkomliga och inget överlappar.

## Tekniskt
- Behåll befintlig landmask, tröskelfiltrering, datakällor och inloggningsflöde.
- Använd befintliga designkomponenter och respektera reducerad rörelse.
