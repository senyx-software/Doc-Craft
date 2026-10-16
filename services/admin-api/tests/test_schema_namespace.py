import sqlite3
from app.db.admin_db import AdminDatabase


def test_legacy_admin_records_are_copied_without_changing_original_tables(tmp_path):
    path = str(tmp_path / "legacy.db")
    with sqlite3.connect(path) as connection:
        connection.execute("""CREATE TABLE plans (
          id TEXT PRIMARY KEY, name TEXT, code TEXT, description TEXT,
          price_usd_monthly REAL, price_usd_yearly REAL, billing_interval TEXT,
          monthly_quota INTEGER, payhere_plan_id TEXT, paddle_price_id TEXT,
          status TEXT, feature_flags_json TEXT, created_at TEXT, updated_at TEXT)""")
        connection.execute("INSERT INTO plans VALUES ('legacy', 'Legacy', 'legacy', '', 29, 290, 'both', 7, NULL, NULL, 'active', '{}', '2026-01-01', '2026-01-01')")
    database = AdminDatabase("sqlite:///" + path)
    assert database.fetch_one("SELECT * FROM plans WHERE id = ?", ("legacy",))["monthly_quota"] == 7
    database.execute("UPDATE plans SET monthly_quota = ? WHERE id = ?", (12, "legacy"))
    AdminDatabase("sqlite:///" + path)
    assert database.fetch_one("SELECT * FROM plans WHERE id = ?", ("legacy",))["monthly_quota"] == 12
    with sqlite3.connect(path) as connection:
        assert connection.execute("SELECT monthly_quota FROM plans WHERE id='legacy'").fetchone()[0] == 7
        assert connection.execute("SELECT billing_currency FROM admin_plans WHERE id='legacy'").fetchone()[0] == "USD"


def test_payment_owned_plan_shape_is_never_copied_or_altered(tmp_path):
    path = str(tmp_path / "payment.db")
    with sqlite3.connect(path) as connection:
        connection.execute('CREATE TABLE plans (id TEXT PRIMARY KEY, name TEXT, "priceMonthly" REAL)')
        connection.execute("INSERT INTO plans VALUES ('payment', 'pro', 990)")
    database = AdminDatabase("sqlite:///" + path)
    assert database.fetch_all("SELECT * FROM plans") == []
    with sqlite3.connect(path) as connection:
        assert [row[1] for row in connection.execute("PRAGMA table_info(plans)")] == ["id", "name", "priceMonthly"]
        assert connection.execute("SELECT COUNT(*) FROM plans").fetchone()[0] == 1
