"""Shared helpers for talking to tcgcsv.com (a free, keyless public mirror of
TCGplayer's price-guide data) and for reading/writing the JSON files under docs/data.
"""
import json
import os
import time

import requests

POKEMON_CATEGORY_ID = 3
BASE_URL = "https://tcgcsv.com/tcgplayer"
ARCHIVE_URL = "https://tcgcsv.com/archive/tcgplayer"

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "docs", "data")
CURRENT_DIR = os.path.join(DATA_DIR, "current")
HISTORY_DIR = os.path.join(DATA_DIR, "history")
SETS_FILE = os.path.join(DATA_DIR, "sets.json")

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "PokemonWatchdog/1.0 (personal price tracker)"})

REQUEST_DELAY = 0.25


def get_json(url):
    resp = SESSION.get(url, timeout=30)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def fetch_groups():
    data = get_json(f"{BASE_URL}/{POKEMON_CATEGORY_ID}/groups")
    return data["results"] if data else []


def fetch_products(group_id):
    data = get_json(f"{BASE_URL}/{POKEMON_CATEGORY_ID}/{group_id}/products")
    return data["results"] if data else []


def fetch_prices(group_id):
    data = get_json(f"{BASE_URL}/{POKEMON_CATEGORY_ID}/{group_id}/prices")
    return data["results"] if data else []


def classify_product(product):
    """Returns ('card' | 'sealed', extendedData-as-dict)."""
    ext = {e["name"]: e["value"] for e in product.get("extendedData", [])}
    if "Rarity" in ext:
        return "card", ext
    return "sealed", ext


def best_price_entry(entries):
    """Pick the most representative price row for a product that has multiple
    printings/subtypes (e.g. Normal vs Holofoil). TCGplayer often carries a
    near-worthless placeholder 'Normal' row for cards that only really exist
    as Holofoil/Reverse Holofoil, so instead of preferring 'Normal' outright
    we take the entry with the highest market price - for commons (which
    usually only have one valid subtype anyway) this is a no-op, and for
    holo-only rares it avoids picking the bogus placeholder."""
    if not entries:
        return None
    valid = [e for e in entries if e.get("marketPrice") is not None]
    if valid:
        return max(valid, key=lambda e: e["marketPrice"])
    return entries[0]


def group_prices_by_product(price_rows):
    by_product = {}
    for row in price_rows:
        by_product.setdefault(row["productId"], []).append(row)
    return {pid: best_price_entry(rows) for pid, rows in by_product.items()}


def sane_market_price(price_entry):
    """TCGplayer's marketPrice occasionally glitches to near-zero while
    lowPrice stays sane (e.g. marketPrice=$1.38 but lowPrice=$999.69, which
    is not physically possible - market should never be far below the
    cheapest listing). When that happens, fall back to lowPrice instead of
    trusting the bogus market figure."""
    if price_entry is None:
        return None
    market = price_entry.get("marketPrice")
    low = price_entry.get("lowPrice")
    if market is not None and low and low > 1 and market < low * 0.5:
        return low
    return market


def ensure_dirs():
    os.makedirs(CURRENT_DIR, exist_ok=True)
    os.makedirs(HISTORY_DIR, exist_ok=True)


def load_json(path, default):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def sleep_between_requests():
    time.sleep(REQUEST_DELAY)
