# Markfuktgranskning 26 oktober 2026 — delresultat, inte slutförd

## Status och stopp

Steg 1–2 är genomförda. Steg 3–5 är **inte klara**. Arbetsmiljön avbröts under nationell rasterberäkning och återstartades; temporära raster och körskript försvann. Inga beräknade värden hade skrivits till databasen. Efter återstart verifierades 0 värden i var och en av de tre nya kolumnerna. Inga bakgrundsjobb fortsätter.

## 1. Klass 4 och empirisk vattenjämförelse

`soil-class-source-2026-10-20.txt`, rader 51–53: klasser 1 torr–frisk, 2 frisk–fuktig, 3 fuktig–blöt; klass 4 är öppet vatten (sjöar och vattendrag).

NMD2018 v1.1:s vattenklasser 61/62 lästes i tre tidigare pilotrutor. NMD:s 10 m-pixlar upprepades till SLU:s exakt inpassade 2 m-grid för maskjämförelsen, utan interpolation. Följande mättes innan avbrottet:

| Pilot, EPSG:3006-rutgränser | SLU klass-4-pixlar | NMD vatten, 2 m-ekvivalenter | Gemensamma vattenpixlar | Andel SLU-vatten i NMD-vatten | Vattenmaskernas IoU |
|---|---:|---:|---:|---:|---:|
| Blekinge–Skåne, 466000/6234000–468000/6236000 | 442586 | 441225 | 437329 | 98,8122 % | 97,9500 % |
| Vilhelmina, 578000/7166000–580000/7168000 | 261527 | 259575 | 256735 | 98,1677 % | 97,1131 % |
| Lycksele, 674000/7168000–676000/7170000 | 119701 | 119925 | 117938 | 98,5272 % | 96,9183 % |

Överlappet bekräftar vattenklassningen empiriskt, men maskerna är inte identiska. Upplösning/kartering skiljer sig; orsakerna till varje avvikande pixel är inte utredda. Gränspiloten använde Blekinges källa; Skånes fil har nodata på denna plats.

### Produkter och storlek

- Klassad: https://geodpags.skogsstyrelsen.se/geodataport/feeds/SLUMarkfuktighetKlassad.xml — 21 länsarkiv, sammanlagt **5 245 876 008 byte**, cirka 5,25 GB / 4,89 GiB komprimerat. Alla 21 hämtades och packades upp före avbrottet.
- Kontinuerlig: https://geodpags.skogsstyrelsen.se/geodataport/feeds/SLUMarkfuktighet.xml — finns och listar samma 21 län, sammanlagt **86 531 026 466 byte**, cirka 86,53 GB / 80,59 GiB komprimerat. Endast feed och HEAD kontrollerades; produkten laddades **inte** ned.
- Feederna anger EPSG:3006 och uppdatering 2021-03-03. Dokumentationen är produktbeskrivning version 1.0, 2020-10-16; feeden anger inte entydigt arkivens produktversion. Vissa arkiv hade senare Last-Modified-datum.
- Kontinuerlig produkt beskriver markfuktindex 0–100. 21 län innebär nationell länstäckning, inte fullständig giltig pixeltäckning: dokumentationen anger luckor i fjäll och längs kusten.
- För den separata NMD-jämförelsen lästes ZIP-katalogen med HTTP Range och endast den komprimerade TIFF-medlemmen hämtades (718 987 579 byte; uppackad 1 565 671 027 byte). Ingen annan NMD-version användes.

## 2. Backup och additiva kolumner

`soil-wetness-backup-2026-10-26.csv`: exakt **263 965 datarader**, kolumner `id,soil_wetness`; **112 141** befintliga icke-NULL-värden. Summa 39969,174; min 0,15; max 0,95. SHA-256:

`9bac7c49d6b2c2b7e1317305d1d1c46f90ebfde45f09ecebdee21807f93b70e9`

Migration `0013_add_soil_land_audit_columns.sql` tillämpad och kolumnerna verifierade via information_schema:

- `soil_wetness_land`: medel över klass 1–3, 15/45/70 dividerat med 100; 0/4/5/255 utesluts; NULL utan giltig mark.
- `soil_water_fraction`: klass 4 / hela rutans pixelantal.
- `soil_valid_fraction`: klass 1–4 / hela rutans pixelantal.

Endast den uttryckligen tillåtna nya laddningsfunktionen `load_soil_land_audit(jsonb)` skapades. Verifierad EXECUTE: anon=false, authenticated=false, service_role=true. Den skriver bara dessa nya kolumner och bara aktiva rutor. Inga befintliga funktioner patchades.

Fem konkreta tester i `scripts/map-audit/test_soil_land_rules.py` passerade, även efter omstart: klassvikter, uteslutna klasser, vattennämnare, giltighetsnämnare och NULL utan mark. Testerna validerar reglerna, inte den ofärdiga nationella GDAL-körningen.

## 3–5. Inte genomförda

En rikstäckande VRT med 21 källor skapades. Exakt `gdalwarp -tr 2000 2000 -tap -r average` var långsamt; omkodning till tre rasterband före samma mosaik-/medelvärdessteg provades. Arbetsmiljön avbröts under denna körning. Ingen komplett nationell rasterprodukt verifierades och ingen import utfördes.

En tidig lokal efterkontroll startade felaktigt innan rasterfilerna var färdigskrivna och läste tomma resultat; dessa **underkändes och importerades aldrig**. Det är inte evidens om rikstäckande markfukt. Vid återupptagande ska efterkontroller invänta lyckat processavslut för samtliga band, inte enbart att utdatafilen finns.

Därför saknas två länsgränskontroller, NULL-jämförelse med gamla värden, nationell differensfördelning/top20, sjötabeller för Vänern/Vättern/Mälaren samt artpoäng-/latitudtabeller för 24 oktober. Dessa får inte rapporteras som klara eller räknas mot ännu tomma kolumner.

## Verifierat oförändrat efter avbrottet

| Kontroll | Före | Efter |
|---|---|---|
| Befintliga skogs-/trädslags-/NMD-/markfuktvärdens MD5 | e08ead3bfacf151f69a65c52c55efb0b | e08ead3bfacf151f69a65c52c55efb0b |
| Artcache, 672 tiles, innehålls-MD5 | 85a6cf1b0c58af70204c3df6976ee514 | 85a6cf1b0c58af70204c3df6976ee514 |
| Fuktcache, 112 tiles, innehålls-MD5 | 72e2d932558c2ef511311f8d2a91222b | 72e2d932558c2ef511311f8d2a91222b |
| Publicerad dag | 2026-10-26 | 2026-10-26 |
| Publiceringstid UTC | 03:00:00.134178 | 03:00:00.134178 |
| Nya kolumner med värde | 0 / 0 / 0 | 0 / 0 / 0 |

Tabellen har fortsatt 263 965 rader och 106 272 aktiva rutor. Inga cache-DELETE, cachebyggen, profiljusteringar eller omräkningar kördes. Databasens raster-staging ändrades inte heller.