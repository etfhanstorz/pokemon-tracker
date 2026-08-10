"""One-time (or occasional) backfill of historical Pokemon prices using
tcgcsv.com's daily archive of TCGplayer price snapshots
(https://tcgcsv.com/archive/tcgplayer/prices-YYYY-MM-DD.ppmd.7z).

Archives only exist from 2024-02-08 onward. To keep bandwidth/runtime
reasonable we sample weekly (one date every 7 days) rather than daily -
that's still ~52+ data points, plenty for a "price over the last year" view.
Going forward, fetch_current.py appends a real daily point on top of this.

Usage: python backfill_history.py [--weeks 55] [--tmp-dir ./tmp_archive]
"""
import argparse
import datetime
import os
import shutil
import sys

import py7zr
import requests

import common

ARCHIVE_EARLIEST = datetime.date(2024, 2, 8)


def archive_url(date):
    return f"{common.ARCHIVE_URL}/prices-{date.isoformat()}.ppmd.7z"


def download_archive(date, tmp_dir):
    url = archive_url(date)
    resp = common.SESSION.get(url, stream=True, timeout=60)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    path = os.path.join(tmp_dir, f"prices-{date.isoformat()}.7z")
    with open(path, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1 << 16):
            f.write(chunk)
    return path


def extract_pokemon_prices(archive_path, date, tmp_dir):
    """Returns {groupId: [price rows]} for the Pokemon category on this date."""
    extract_dir = os.path.join(tmp_dir, "extract")
    prefix = f"{date.isoformat()}/{common.POKEMON_CATEGORY_ID}/"
    with py7zr.SevenZipFile(archive_path, mode="r") as z:
        targets = [n for n in z.getnames() if n.startswith(prefix) and n.endswith("/prices")]
        if not targets:
            return {}
        z.extract(path=extract_dir, targets=targets)

    result = {}
    for name in targets:
        full_path = os.path.join(extract_dir, name)
        if not os.path.exists(full_path):
            continue
        group_id = name.split("/")[2]
        data = common.load_json(full_path, {"results": []})
        result[group_id] = data.get("results", [])
    return result


def merge_into_history(group_id, date_str, price_rows):
    path = os.path.join(common.HISTORY_DIR, f"{group_id}.json")
    history = common.load_json(path, {"dates": [], "products": {}})

    if date_str in history["dates"]:
        return  # already have this date

    history["dates"].append(date_str)
    date_index = len(history["dates"]) - 1
    for series in history["products"].values():
        series.append(None)

    prices_by_product = common.group_prices_by_product(price_rows)
    for product_id, price in prices_by_product.items():
        pid = str(product_id)
        series = history["products"].setdefault(pid, [None] * len(history["dates"]))
        while len(series) < len(history["dates"]):
            series.append(None)
        series[date_index] = common.sane_market_price(price)

    common.save_json(path, history)


def sort_history_files():
    """Re-sort every history file's dates chronologically (backfill can add
    dates out of order relative to what's already there)."""
    for fname in os.listdir(common.HISTORY_DIR):
        path = os.path.join(common.HISTORY_DIR, fname)
        history = common.load_json(path, None)
        if not history or not history["dates"]:
            continue
        order = sorted(range(len(history["dates"])), key=lambda i: history["dates"][i])
        history["dates"] = [history["dates"][i] for i in order]
        for pid, series in history["products"].items():
            history["products"][pid] = [series[i] if i < len(series) else None for i in order]
        common.save_json(path, history)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weeks", type=int, default=55)
    parser.add_argument("--tmp-dir", default=os.path.join(common.ROOT, "_backfill_tmp"))
    args = parser.parse_args()

    common.ensure_dirs()
    os.makedirs(args.tmp_dir, exist_ok=True)

    today = datetime.date.today()
    dates = []
    d = today - datetime.timedelta(days=1)  # yesterday; today comes from fetch_current
    for _ in range(args.weeks):
        if d < ARCHIVE_EARLIEST:
            break
        dates.append(d)
        d -= datetime.timedelta(days=7)
    dates.reverse()

    print(f"Backfilling {len(dates)} weekly snapshots from {dates[0]} to {dates[-1]}", file=sys.stderr)

    for i, date in enumerate(dates):
        date_str = date.isoformat()
        archive_path = None
        try:
            archive_path = download_archive(date, args.tmp_dir)
            if archive_path is None:
                print(f"[{i + 1}/{len(dates)}] {date_str}: no archive available, skipping", file=sys.stderr)
                continue
            prices_by_group = extract_pokemon_prices(archive_path, date, args.tmp_dir)
            for group_id, rows in prices_by_group.items():
                merge_into_history(group_id, date_str, rows)
            print(f"[{i + 1}/{len(dates)}] {date_str}: merged {len(prices_by_group)} sets", file=sys.stderr)
        except Exception as exc:
            print(f"[{i + 1}/{len(dates)}] {date_str}: FAILED - {exc}", file=sys.stderr)
        finally:
            extract_dir = os.path.join(args.tmp_dir, "extract")
            if os.path.exists(extract_dir):
                shutil.rmtree(extract_dir)
            if archive_path and os.path.exists(archive_path):
                os.remove(archive_path)

    sort_history_files()
    shutil.rmtree(args.tmp_dir, ignore_errors=True)
    print("Backfill complete.", file=sys.stderr)


if __name__ == "__main__":
    main()
