# Fuktoptimum — 2026-11-08

Bilagan är byte-identisk med drizzle/migrations/0016_recalibrate_fungus_moisture_optimum.sql (SHA256 4ae6187a01742d2c286488f67eeef28ad546c56a6017bf332abdae8aff83bc40). Efter användarens godkännande tillämpades bilagans fullständiga SQL via dataändringsverktyget, INTE som registrerad Drizzle-migration. Journal och snapshots ändrades inte.

Profiler 1/2/5 återlästa: moisture_optimum=0.60, moisture_tolerance=0.30. Samtliga övriga profilfält och profiler 3/4/6 matchar före-läsningen.

refresh_stale_prediction_tiles(now(),90): refreshed=672, left=0, status=ok, obs_date=2026-11-08. Inget DELETE. Fuktcachefingeravtryck före/efter: cffbd31092bfcd789065b2bee2794484. Publicering oförändrad: 2026-11-08, 03:00:00.091577 UTC.

## Fördelning

Publicerad dag 2026-11-08. Andelar av alla 106272 aktiva rutor, med vattenmasken: 400 maskerade rutor räknas inte över trösklarna. Medel av de 105872 rutor som passerar vattenmasken, före visningströskeln 0.20. Ingen zoomgallring i nationell statistik. Före använder gamla fuktvärden 1:0.72/0.25, 2:0.82/0.20, 5:0.68/0.22 direkt i SELECT. Övriga termer är samma produktionsformel: kombinerad landfukt/väder, forest_share med forest_cover-fallback, trädterm, säsong och mask.

| Art | >0.2 före/efter % | >0.5 före/efter % | >0.7 före/efter % | Medel före/efter |
|---|---:|---:|---:|---:|
| Kantarell | 71.8157 / 78.2586 | 0.1082 / 0.3002 | 0 / 0 | 0.232146 / 0.256680 |
| Trattkantarell | 61.1723 / 77.7834 | 0.5307 / 3.7018 | 0.0160 / 0.2400 | 0.260141 / 0.306115 |
| Karl Johan | 54.9524 / 63.1220 | 0.0772 / 0.1957 | 0 / 0 | 0.207748 / 0.232346 |

Om maskerade rutor räknas som 0 i nationellt medel: kantarell 0.231272/0.255713, trattkantarell 0.259162/0.304963, Karl Johan 0.206966/0.231472.

## Sex tilekontroller

Cached bytea och live compute_prediction_tile avkodades som MVT, sorterades efter unika zone_id och jämfördes för ID, geometri, poäng/fukt på sex decimaler och datum. Alla sex matchar. Fem binärpayloads skiljer sig i ordning; detta är inte en innehållsskillnad.

| Art | Tile | Punkter | Byte | Innehåll matchar |
|---|---|---:|---:|---|
| Kantarell | 7/68/40 | 14 | 756 | ja |
| Kantarell | 7/70/32 | 803 | 41670 | ja |
| Trattkantarell | 7/68/40 | 38 | 1930 | ja |
| Trattkantarell | 7/70/32 | 789 | 40939 | ja |
| Karl Johan | 7/68/40 | 9 | 511 | ja |
| Karl Johan | 7/70/32 | 552 | 28623 | ja |

Fyra publika HTTP-tileanrop för arterna 1/2 fick 200 och matchade avkodad live-data. Karl Johan är premium: signed-out HTTP gav väntat 403, så ingen inloggad HTTP-verifiering av art 5 görs gällande. Dess två cache/live-kontroller ovan verifierades direkt via databasverktyget.
