# Byt prognosytan till ett mjukt heatmap-lager

## Ändringar
- Behåll befintlig hämtning, Sverige-begränsning, landfiltrering och tröskelvärde.
- Konvertera varje prognos- eller fuktighetscell till en GeoJSON-punkt med ett normaliserat `score` mellan 0 och 1.
- Byt källans namn till `fungi-data` och ersätt polygonlagret med ett enda MapLibre-lager: `fungi-heatmap` av typen `heatmap`.
- Använd exakt angiven viktning, zoomstyrd intensitet, färggradient, radie och opacitet.
- Ta bort polygonkonverteringen och säkerställ att inga circle-, fill- eller andra prognoslager finns kvar.

## Verifiering
- Kontrollera källkoden så att endast ett prognoslager registreras.
- Öppna den verkliga förhandsvisningen i mobilstorlek och bekräfta att kartan renderas utan körfel och utan synliga polygonrutor eller punktlager.

## Tekniskt
- Ändringen begränsas till `src/components/Map.tsx`; övrig navigation, lagerpanel och datahämtning lämnas oförändrade.
