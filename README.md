# Pokemon Watchdog

A static price-tracking site for Pokemon TCG cards, packs, ETBs, and booster
boxes: browse everything cheapest-to-highest, spot deals, filter by rarity,
pin cards for email price alerts, and find local card/game shops.

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

Prices flagged with ⚠️ (dealPct ≤ -50%) are unusually far below their own
average — more often a data glitch, a mis-listed/damaged item, or a bait
listing than a real steal. Every "Buy" link goes straight to TCGplayer's own
product page, which handles payment and buyer protection itself; this site
never touches your money. Still, verify the listing (condition, seller
rating, shipping cost) before buying anything that looks too good to be true.

## Pinning cards + email alerts

Pinning a card (the ☆ button) only saves it in that browser's `localStorage`
— a static site can't monitor anything on its own. To get emailed when a
pinned card gets cheap:

1. Pin cards, then go to the **Alerts** page. Optionally set a target price
   per card (leave blank to alert on a 15%+ drop vs. its 90-day average instead).
2. Click **Copy watchlist.json**, then **Edit watchlist.json on GitHub**,
   paste it in, and commit. This is the one manual step — a static site has
   no way to write back to the repo for you.
3. One-time setup: in the repo's **Settings → Secrets and variables →
   Actions**, add:
   - `GMAIL_ADDRESS` — a Gmail address to send from
   - `GMAIL_APP_PASSWORD` — a [Gmail App Password](https://myaccount.google.com/apppasswords)
     (requires 2-Step Verification on the account; this is **not** the
     account's normal login password)
   - `NOTIFY_EMAIL` *(optional)* — where alerts should be sent, if different
     from `GMAIL_ADDRESS`

`.github/workflows/watchlist-check.yml` runs `scripts/check_watchlist.py`
every 6 hours, comparing `docs/data/watchlist.json` against the latest
`all_items.json` and emailing a summary for anything that's hit its target
(or dropped sharply with no target set). It won't re-email for the same
price — only on a further drop — so it's safe to leave running.

Since the underlying TCGplayer data itself only updates roughly once a day,
checking every 6 hours mostly re-confirms that day's snapshot rather than
finding brand-new prices — but it means you'll get alerted soon after each
day's update lands, and it's cheap to run either way.

## Local shops

The **Local Shops** page (`docs/shops.html` / `docs/js/shops.js`) uses your
browser's geolocation (or a typed city/ZIP, geocoded via Nominatim) plus the
free, keyless [Overpass API](https://overpass-api.de) to find nearby
OpenStreetMap-tagged game/hobby/collectible shops (`shop=games`,
`collector`, `hobby`, `anime`, `comic`, `toys`). It queries a couple of
public Overpass mirrors with automatic fallback, since it's a shared
service that occasionally rate-limits or times out. This is community-mapped
data, not a verified "carries Pokemon cards" directory — call ahead.
