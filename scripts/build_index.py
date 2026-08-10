"""Flattens docs/data/current/*.json + docs/data/history/*.json into a single
docs/data/all_items.json the frontend can fetch once instead of making
hundreds of requests. Also computes a simple "deal score" (current price vs.
its own recent historical average) so the site can rank best deals.

Usage: python build_index.py
"""
import os
import statistics

import common

HISTORY_WINDOW_DAYS = 90  # how many recent history points to average against


def recent_average(series, dates):
    points = [p for p in series if p is not None]
    if len(points) < 2:
        return None
    # series/dates are already chronological; take the tail as "recent"
    window = series[-HISTORY_WINDOW_DAYS:]
    window = [p for p in window if p is not None]
    if not window:
        return None
    # median, not mean: TCGplayer's archived snapshots occasionally contain
    # a single wildly-off price (price parking / data glitches on their end)
    # that would otherwise blow up a simple average.
    return statistics.median(window)


def historical_high(series):
    points = [p for p in series if p is not None]
    return max(points) if points else None


def main():
    items = []
    set_names = {}

    sets_data = common.load_json(common.SETS_FILE, {"sets": []})
    for s in sets_data["sets"]:
        set_names[s["groupId"]] = s["name"]

    for fname in os.listdir(common.CURRENT_DIR):
        if not fname.endswith(".json"):
            continue
        group_id = int(fname[:-5])
        current = common.load_json(os.path.join(common.CURRENT_DIR, fname), None)
        if not current:
            continue

        history_path = os.path.join(common.HISTORY_DIR, f"{group_id}.json")
        history = common.load_json(history_path, {"dates": [], "products": {}})
        dates = history.get("dates", [])

        for kind in ("cards", "sealed"):
            for product in current.get(kind, []):
                if product.get("market") is None:
                    continue
                series = history.get("products", {}).get(str(product["id"]))
                avg = recent_average(series, dates) if series else None
                high = historical_high(series) if series else None
                deal_pct = None
                if avg and avg > 0:
                    deal_pct = round((product["market"] - avg) / avg * 100, 1)

                items.append({
                    "id": product["id"],
                    "name": product["name"],
                    "setId": group_id,
                    "set": current.get("name") or set_names.get(group_id),
                    "type": "card" if kind == "cards" else "sealed",
                    "rarity": product.get("rarity"),
                    "number": product.get("number"),
                    "market": product["market"],
                    "low": product.get("low"),
                    "avg90d": round(avg, 2) if avg else None,
                    "high": round(high, 2) if high else None,
                    "dealPct": deal_pct,
                    "image": product.get("image"),
                    "url": product.get("url"),
                    "historyPoints": len([p for p in (series or []) if p is not None]),
                })

    common.save_json(os.path.join(common.DATA_DIR, "all_items.json"), {"items": items})
    print(f"Wrote {len(items)} items to all_items.json")


if __name__ == "__main__":
    main()
