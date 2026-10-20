# GBIF bounded expansion

Read-only project/database: all outputs under /tmp/gbif-expanded. Live fetch took 4.91 seconds, under 3 minutes. Each species <=1,000 returned occurrences: fungi 900 general + up to 100 naturgucker, others first 1,000; this reserves access to the previously identified clean alternative without exceeding the cap. Not exhaustive or randomly representative; API ordering heavily concentrates recent years. No promise that unsampled records fail.

## Filters and quality
GBIF country=SE, year=2018,2025, occurrenceStatus=PRESENT, hasCoordinate=true, hasGeospatialIssue=false, coordinateUncertaintyInMeters=0,1000; repeated license=CC0_1_0/CC_BY_4_0. Rechecked these fields locally, required taxonKey=acceptedTaxonKey=speciesKey=requested numeric key, SPECIES rank and ACCEPTED status; rejected major issues from top-level AND all supplied classifications (conservative across backbone versions). Exact issue list and full reproducible method in expand.py. Required day-resolved dates and rejected multi-day intervals, stricter than old month-precision pilot, appropriate for daily weather. These are not independently identification-verified observations. Issue-reason counts overlap; rejected is distinct records.

Per species across all years: remove repeated GBIF IDs, project EPSG:3006, lowest GBIF key per floor 2km cell, then reject any candidate <2km from a previously retained point, including adjacent cells. Deterministic greedy thinning, not maximum independent-set optimization. Latitude regions match previous pilot: <59, 59–<63, >=63 (Swedish coordinates); admin-region-year.csv also supplies GBIF GADM level1 counties. No further 30-record selection cap.

## Exact counts
Taxon | fetched | unique IDs | quality pass | selected >=2km | south / middle / north | occupied 20km blocks
---|---:|---:|---:|---:|---|---:
5249504 | 922 | 922 | 22 | 18 | 10 / 8 / 0 | 16
2554536 | 1000 | 1000 | 984 | 653 | 277 / 293 / 83 | 339
2882833 | 1000 | 1000 | 985 | 533 | 229 / 245 / 59 | 275
2882835 | 1000 | 1000 | 974 | 585 | 227 / 269 / 89 | 309
5954958 | 926 | 918 | 26 | 23 | 16 / 7 / 0 | 19
2998290 | 1000 | 1000 | 976 | 739 | 143 / 261 / 335 | 436

Total selected: 2551.

## Exact region/year counts
Unlisted combinations, including all 2018–2019, have zero selected records.

```csv
taxon_key,region,year,count
2554536,55–59,2023,54
2554536,55–59,2024,118
2554536,55–59,2025,105
2554536,59–63,2023,37
2554536,59–63,2024,119
2554536,59–63,2025,137
2554536,63–70,2023,12
2554536,63–70,2024,45
2554536,63–70,2025,26
2882833,55–59,2025,229
2882833,59–63,2025,245
2882833,63–70,2025,59
2882835,55–59,2025,227
2882835,59–63,2025,269
2882835,63–70,2025,89
2998290,55–59,2024,79
2998290,55–59,2025,64
2998290,59–63,2024,140
2998290,59–63,2025,121
2998290,63–70,2024,209
2998290,63–70,2025,126
5249504,55–59,2020,1
5249504,55–59,2021,4
5249504,55–59,2022,2
5249504,55–59,2024,3
5249504,59–63,2021,2
5249504,59–63,2022,4
5249504,59–63,2024,2
5954958,55–59,2020,5
5954958,55–59,2021,6
5954958,55–59,2022,3
5954958,55–59,2024,2
5954958,59–63,2020,1
5954958,59–63,2021,1
5954958,59–63,2024,5
```

## Spatial holdout feasibility
The four non-Cantharellus/Boletus species have hundreds of separated presences across all three latitude regions: enough to attempt exploratory spatially blocked presence-background evaluation, not proof of adequate effective sample size or power. Use occupied 20km blocks (saved CSV) as candidate groups, not random point splitting; tune block scale to ecological/weather autocorrelation and buffer train/test boundaries. Minimum 2km spacing is not independence, and weather grids are substantially coarser. Recompute retained test/train sizes after buffering; require adequate independent blocks and background sampling per fold. No actual model or validated holdout AUC has been produced. Cantharellus 18 and Boletus 23, none northern, are not defensible for robust nationwide spatial holdout and do not meet >30. Main-stream major taxonomy issues remain: 900/900 Cantharellus general records rejected; Boletus 892/900 general records rejected, eight clean general records overlap naturgucker. All 22/26 naturgucker records pass pre-thinning but yield only 18/23. Do not silently relax flags to inflate sample size. Vaccinium selections only cover 2025; other species also have restricted year coverage, so temporal generalization to 2018–2025 cannot be tested from this bounded sample.

## Historical weather path and limits
The given existing OpenMeteo daily database has only 11 dates in 2026: it does not overlap these 2018–2025 records. That premise was not independently re-queried here. No database modifications or large history fetches performed.

Workable endpoint: https://archive-api.open-meteo.com/v1/archive with latitude/longitude, start_date, end_date, daily=temperature_2m_mean,precipitation_sum, timezone=Europe/Stockholm, models=era5. Fetch only event-day/antecedent windows for occupied weather cells, include lag-window days before the observation (possibly preceding 2018), cache unique cell/date/model combinations, and inspect non-null coverage for every predictor before joining. Three-day Stockholm 2018 smoke tests only, saved JSON: ERA5-Land temperature succeeds but precipitation_sum is null on all three days; explicit ERA5 is the tested alternative for precipitation. Never fill such nulls as zero. Verify required soil/moisture variables separately and pin the model to avoid silent dataset switching.

Official documentation: https://open-meteo.com/en/docs/historical-weather-api — ERA5 from 1940 (~0.25 degrees), ERA5-Land from 1950 (~0.1 degrees), covers 2018–2025, but reanalysis is coarse relative to 2km occurrences and not an issued forecast. Operational archives have publication delay (commonly several days); this does not affect 2018–2025. Account/usage limits, model-specific variables, spatial snapping, elevation and daily timezone aggregation constrain practical use; batch/cache small windows and honor current API terms rather than requesting full nationwide history.

https://open-meteo.com/en/docs/historical-forecast-api — coverage starts around 2022, model dependent, stitched short-lead series, not full issuance/lead history; does not solve 2018–2021 operational forecast validation. For lead-specific tests investigate Single Runs / Previous Runs APIs and their actual model/lead/start coverage. Reanalysis supports retrospective environmental association only, not full forecast AUC. GBIF presences are not absence, ripe-fruit, harvest yield or detection-effort labels; presence-background AUC needs suitable bias-aware backgrounds and leakage-controlled spatial folds, and cannot establish forecast skill.

## Files
Raw GBIF responses: taxon-source-offset.json; request URLs, counts, timestamps and SHA256: requests.json; selected.csv; rejected.csv; summary.json; region-year.csv; admin-region-year.csv; spatial-blocks-20km.csv; expand.py; weather-smoke.json and weather-era5-smoke.json. Re-run with python3 expand.py with requests and pyproj available (script uses temporary /tmp/gbif-python library path). Live GBIF data/order can change; saved raw pages and hashes preserve this run.
