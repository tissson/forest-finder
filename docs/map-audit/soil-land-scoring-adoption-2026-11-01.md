# Markfukt i produktion — 1 november 2026

## Migration och cache

- `drizzle/migrations/0014_use_soil_wetness_land_in_scoring.sql` tillämpad.
- Bilaga och migrationsfil är byte-identiska: SHA256 `d8edec12cb69b14a42b1f002741b00d316a6571c2fdfff78779e562a9aed24de`.
- Först `SELECT public.refresh_stale_moisture_tiles(now(), 90);`: refreshed **112**, left **0**, status **ok**.
- Sedan `SELECT public.refresh_stale_prediction_tiles(now(), 90);`: refreshed **672**, left **0**, status **ok**.
- Ett anrop per cache räckte. Ingen DELETE utförd.
- Publicerad dag före och efter: **2026-11-01**. Cacheantal före/efter: **112 / 672**; inga cacheposter med fel väderdag efteråt.
- Artprofilernas hash före/efter är identisk: `3e158d90bf199c87c6b4fafff574b996`.
- Endast bilagans funktioner/kolumnkommentarer och cacheuppdateringen har körts. Inga kolumnvärden, artprofiler eller trösklar har skrivits.

## Tilekontroll

Fukt och kantarell jämfördes i tre tiles. Fem HTTP-anrop per tile genom den lokala appens ordinarie endpoint, datum 2026-11-01; **30/30 HTTP 200**. Tiderna är leverans från cache genom appen, inte live-omräkningstid eller ett kallstartstest. Storlek avser okomprimerad MVT-kropp.

| Område | Tile | Lager | Punkter | Byte från cache | Första anrop ms | Median ms |
|---|---|---|---:|---:|---:|---:|
| Skåne | 7/68/40 | Fukt | 59 | 2 305 | 606 | 106 |
| Skåne | 7/68/40 | Kantarell | 12 | 658 | 79 | 93 |
| Norrland | 7/70/32 | Fukt | 852 | 34 770 | 156 | 127 |
| Norrland | 7/70/32 | Kantarell | 752 | 39 020 | 90 | 105 |
| Vänern | 7/68/38 | Fukt | 1 373 | 56 045 | 125 | 102 |
| Vänern | 7/68/38 | Kantarell | 1 223 | 63 413 | 85 | 85 |

Live-underlaget togs direkt från `compute_moisture_tile` och `compute_prediction_tile` på samma publicerade dag, utan att spara någon beräkning. Avkodad MVT jämfördes punkt för punkt, sorterad på zone_id: **identiska ID:n, positioner, poäng, fuktvärden och datum i alla sex tiles och alla 30 leveranser**. Vänerns fukttile är 10 byte större från cache än live (56 045 mot 56 035); avkodad data matchar exakt, skillnaden ligger endast i binärkodningen.

## Aktiva rutor med mindre än 10 % NMD-land

Skrivskyddad SELECT på alla aktiva rutor (inte bara tile-zoomens glesade punkter). **400 av 106 272** har `nmd_land_fraction < 0.10`. Alla 400 har väder för publicerad dag. Ytterligare **29** aktiva rutor saknar landandel och ingår inte i dessa 400.

Poäng räknade direkt i SELECT med den nya tilefunktionens formel, inklusive säsong för **1 november**, forest_share-fallback, trädslag och weather-only-fallback vid NULL landfukt. Strikt **> 0,2**, inte >=.

| Art | Antal >0,2 bland 400 | Andel |
|---|---:|---:|
| Kantarell | 254 | 63,50 % |
| Trattkantarell | 268 | 67,00 % |
| Blåbär | 338 | 84,50 % |
| Lingon | 327 | 81,75 % |
| Karl Johan | 227 | 56,75 % |
| Hjortron | 80 | 20,00 % |

Resultatet innebär att vattenrika rutor fortfarande kan få artpoäng över visningströskeln; ingen landandelsspärr har införts.

## Kontroller och begränsningar

- Funktionskontroller i `scripts/map-audit/test-soil-land-scoring.sql`: NULL-fallback, 0,4 landvikt, 0,6 vädervikt, tröskel 0,20 och borttagen gammal markfuktsterm.
- Försöket att hasha alla väderrutors fullständiga rader före ändringen tog timeout; ingen full före/efter-checksumma för kolumnvärden finns. Inga skrivningar till dessa värden utfördes.
- Inga rättigheter ändrades för att möjliggöra livekontrollen; privilegierat frågeverktyg användes för enbart SELECT eftersom läsverktyget saknar EXECUTE på livefunktionerna.