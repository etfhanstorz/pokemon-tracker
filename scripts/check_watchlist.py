"""Checks docs/data/watchlist.json (built via the site's Alerts page) against
the latest prices in docs/data/all_items.json, and emails a summary through
Gmail SMTP for anything that's hit its target price (or dropped sharply vs.
its own recent average, if no target was set).

Requires env vars GMAIL_ADDRESS and GMAIL_APP_PASSWORD (a Gmail App Password,
not the account password - see https://myaccount.google.com/apppasswords).
NOTIFY_EMAIL is optional and defaults to GMAIL_ADDRESS.

Designed to run repeatedly (e.g. every 6h via GitHub Actions) without
spamming: an item is only re-notified if its price has dropped further
since the last alert.

Usage: python check_watchlist.py
"""
import datetime
import os
import smtplib
import sys
from email.mime.text import MIMEText

import common

WATCHLIST_FILE = os.path.join(common.DATA_DIR, "watchlist.json")
STATE_FILE = os.path.join(common.DATA_DIR, "watchlist_state.json")
DEFAULT_DEAL_THRESHOLD_PCT = -15
SANITY_THRESHOLD_PCT = -50


def is_cheap(item, watch_entry):
    target = watch_entry.get("targetPrice")
    if target is not None:
        return item["market"] is not None and item["market"] <= target
    return (
        item.get("dealPct") is not None
        and item["dealPct"] <= DEFAULT_DEAL_THRESHOLD_PCT
        and item.get("historyPoints", 0) >= 3
    )


def send_email(gmail_address, app_password, to_address, subject, body):
    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = gmail_address
    msg["To"] = to_address
    with smtplib.SMTP("smtp.gmail.com", 587) as server:
        server.starttls()
        server.login(gmail_address, app_password)
        server.sendmail(gmail_address, [to_address], msg.as_string())


def format_alert(item, watch_entry):
    lines = [
        f"{item['name']} ({item.get('set') or watch_entry.get('set', '')})",
        f"  Price: ${item['market']:.2f}",
    ]
    if watch_entry.get("targetPrice") is not None:
        lines.append(f"  Your target: ${watch_entry['targetPrice']:.2f}")
    if item.get("avg90d"):
        lines.append(f"  90-day avg: ${item['avg90d']:.2f} ({item.get('dealPct', 0):+.1f}%)")
    if item.get("dealPct") is not None and item["dealPct"] <= SANITY_THRESHOLD_PCT:
        lines.append(
            "  ⚠️ This is unusually far below its recent average - "
            "double-check the listing (condition, seller, shipping) before buying, "
            "this can be a pricing error or a bad listing rather than a real deal."
        )
    if item.get("url"):
        lines.append(f"  {item['url']}")
    return "\n".join(lines)


def main():
    watchlist = common.load_json(WATCHLIST_FILE, {"items": []})
    if not watchlist.get("items"):
        print("Watchlist is empty, nothing to check.", file=sys.stderr)
        return

    all_items = common.load_json(os.path.join(common.DATA_DIR, "all_items.json"), {"items": []})
    items_by_id = {i["id"]: i for i in all_items.get("items", [])}

    state = common.load_json(STATE_FILE, {})
    now = datetime.datetime.now(datetime.timezone.utc).isoformat()

    alerts = []
    for watch_entry in watchlist["items"]:
        item = items_by_id.get(watch_entry["id"])
        if not item or item.get("market") is None:
            continue
        if not is_cheap(item, watch_entry):
            continue

        key = str(watch_entry["id"])
        prev = state.get(key)
        if prev and item["market"] >= prev["lastNotifiedPrice"] - 0.01:
            continue  # already notified at this price or lower didn't drop further

        alerts.append((item, watch_entry))
        state[key] = {"lastNotifiedPrice": item["market"], "lastNotifiedAt": now}

    if not alerts:
        print("No new price drops to alert on.", file=sys.stderr)
        common.save_json(STATE_FILE, state)
        return

    gmail_address = os.environ.get("GMAIL_ADDRESS")
    app_password = os.environ.get("GMAIL_APP_PASSWORD")
    to_address = os.environ.get("NOTIFY_EMAIL", gmail_address)

    body = "\n\n".join(format_alert(item, watch_entry) for item, watch_entry in alerts)
    subject = f"\U0001f514 {len(alerts)} Pokemon card(s) hit your price target"

    if not gmail_address or not app_password:
        print(
            "GMAIL_ADDRESS / GMAIL_APP_PASSWORD not set - skipping email send. "
            f"Would have sent:\n{subject}\n\n{body}",
            file=sys.stderr,
        )
        common.save_json(STATE_FILE, state)
        return

    send_email(gmail_address, app_password, to_address, subject, body)
    print(f"Sent alert email for {len(alerts)} item(s).", file=sys.stderr)
    common.save_json(STATE_FILE, state)


if __name__ == "__main__":
    main()
