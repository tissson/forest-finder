# Synliga prognoser och zoomstyrda zoner

## Ändringar
- Sänk den absoluta datatröskeln till `0.01`, så även blåbär och arter med låga råvärden visas.
- Normalisera varje hämtat artlager mot dess högsta aktuella värde för att utnyttja hela färgskalan, men behåll det ursprungliga värdet i rutans data.
- Skala polygonernas geografiska storlek efter kartans zoom: tydliga regionala zoner i Sverigevyn, gradvis mindre ytor vid inzoomning och cirka 100 × 100 meter vid maximal zoom.
- Sätt `minZoom: 4.5` och `maxZoom: 16` i kartan, så både gester och navigeringsknappar följer samma gränser.
- Behåll ett enda kantlöst `fill`-lager och verifiera det i mobilvyn på både Sverige- och lokal zoomnivå.
