# Zoomstyrd kartdata med LOD och bounding box

## Mål
Kartan ska hämta lagom mycket prognosdata för den synliga kartytan: snabbt på Sverige-nivå och mer detaljerat vid lokal zoom, utan onödiga anrop under panorering.

## Genomförande
1. **Gemensamma LOD-inställningar i API-lagret**
   - Lägg till en tydlig frågekonfiguration för `limit` och `minScore`.
   - Prognoser använder alltid aktuell `bbox` i databasanropet.
   - Fuktighetslagret får samma anropsform och filtrering så lagerbyten följer samma prestandaregler.

2. **Zoomstyrd hämtning i kartan**
   - Zoom `< 7`: `limit: 1500`, `minScore: 0.15`.
   - Zoom `7–10`: `limit: 8000`, `minScore: 0.08`.
   - Zoom `> 10`: `limit: 25000`, `minScore: 0.02`.
   - Läs zoom och synlig bounding box precis när hämtningen startar.

3. **Debounce och säkra svar**
   - Samla `moveend` och `zoomend` i samma 300 ms debounce.
   - Behåll en omedelbar första hämtning när kartan eller valt lager blir klart.
   - Ignorera äldre svar om användaren flyttar kartan eller byter lager innan föregående anrop är färdigt.
   - Rensa timer och events när kartan eller effekten stängs.

4. **Satokausi-liknande rendering**
   - Behåll ett enda skarpt `fill`-lager med sömlösa polygonceller, landmask och befintlig färgskala.
   - Uppdatera samma GeoJSON-källa när bbox/zoom ändras; inga parallella gamla lager eller punkt-/cirkelmoln.

## Teknisk kontroll
- Kontrollera TypeScript via projektets automatiska kontroll.
- Verifiera i förhandsvisningen på mobil: Sverigevy, mellanzoom och lokal zoom.
- Kontrollera att nätverksanrop följer rätt bbox, `limit` och `minScore`, samt att snabb panorering bara ger ett slutligt anrop.
