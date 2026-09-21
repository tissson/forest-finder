# Tät och sammanhängande prognosyta

## Ändringar
- Ta bort den kraftiga glesningen av 2×2 km-celler i kartrutorna och leverera alla relevanta landceller även i Sverigevyn.
- Behåll MVT så att den större datamängden fortfarande laddas per synlig kartruta och inte som en tung lista.
- Filtrera svaga värden i databasen, men sänk gränsen så relevanta skogsområden inte försvinner.
- Kalibrera värmekartans vikt, radie, intensitet och opacitet så närliggande celler bildar en tydlig sammanhängande yta: grönt → gult → orange → lila endast vid toppar.
- Uppdatera kartans versionsnyckel så gamla cachade kartrutor inte återanvänds.

## Kontroll
- Kontrollera Blåbär och Kantarell vid zoom 5, 8 och 12.
- Bekräfta att enskilda regelbundna prickar inte syns, att färgen är tydlig och att kartrutorna inte ger timeout eller andra fel.
- Kontrollera att klickinformationen fortfarande öppnas.

## Tekniskt
- Databasen fortsätter leverera punktgeometri i MVT; MapLibre sammanfogar punkterna visuellt.
- Tätheten ökas i källan i stället för att dölja ett glest underlag med överdrivet stora cirklar.
