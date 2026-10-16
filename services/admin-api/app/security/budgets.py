"""Shared, atomic abuse budgets; no process-memory fallback for security controls."""
import hashlib
import time

from fastapi import HTTPException
from app.db.admin_db import admin_db


def claim_budget(scope: str, identity: str, limit: int, seconds: int) -> str:
    now = int(time.time())
    end = (now // seconds + 1) * seconds
    key = hashlib.sha256(f"{scope}:{identity}:{end}".encode()).hexdigest()
    try:
        # Conditional UPSERT is atomic in PostgreSQL and SQLite, across workers.
        accepted = admin_db.execute("""
            INSERT INTO admin_security_budgets (budget_key, attempts, expires_at) VALUES (?, 1, ?)
            ON CONFLICT (budget_key) DO UPDATE SET attempts = admin_security_budgets.attempts + 1
            WHERE admin_security_budgets.attempts < ?
        """, (key, end, limit))
        admin_db.execute("DELETE FROM admin_security_budgets WHERE expires_at < ?", (now,))
    except Exception as error:
        raise HTTPException(503, "Security verification unavailable") from error
    if accepted != 1:
        raise HTTPException(429, "Too many attempts. Try again later.", headers={"Retry-After": str(end - now)})
    return key


def clear_budget(key: str):
    admin_db.execute("DELETE FROM admin_security_budgets WHERE budget_key = ?", (key,))
