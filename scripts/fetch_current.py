"""Fetch current Pokemon card + sealed-product prices from tcgcsv.com and
write them into docs/data/. Also appends today's prices onto each set's
history file, so running this daily (via GitHub Actions) grows real history.

Usage: python fetch_current.py
"""
import datetime
import os
import sys

import common


def build_set_payload(group, products, prices_by_product):
    cards = []
    sealed = []
    for product in products:
        kind, ext = common.classify_product(product)
        price = prices_by_product.get(product["productId"])
        market = common.sane_market_price(price)
        low = price.get("lowPrice") if price else None
        entry = {
            "id": product["productId"],
            "name": product["name"],
            "image": product.get("imageUrl"),
            "url": product.get("url"),
            "releasedOn": (product.get("presaleInfo") or {}).get("releasedOn"),
            "market": market,
            "low": low,
        }
        if kind == "card":
            entry["rarity"] = ext.get("Rarity")
            entry["number"] = ext.get("Number")
            cards.append(entry)
        else:
            sealed.append(entry)

    return {
        "groupId": group["groupId"],
        "name": group["name"],
        "abbreviation": group.get("abbreviation"),
        "releasedOn": group.get("publishedOn"),
        "cards": cards,
        "sealed": sealed,
    }


def append_today_snapshot(group_id, products, prices_by_product, today):
    path = os.path.join(common.HISTORY_DIR, f"{group_id}.json")
    history = common.load_json(path, {"dates": [], "products": {}})

    if today in history["dates"]:
        date_index = history["dates"].index(today)
    else:
        history["dates"].append(today)
        date_index = len(history["dates"]) - 1
        for series in history["products"].values():
            series.append(None)

    for product in products:
        pid = str(product["productId"])
        price = prices_by_product.get(product["productId"])
        market = common.sane_market_price(price)
        series = history["products"].setdefault(pid, [None] * len(history["dates"]))
        while len(series) < len(history["dates"]):
            series.append(None)
        series[date_index] = market

    common.save_json(path, history)


def main():
    common.ensure_dirs()
    today = datetime.date.today().isoformat()

    groups = common.fetch_groups()
    print(f"Found {len(groups)} Pokemon sets", file=sys.stderr)

    sets_index = []
    for i, group in enumerate(groups):
        group_id = group["groupId"]
        products = common.fetch_products(group_id)
        common.sleep_between_requests()
        price_rows = common.fetch_prices(group_id)
        common.sleep_between_requests()

        if not products:
            continue

        prices_by_product = common.group_prices_by_product(price_rows)
        payload = build_set_payload(group, products, prices_by_product)
        common.save_json(os.path.join(common.CURRENT_DIR, f"{group_id}.json"), payload)
        append_today_snapshot(group_id, products, prices_by_product, today)

        sets_index.append({
            "groupId": group_id,
            "name": group["name"],
            "abbreviation": group.get("abbreviation"),
            "releasedOn": group.get("publishedOn"),
            "cardCount": len(payload["cards"]),
            "sealedCount": len(payload["sealed"]),
        })

        print(f"[{i + 1}/{len(groups)}] {group['name']} - {len(products)} products", file=sys.stderr)

    sets_index.sort(key=lambda s: s.get("releasedOn") or "", reverse=True)
    common.save_json(common.SETS_FILE, {"lastUpdated": today, "sets": sets_index})
    print("Done.", file=sys.stderr)


if __name__ == "__main__":
    main()
