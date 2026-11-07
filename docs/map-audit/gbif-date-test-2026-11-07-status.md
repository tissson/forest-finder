# Partial GBIF date export — 2026-11-07

**Not complete.** No database access or changes were made. No app function, tile, cache, profile, threshold or column was changed.

## Saved outputs

- `gbif-date-test-2026-11-07.csv`: 882 verified rows, 42 findings with all 20 controls.
- `gbif-date-test-2026-11-07-metadata.json`: fixed seed, method, source/output hashes, separate exclusions and pending records.
- `gbif-date-weather-checkpoints/`: 27 full-range ERA5 responses in separate `.json.gz` files plus `requests.json`. These project files survive interruption; no dependence on temporary downloads.
- `../../scripts/map-audit/gbif_date_test.py`: resumable standalone export script.

| Species | Input | Complete findings | Excluded | Awaiting archive |
|---|---:|---:|---:|---:|
| Craterellus tubaeformis | 653 | 33 | 4 | 616 |
| Rubus chamaemorus | 739 | 9 | 0 | 730 |

Four finding dates are outside the requested archive coverage: 2025-12-16, 2025-12-18, 2025-12-19, 2025-12-23. No findings are outside 2020–2025. Pending requests are **not** classified as missing weather or exclusions.

## Method and verification

Same previously tested archive: `https://archive-api.open-meteo.com/v1/archive`, pinned `models=era5`, timezone `Europe/Stockholm`, daily `precipitation_sum,temperature_2m_mean`, 2020-07-01–2025-12-15 inclusive. Coordinates rounded to 0.1° using decimal half-up; original finding coordinates retained in CSV. 1,110 distinct rounded locations in the selected input.

Precipitation sums include the target day and preceding six/nine days. A record requires ten consecutive non-null precipitation values and non-null temperature on the target day. No missing value is replaced by zero. Temperature is the target day's daily mean.

Controls: 20 distinct uniformly sampled dates among fully available archive days, years 2020–2025, cyclic calendar month/day distance ≤30 from the finding, excluding its actual date. Seed 20261107; independent deterministic generator per original GBIF key. Leap-year calendar used for calendar distance; exported day_of_year uses each date's actual year.

Four rule tests passed. Independently checked all 42 blocks: one presence and 20 distinct controls, same location, correct window/year/day_of_year, and all three weather values against persisted daily arrays. Zero discrepancies. No additional statistical calculations or conclusions.

## Why the run stopped

Official pricing explains that periods exceeding two weeks count as multiple API calls: https://open-meteo.com/en/pricing . Official free-tier limits: 600/minute, 5,000/hour, 10,000/day: https://open-meteo.com/en/terms . A 1,994-day request is conservatively accounted as 143 calls. This run accounts for the smoke request too and stops before conservative rolling budgets of 450/minute, 4,000/hour, 8,000/day. It stopped at the hourly budget, not at a weather-data error. No request failed.

The full job cannot fit into one free-tier day even with no other shared-IP traffic. No automatic work continues after this turn. Resume later with:

```sh
python3 scripts/map-audit/gbif_date_test.py --max-locations 25
```

It reuses every saved location and checks the durable request ledger before sending anything. HTTP 429/5xx/network failures stop the batch and preserve completed work; the ledger records provider cooldown/error details. Rerun only after any indicated cooldown. The same dated partial CSV is atomically regenerated from saved inputs; metadata explicitly marks it incomplete until every eligible location is resolved.

Weather attribution: Open-Meteo / ERA5, CC BY 4.0, https://open-meteo.com/ . GBIF dataset identifiers and licenses remain in the original selected CSV.