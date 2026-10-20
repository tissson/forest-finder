# Discovery AI
- [x] Read-only map audit: published weather, sharing, moisture/temperature, forest distributions, all species scores and pairwise correlations; report saved.
- [x] Execute approved exploratory map audit: Jämtland raster counted, official soil classes checked, species sources reviewed, 11-day interpolation benchmark and six-species habitat pilot measured; report and proposal prepared.
- [ ] Apply map/weather/habitat changes — blocked pending Patrik's approval of the new proposal; national reload also requires separate approval and backup.
- [ ] Complete independent GBIF presence-background validation — requires quality-screened records and historical weather; only 11 weather dates currently retained.
- [ ] Complete seven sourced Wikimedia photo tests: four clean positives and one mixed-berry rejection reported; clean bilberry, cloudberry and fly agaric blocked by Wikimedia HTTP 429 (Retry-After 600s).
- [x] Move identification and discovery registration to the metadata-stripping server function; reject none and low confidence (nine tests pass).
- [x] Revoke authenticated execution of both registration RPCs and direct discovery INSERT; effective grants verified false.
- [ ] Verify signed-in upload, mismatch confirmation, one-time registration and saved-photo readback — blocked: no auth users; session minting cannot sign in.
- [ ] Obtain approval of permanent confidence threshold — waits for complete photo trial and Patrik's decision; 0.70 remains provisional.