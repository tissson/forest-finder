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
- Moisture tiles for zoom 5–7 are served from `moisture_tile_cache` (refreshed per tile by the nightly ingest, or via `refresh_moisture_tile_cache()` after reloading soil data); live computation at low zoom exceeds the anon statement timeout.
- Map callbacks are held in refs so parent re-renders never recreate the vector source (that refetched every tile).
