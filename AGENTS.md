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
- Nightly weather ingest is stepwise: each call to the ingest route fetches at most one small batch of missing sample points, because one long request never completes on the hosted server.
- Map callbacks are held in refs so parent re-renders never recreate the vector source (that refetched every tile).
