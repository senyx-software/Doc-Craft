"""Additive schema shared by PostgreSQL migrations and isolated SQLite tests."""
from pathlib import Path


def initialize(cursor):
    source = Path(__file__).resolve().parents[2] / 'migrations' / '202610200001_hybrid_ai.sql'
    for statement in source.read_text().split(';'):
        if statement.strip():
            cursor.execute(statement)
