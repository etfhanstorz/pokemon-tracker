# Pokemon Watchdog

A static price-tracking site for Pokemon TCG cards, packs, ETBs, and booster
boxes: browse everything cheapest-to-highest, spot deals, and filter by
rarity.

## Data source

Prices come from [tcgcsv.com](https://tcgcsv.com), a free, keyless public
mirror of TCGplayer's market-price feed (no account or API key needed).
It also maintains a daily historical archive going back to 2024-02-08, which
is what lets this site show ~1 year of price history without paying for a
history API.

Two caveats inherited from the data source:
- Prices are TCGplayer market/low prices, not per-condition or graded prices.
- No sold-listing data — just aggregated market price snapshots.

## How it works

- `scripts/fetch_current.py` — pulls every Pokemon set's current products +
  prices, writes `docs/data/current/<setId>.json` and `docs/data/sets.json`,
  and appends today's price as a new point in `docs/data/history/<setId>.json`.
- `scripts/backfill_history.py` — one-time (or occasional) backfill that
  downloads tcgcsv.com's daily archives and samples one date per week for
  the last ~55 weeks, so the site launches with a real year of history
  instead of starting from zero. Safe to re-run; it skips dates it already has.
- `scripts/build_index.py` — flattens all sets into a single
  `docs/data/all_items.json` (with a `dealPct` = current price vs. its own
  trailing ~90-day average) so the frontend only has to fetch one file.
- `docs/` — the static site itself (plain HTML/CSS/JS, no build step).
  GitHub Pages serves this folder directly.
- `.github/workflows/update-prices.yml` — runs `fetch_current.py` +
  `build_index.py` daily and commits the updated JSON, so the live site
  keeps growing its own history automatically.

## Local setup

```bash
pip install -r scripts/requirements.txt
python scripts/fetch_current.py      # ~5-10 min, hits tcgcsv.com for all 217 sets
python scripts/backfill_history.py   # one-time, downloads ~55 weekly archives
python scripts/build_index.py        # rebuild docs/data/all_items.json
```

Then open `docs/index.html` in a browser (or serve the folder with any
static file server) to preview locally.

## Publishing to GitHub Pages

1. Push this repo to GitHub.
2. In the repo's Settings → Pages, set the source to **Deploy from a
   branch**, branch `main`, folder `/docs`.
3. The site will be live at `https://<your-username>.github.io/<repo>/`.
4. The daily GitHub Action needs push access to the repo — that's already
   granted by the default `GITHUB_TOKEN` via the `permissions: contents: write`
   line in the workflow, so no extra secrets are required.

## Notes on "deals"

"Best deals" ranks items by how far the current price sits below that
item's own trailing 90-day average (`dealPct`), requiring at least 3
historical data points so a single day's blip doesn't count. This is a
simple heuristic for personal price-tracking, not financial advice.
