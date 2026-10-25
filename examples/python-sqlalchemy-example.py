"""
python-sqlalchemy-example.py — QueryPilot watch integration for Python

Works with SQLAlchemy (Django ORM, asyncpg, etc.) by hooking into
SQLAlchemy's event system and POSTing to the qp watch server.

Usage:
  Terminal 1:  qp watch
  Terminal 2:  python examples/python-sqlalchemy-example.py

Requirements:
  pip install sqlalchemy requests psycopg2-binary
"""

import time
import threading
import requests
from sqlalchemy import event, create_engine, text

# ─── Configuration ────────────────────────────────────────────────────────────

QP_WATCH_URL = "http://127.0.0.1:7432/query"

# ─── QueryPilot SQLAlchemy listener ──────────────────────────────────────────

def attach_querypilot(engine, min_duration_ms: float = 0):
    """
    Attach QueryPilot to a SQLAlchemy engine.

    Hooks into SQLAlchemy's 'after_cursor_execute' event which fires
    after every query completes — same principle as Prisma's $on('query').

    Args:
        engine:           SQLAlchemy Engine instance
        min_duration_ms:  Only forward queries slower than this (default: 0 = all)

    Example:
        engine = create_engine("postgresql://user:pass@localhost/mydb")
        attach_querypilot(engine)
    """
    # Track start times per connection (threadsafe via threading.local)
    _local = threading.local()

    @event.listens_for(engine, "before_cursor_execute")
    def before_execute(conn, cursor, statement, parameters, context, executemany):
        _local.start = time.monotonic()

    @event.listens_for(engine, "after_cursor_execute")
    def after_execute(conn, cursor, statement, parameters, context, executemany):
        duration_ms = (time.monotonic() - getattr(_local, "start", time.monotonic())) * 1000

        if duration_ms < min_duration_ms:
            return

        payload = {
            "sql": statement,
            "durationMs": round(duration_ms, 2),
            "source": "sqlalchemy",
        }

        # Fire-and-forget in a background thread — never block the app
        def _send():
            try:
                requests.post(QP_WATCH_URL, json=payload, timeout=2)
            except Exception:
                pass  # Server not running — silently ignore

        threading.Thread(target=_send, daemon=True).start()


# ─── Demo: simulate an app making various queries ────────────────────────────

def run_demo():
    import os

    db_url = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/querypilot_test")
    engine = create_engine(db_url, echo=False)

    print("\n  QueryPilot Python Demo\n")

    # Check if watch server is running
    try:
        r = requests.get("http://127.0.0.1:7432/health", timeout=1.5)
        if not r.ok:
            raise ConnectionError()
        print("  ✔ Watch server is live\n")
    except Exception:
        print("  ✖ qp watch server not running. Start it with: qp watch\n")
        return

    attach_querypilot(engine)

    queries = [
        # Good — indexed lookup
        ("User PK lookup", "SELECT id, email, name FROM users WHERE id = 1"),

        # Potentially slow — full table scan
        ("All users (no filter)", "SELECT id, email, name, created_at FROM users ORDER BY created_at DESC"),

        # Join query
        ("Posts with authors", """
            SELECT p.id, p.title, u.name AS author_name
            FROM posts p
            JOIN users u ON p.author_id = u.id
            WHERE p.published = true
            ORDER BY p.created_at DESC
            LIMIT 20
        """),

        # Aggregation
        ("Daily post counts", """
            SELECT DATE_TRUNC('day', created_at) AS day, COUNT(*) AS count
            FROM posts
            WHERE created_at > NOW() - INTERVAL '30 days'
            GROUP BY 1
            ORDER BY 1 DESC
        """),
    ]

    with engine.connect() as conn:
        for label, sql in queries:
            print(f"  → {label}")
            try:
                conn.execute(text(sql))
            except Exception as e:
                print(f"    (query failed — table may not exist: {e})")
            time.sleep(0.7)

    print("\n  ✔ Done — check your qp watch terminal\n")


if __name__ == "__main__":
    run_demo()
