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
