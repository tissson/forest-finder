<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->
- Low-zoom (5–7) moisture and species tiles are served from `moisture_tile_cache` / `prediction_tile_cache`, filled in-database by `weather_finalize_daily()` (pg_cron, time-budgeted, resumable); live computation at low zoom exceeds the anon statement timeout. Deleting cache rows forces a recompute after data/profile changes.
- Nightly weather ingest runs inside the database (`weather_ingest_step()` via pg_net, every 2 min 02:00–02:58 UTC) because Open-Meteo rate-limits the shared app-server addresses; `weather_ingest_health()` raises at 03:45 so a missed night shows as a failed job. The old ingest route is unscheduled.
- Map callbacks are held in refs so parent re-renders never recreate the vector source (that refetched every tile).
- Maps show only the published weather date (`weather_published`, set by `weather_finalize_daily()` in the same transaction as the last cached tile) so a half-ingested night is never visible.
- Discovery photos and registration go only through `uploadDiscoveryImage`, which strips metadata before storage and AI classification; server-owned identification rows supply confidence, one-time commit handles awards, and authenticated users cannot execute either registration RPC or insert discoveries directly, preventing bypass and replay.
- AI providers and shared gateway helpers live in server-only modules and are instantiated per request; this keeps credentials and correlation state out of browser bundles and other requests.
- Keep map-audit experiments in standalone read-only scripts, outside the app execution path; experimental parameters and presence-background metrics must not silently alter production predictions.
