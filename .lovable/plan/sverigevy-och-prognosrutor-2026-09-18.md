# Sverigevy och prognosrutor

## Ändringar
- Sätt kartans standardläge till `[15.0, 62.0]`, zoom 5, och begränsa panorering till Sveriges angivna gränser.
- Omvandla varje prognos- och fuktighetspunkt till en stabil 5×5 km polygon innan den skickas till MapLibre.
- Ersätt punktlagret med ett polygonlager vars färg och transparens följer värdet 0–1, med tydlig kontrast mellan låga och höga nivåer.
- Hämta data för den synliga Sverigevyn direkt när kartan öppnas och efter förflyttning.

## Kontroll
- Kontrollera i webbläsaren att Sverige visas vid start, att rutorna syns för valt lager och att kartan inte kan dras utanför gränserna.
- Kontrollera både dator- och mobilbredd utan överlappande kartkontroller.

## Tekniskt
- Behåll befintliga databasfunktioner och 5×5 km-anonymitet; endast kartpresentationen ändras.
- Använd polygongeometri i GeoJSON och MapLibres `fill`/`line`-lager med interpolerad färgskala.
