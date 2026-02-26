# utils.py – Shared utility functions (highest import count in repo)
import datetime


def log_event(event_name, metadata=None):
    """Append-only structured event log. Used by: payment, subscriptions, checkout."""
    ts = datetime.datetime.utcnow().isoformat()
    entry = {"ts": ts, "event": event_name, "meta": metadata or {}}
    print(f"[YUKTHAM_LOG] {entry}")
    return entry


def sanitize(value):
    """Strip and normalize any string input."""
    return str(value).strip().lower()


def format_currency(amount, currency="INR"):
    symbols = {"INR": "₹", "USD": "$", "EUR": "€"}
    sym = symbols.get(currency, currency)
    return f"{sym}{amount:,.2f}"
