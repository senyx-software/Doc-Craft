import os
import sqlite3
import json
import threading
from typing import Any, Dict, List, Optional
from app.core.config import settings

try:
    import psycopg2
    from psycopg2 import pool as psycopg2_pool
    from psycopg2.extras import RealDictCursor
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


class AdminDatabase:
    """
    Dedicated Database Manager for DocCraft Admin API control plane.
    Supports both PostgreSQL (Supabase) and SQLite seamlessly.

    PostgreSQL connections are drawn from a small ThreadedConnectionPool
    instead of opening (and TLS-handshaking) a brand-new connection to
    Supabase on every single query — every prior call paid that round trip
    per request. SQLite connections stay per-call: a local file handle is
    already cheap and sqlite3 connections aren't safely shared across threads.
    """

    def __init__(self, db_url: Optional[str] = None):
        self.db_url = db_url or settings.ADMIN_DATABASE_URL
        self.is_postgres = self.db_url.startswith("postgres://") or self.db_url.startswith("postgresql://")
        self._db_path = self._parse_db_path(self.db_url) if not self.is_postgres else None
        self._pg_pool = None
        if self.is_postgres:
            if not HAS_PSYCOPG2:
                raise RuntimeError("psycopg2 is required for PostgreSQL connections")
            self._pg_pool = psycopg2_pool.ThreadedConnectionPool(minconn=1, maxconn=10, dsn=self.db_url)
            self._pool_slots=threading.BoundedSemaphore(10)
        if os.getenv('ADMIN_RUN_MIGRATIONS','true')=='true':
            self.init_db()
            self._copy_legacy_admin_tables()

    def _copy_legacy_admin_tables(self):
        """Copy compatible legacy admin records without renaming/dropping shared tables.

        Payment and Quota may own the old names. A complete column match is
        required before any copy; incompatible tables are deliberately untouched.
        """
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            for table in ("plans", "coupons", "audit_logs"):
                target = f"admin_{table}"
                if self.is_postgres:
                    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = %s ORDER BY ordinal_position", (target,))
                    columns = [row[0] for row in cursor.fetchall()]
                    cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = %s", (table,))
                    legacy = {row[0] for row in cursor.fetchall()}
                else:
                    cursor.execute(f"PRAGMA table_info({target})")
                    columns = [row[1] for row in cursor.fetchall()]
                    cursor.execute(f"PRAGMA table_info({table})")
                    legacy = {row[1] for row in cursor.fetchall()}
                required_columns = set(columns) - {"price_lkr_monthly", "price_lkr_yearly", "paddle_price_yearly_id", "billing_currency"}
                if not columns or not required_columns.issubset(legacy):
                    continue
                columns = [column for column in columns if column in legacy]
                names = ", ".join(f'"{column}"' for column in columns)
                if self.is_postgres:
                    cursor.execute(f"INSERT INTO {target} ({names}) SELECT {names} FROM {table} ON CONFLICT DO NOTHING")
                else:
                    cursor.execute(f"INSERT OR IGNORE INTO {target} ({names}) SELECT {names} FROM {table}")
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            self._release_connection(conn)

    def _parse_db_path(self, db_url: str) -> str:
        if db_url.startswith("sqlite:///"):
            return db_url.replace("sqlite:///", "")
        return "services/admin-api/admin_database.db"

    def get_connection(self):
        if self.is_postgres:
            if not self._pool_slots.acquire(timeout=5):raise TimeoutError('Admin database connection capacity exhausted')
            try:return self._pg_pool.getconn()
            except BaseException:
                self._pool_slots.release()
                raise
        else:
            db_dir = os.path.dirname(os.path.abspath(self._db_path))
            if db_dir:
                os.makedirs(db_dir, exist_ok=True)
            conn = sqlite3.connect(self._db_path)
            conn.row_factory = sqlite3.Row
            return conn

    def _release_connection(self, conn) -> None:
        """Return a pooled Postgres connection; close a one-off SQLite connection."""
        if self.is_postgres:
            try:self._pg_pool.putconn(conn)
            finally:self._pool_slots.release()
        else:
            conn.close()

    def init_db(self):
        """Idempotent schema initialization for dedicated admin tables in PostgreSQL or SQLite."""
        conn = self.get_connection()
        try:
            cursor = conn.cursor()

            if self.is_postgres:
                # 1. admin_users table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_users (
                    id VARCHAR(64) PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password_hash VARCHAR(255) NOT NULL,
                    name VARCHAR(255),
                    role_id VARCHAR(64) NOT NULL,
                    role_name VARCHAR(64) NOT NULL,
                    is_super_admin INT NOT NULL DEFAULT 0,
                    totp_enabled INT NOT NULL DEFAULT 0,
                    totp_secret VARCHAR(255),
                    status VARCHAR(32) NOT NULL DEFAULT 'active',
                    permissions_json TEXT NOT NULL DEFAULT '[]',
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                # 2. admin_roles table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_roles (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) UNIQUE NOT NULL,
                    description TEXT,
                    is_custom INT NOT NULL DEFAULT 1,
                    permissions_json TEXT NOT NULL DEFAULT '[]',
                    assigned_staff_count INT NOT NULL DEFAULT 0,
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 3. audit_logs table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_audit_logs (
                    id VARCHAR(64) PRIMARY KEY,
                    admin_id VARCHAR(64),
                    admin_email VARCHAR(255),
                    module VARCHAR(64) NOT NULL,
                    action VARCHAR(64) NOT NULL,
                    target_id VARCHAR(64),
                    details_json TEXT,
                    ip_address VARCHAR(64),
                    totp_verified INT NOT NULL DEFAULT 0,
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 4. verification_codes table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS verification_codes (
                    email VARCHAR(255) PRIMARY KEY,
                    code VARCHAR(32) NOT NULL,
                    expires_at VARCHAR(64) NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0
                );
                """)

                # 5. plans table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_plans (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    code VARCHAR(64) UNIQUE NOT NULL,
                    description TEXT,
                    price_usd_monthly REAL NOT NULL DEFAULT 0.0,
                    price_usd_yearly REAL NOT NULL DEFAULT 0.0,
                    billing_interval VARCHAR(32) NOT NULL DEFAULT 'both',
                    monthly_quota INT NOT NULL DEFAULT 0,
                    payhere_plan_id VARCHAR(128),
                    paddle_price_id VARCHAR(128),
                    status VARCHAR(32) NOT NULL DEFAULT 'active',
                    feature_flags_json TEXT NOT NULL DEFAULT '{}',
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                # 6. coupons table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_coupons (
                    id VARCHAR(64) PRIMARY KEY,
                    code VARCHAR(64) UNIQUE NOT NULL,
                    discount_percent REAL,
                    discount_amount_usd REAL,
                    duration VARCHAR(32) NOT NULL DEFAULT 'once',
                    duration_in_months INT,
                    max_redemptions INT NOT NULL DEFAULT 100,
                    times_redeemed INT NOT NULL DEFAULT 0,
                    status VARCHAR(32) NOT NULL DEFAULT 'active',
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 7. user_quota_overrides table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_quota_overrides (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(64) UNIQUE NOT NULL,
                    custom_quota INT NOT NULL,
                    reason TEXT,
                    granted_by_admin_id VARCHAR(64) NOT NULL,
                    expires_at VARCHAR(64),
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 8. security_alerts (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS security_alerts (
                    id VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    details TEXT NOT NULL,
                    severity VARCHAR(32) NOT NULL DEFAULT 'medium',
                    status VARCHAR(32) NOT NULL DEFAULT 'Pending',
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 9. active_sessions (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_security_budgets (
                    budget_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at BIGINT NOT NULL
                );
                """)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_login_sessions (
                    id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, user_email TEXT NOT NULL,
                    expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL
                );
                """)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS active_sessions (
                    id VARCHAR(64) PRIMARY KEY,
                    user_email VARCHAR(255) NOT NULL,
                    ip_address VARCHAR(64) NOT NULL,
                    device_agent VARCHAR(255) NOT NULL,
                    last_active VARCHAR(64) NOT NULL,
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 10. ip_access_logs (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS ip_access_logs (
                    id VARCHAR(64) PRIMARY KEY,
                    ip_address VARCHAR(64) NOT NULL,
                    user_email VARCHAR(255) NOT NULL,
                    action VARCHAR(255) NOT NULL,
                    user_agent VARCHAR(255) NOT NULL,
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 11. bot_detection_logs (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS bot_detection_logs (
                    id VARCHAR(64) PRIMARY KEY,
                    ip_address VARCHAR(64) NOT NULL,
                    user_agent TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    risk_score REAL NOT NULL DEFAULT 0.85,
                    status VARCHAR(32) NOT NULL DEFAULT 'Blocked',
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 11b. rate_limit_violations (PostgreSQL) — real 429 blocks reported
                # by the Gateway's rateLimiterMiddleware, not reinterpreted audit_logs.
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS rate_limit_violations (
                    id VARCHAR(64) PRIMARY KEY,
                    ip_address VARCHAR(64) NOT NULL,
                    identifier VARCHAR(255) NOT NULL,
                    group_name VARCHAR(32) NOT NULL,
                    path VARCHAR(255) NOT NULL,
                    limit_val INTEGER NOT NULL,
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # 12. account_abuse_reports (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS account_abuse_reports (
                    id VARCHAR(64) PRIMARY KEY,
                    reporter_email VARCHAR(255) NOT NULL,
                    target_user_email VARCHAR(255) NOT NULL,
                    reason TEXT NOT NULL,
                    severity VARCHAR(32) NOT NULL DEFAULT 'medium',
                    status VARCHAR(32) NOT NULL DEFAULT 'Open',
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # Support tables (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS support_tickets (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(255),
                    user_email VARCHAR(255) NOT NULL,
                    subject VARCHAR(512) NOT NULL,
                    message TEXT NOT NULL,
                    category VARCHAR(64) NOT NULL DEFAULT 'general',
                    priority VARCHAR(32) NOT NULL DEFAULT 'medium',
                    status VARCHAR(32) NOT NULL DEFAULT 'open',
                    assigned_to VARCHAR(255),
                    resolution_notes TEXT,
                    session_id VARCHAR(255),
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS refund_requests (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(255),
                    user_email VARCHAR(255) NOT NULL,
                    subscription_id VARCHAR(255),
                    invoice_id VARCHAR(255),
                    amount REAL,
                    currency VARCHAR(16) NOT NULL DEFAULT 'USD',
                    gateway VARCHAR(64),
                    reason TEXT NOT NULL,
                    status VARCHAR(32) NOT NULL DEFAULT 'pending',
                    admin_notes TEXT,
                    resolved_by VARCHAR(255),
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS contact_submissions (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    subject VARCHAR(512) NOT NULL,
                    message TEXT NOT NULL,
                    user_id VARCHAR(255),
                    status VARCHAR(32) NOT NULL DEFAULT 'unread',
                    admin_reply TEXT,
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS plan_override_requests (
                    id VARCHAR(64) PRIMARY KEY,
                    user_id VARCHAR(255),
                    user_email VARCHAR(255) NOT NULL,
                    requested_plan VARCHAR(64) NOT NULL,
                    current_plan VARCHAR(64),
                    reason TEXT NOT NULL,
                    requested_quota INTEGER,
                    status VARCHAR(32) NOT NULL DEFAULT 'pending',
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # NOTE: generation analytics no longer use a separate
                # generation_events table here. admin-api and the Document
                # Service share the exact same Postgres database (same
                # Supabase project) — the Document Service's own `documents`
                # table (app/models/document.py) is now the single source of
                # truth, queried read-only from here. See quota_client.py.

                # cost_ledger table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS cost_ledger (
                    id VARCHAR(64) PRIMARY KEY,
                    category VARCHAR(64) NOT NULL,
                    description TEXT NOT NULL,
                    amount_usd REAL NOT NULL DEFAULT 0.0,
                    currency VARCHAR(8) NOT NULL DEFAULT 'USD',
                    vendor VARCHAR(128),
                    invoice_ref VARCHAR(255),
                    period_month VARCHAR(7) NOT NULL,
                    created_at VARCHAR(64) NOT NULL,
                    created_by VARCHAR(64)
                );
                """)

                # notification_templates table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_templates (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    type VARCHAR(64),
                    subject TEXT NOT NULL,
                    channel VARCHAR(32) NOT NULL DEFAULT 'email',
                    body_html TEXT NOT NULL DEFAULT '',
                    is_active INT NOT NULL DEFAULT 1,
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                # system_announcements table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_announcements (
                    id VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    severity VARCHAR(32) NOT NULL DEFAULT 'info',
                    target_audience VARCHAR(64) NOT NULL DEFAULT 'all_users',
                    is_active INT NOT NULL DEFAULT 1,
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                # notification_server_settings table (PostgreSQL) - single-row KV store
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_server_settings (
                    key VARCHAR(128) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                # Automation rules table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS automation_rules (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    description TEXT,
                    trigger_event VARCHAR(128) NOT NULL,
                    conditions_json TEXT NOT NULL DEFAULT '[]',
                    actions_json TEXT NOT NULL DEFAULT '[]',
                    status VARCHAR(32) NOT NULL DEFAULT 'active',
                    retry_limit INT NOT NULL DEFAULT 3,
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                # Automation execution logs table (PostgreSQL)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS automation_execution_logs (
                    id VARCHAR(64) PRIMARY KEY,
                    rule_id VARCHAR(64) NOT NULL,
                    rule_name VARCHAR(255) NOT NULL,
                    trigger_event VARCHAR(128) NOT NULL,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    conditions_evaluated INT NOT NULL DEFAULT 0,
                    conditions_passed INT NOT NULL DEFAULT 0,
                    action_results_json TEXT NOT NULL DEFAULT '[]',
                    status VARCHAR(32) NOT NULL DEFAULT 'success',
                    retry_count INT NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at VARCHAR(64) NOT NULL
                );
                """)

                conn.commit()

                # Existing DBs predate the `type` column — the Notification Service
                # matches templates to an event type (welcome, quota_alert, etc.) by
                # this column, not by guessing at the row's id string.
                cursor.execute("ALTER TABLE notification_templates ADD COLUMN IF NOT EXISTS type VARCHAR(64);")

                # Idempotent table creation for notification tables (existing DBs)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_templates (
                    id VARCHAR(64) PRIMARY KEY,
                    name VARCHAR(255) NOT NULL,
                    type VARCHAR(64),
                    subject TEXT NOT NULL,
                    channel VARCHAR(32) NOT NULL DEFAULT 'email',
                    body_html TEXT NOT NULL DEFAULT '',
                    is_active INT NOT NULL DEFAULT 1,
                    created_at VARCHAR(64) NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_announcements (
                    id VARCHAR(64) PRIMARY KEY,
                    title VARCHAR(255) NOT NULL,
                    message TEXT NOT NULL,
                    severity VARCHAR(32) NOT NULL DEFAULT 'info',
                    target_audience VARCHAR(64) NOT NULL DEFAULT 'all_users',
                    is_active INT NOT NULL DEFAULT 1,
                    created_at VARCHAR(64) NOT NULL
                );
                """)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_server_settings (
                    key VARCHAR(128) PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                # config_entries table (PostgreSQL) — current active payload per domain
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_entries (
                    domain VARCHAR(64) PRIMARY KEY,
                    data_json TEXT NOT NULL,
                    version INT NOT NULL DEFAULT 1,
                    updated_by_admin_id VARCHAR(64),
                    updated_at VARCHAR(64) NOT NULL
                );
                """)

                # config_history table (PostgreSQL) — append-only version audit log
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_history (
                    id VARCHAR(64) PRIMARY KEY,
                    domain VARCHAR(64) NOT NULL,
                    version INT NOT NULL,
                    data_json TEXT NOT NULL,
                    changed_by_admin_id VARCHAR(64),
                    created_at VARCHAR(64) NOT NULL
                );
                """)
                conn.commit()
            else:
                # SQLite
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_users (
                    id TEXT PRIMARY KEY,
                    email TEXT UNIQUE NOT NULL,
                    password_hash TEXT NOT NULL,
                    name TEXT,
                    role_id TEXT NOT NULL,
                    role_name TEXT NOT NULL,
                    is_super_admin INTEGER NOT NULL DEFAULT 0,
                    totp_enabled INTEGER NOT NULL DEFAULT 0,
                    totp_secret TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    permissions_json TEXT NOT NULL DEFAULT '[]',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_roles (
                    id TEXT PRIMARY KEY,
                    name TEXT UNIQUE NOT NULL,
                    description TEXT,
                    is_custom INTEGER NOT NULL DEFAULT 1,
                    permissions_json TEXT NOT NULL DEFAULT '[]',
                    assigned_staff_count INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_audit_logs (
                    id TEXT PRIMARY KEY,
                    admin_id TEXT,
                    admin_email TEXT,
                    module TEXT NOT NULL,
                    action TEXT NOT NULL,
                    target_id TEXT,
                    details_json TEXT,
                    ip_address TEXT,
                    totp_verified INTEGER NOT NULL DEFAULT 0,
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS verification_codes (
                    email TEXT PRIMARY KEY,
                    code TEXT NOT NULL,
                    expires_at TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_plans (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    code TEXT UNIQUE NOT NULL,
                    description TEXT,
                    price_usd_monthly REAL NOT NULL DEFAULT 0.0,
                    price_usd_yearly REAL NOT NULL DEFAULT 0.0,
                    billing_interval TEXT NOT NULL DEFAULT 'both',
                    monthly_quota INTEGER NOT NULL DEFAULT 0,
                    payhere_plan_id TEXT,
                    paddle_price_id TEXT,
                    status TEXT NOT NULL DEFAULT 'active',
                    feature_flags_json TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_coupons (
                    id TEXT PRIMARY KEY,
                    code TEXT UNIQUE NOT NULL,
                    discount_percent REAL,
                    discount_amount_usd REAL,
                    duration TEXT NOT NULL DEFAULT 'once',
                    duration_in_months INTEGER,
                    max_redemptions INTEGER NOT NULL DEFAULT 100,
                    times_redeemed INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS user_quota_overrides (
                    id TEXT PRIMARY KEY,
                    user_id TEXT UNIQUE NOT NULL,
                    custom_quota INTEGER NOT NULL,
                    reason TEXT,
                    granted_by_admin_id TEXT NOT NULL,
                    expires_at TEXT,
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS security_alerts (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    details TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'medium',
                    status TEXT NOT NULL DEFAULT 'Pending',
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_security_budgets (
                    budget_key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at BIGINT NOT NULL
                );
                """)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS admin_login_sessions (
                    id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, user_email TEXT NOT NULL,
                    expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL
                );
                """)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS active_sessions (
                    id TEXT PRIMARY KEY,
                    user_email TEXT NOT NULL,
                    ip_address TEXT NOT NULL,
                    device_agent TEXT NOT NULL,
                    last_active TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS ip_access_logs (
                    id TEXT PRIMARY KEY,
                    ip_address TEXT NOT NULL,
                    user_email TEXT NOT NULL,
                    action TEXT NOT NULL,
                    user_agent TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS bot_detection_logs (
                    id TEXT PRIMARY KEY,
                    ip_address TEXT NOT NULL,
                    user_agent TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    risk_score REAL NOT NULL DEFAULT 0.85,
                    status TEXT NOT NULL DEFAULT 'Blocked',
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS rate_limit_violations (
                    id TEXT PRIMARY KEY,
                    ip_address TEXT NOT NULL,
                    identifier TEXT NOT NULL,
                    group_name TEXT NOT NULL,
                    path TEXT NOT NULL,
                    limit_val INTEGER NOT NULL,
                    created_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS account_abuse_reports (
                    id TEXT PRIMARY KEY,
                    reporter_email TEXT NOT NULL,
                    target_user_email TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'medium',
                    status TEXT NOT NULL DEFAULT 'Open',
                    created_at TEXT NOT NULL
                );
                """)

                # Support tables (SQLite)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS support_tickets (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    user_email TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    message TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT 'general',
                    priority TEXT NOT NULL DEFAULT 'medium',
                    status TEXT NOT NULL DEFAULT 'open',
                    assigned_to TEXT,
                    resolution_notes TEXT,
                    session_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS refund_requests (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    user_email TEXT NOT NULL,
                    subscription_id TEXT,
                    invoice_id TEXT,
                    amount REAL,
                    currency TEXT NOT NULL DEFAULT 'USD',
                    gateway TEXT,
                    reason TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    admin_notes TEXT,
                    resolved_by TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS contact_submissions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    email TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    message TEXT NOT NULL,
                    user_id TEXT,
                    status TEXT NOT NULL DEFAULT 'unread',
                    admin_reply TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS plan_override_requests (
                    id TEXT PRIMARY KEY,
                    user_id TEXT,
                    user_email TEXT NOT NULL,
                    requested_plan TEXT NOT NULL,
                    current_plan TEXT,
                    reason TEXT NOT NULL,
                    requested_quota INTEGER,
                    status TEXT NOT NULL DEFAULT 'pending',
                    admin_notes TEXT,
                    resolved_by TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                # SQLite-only mirror of the Document Service's real `documents`
                # table (same Postgres database as admin-api in production —
                # see the PostgreSQL branch above). Needed here purely so
                # admin-api's own SQLite test/dev mode has something to query;
                # in production this table already exists and is owned by the
                # Document Service — admin-api never creates or writes to it.
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS documents (
                    id TEXT PRIMARY KEY,
                    userId TEXT,
                    userEmail TEXT,
                    plan TEXT NOT NULL DEFAULT 'free',
                    documentType TEXT NOT NULL DEFAULT 'invoice',
                    templateId TEXT,
                    title TEXT,
                    slots TEXT,
                    status TEXT NOT NULL DEFAULT 'pending',
                    errorMessage TEXT,
                    pdfKey TEXT,
                    shareToken TEXT,
                    shareExpiresAt TEXT,
                    createdAt TEXT NOT NULL,
                    updatedAt TEXT
                );
                """)

                cursor.execute("""
                CREATE TABLE IF NOT EXISTS cost_ledger (
                    id TEXT PRIMARY KEY,
                    category TEXT NOT NULL,
                    description TEXT NOT NULL,
                    amount_usd REAL NOT NULL DEFAULT 0.0,
                    currency TEXT NOT NULL DEFAULT 'USD',
                    vendor TEXT,
                    invoice_ref TEXT,
                    period_month TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    created_by TEXT
                );
                """)

                # notification_templates table (SQLite)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    type TEXT,
                    subject TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'email',
                    body_html TEXT NOT NULL DEFAULT '',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)
                # Existing local SQLite DBs predate the `type` column — SQLite has
                # no `ADD COLUMN IF NOT EXISTS`, so ignore the "duplicate column" error.
                try:
                    cursor.execute("ALTER TABLE notification_templates ADD COLUMN type TEXT;")
                except sqlite3.OperationalError:
                    pass

                # system_announcements table (SQLite)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS system_announcements (
                    id TEXT PRIMARY KEY,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL,
                    severity TEXT NOT NULL DEFAULT 'info',
                    target_audience TEXT NOT NULL DEFAULT 'all_users',
                    is_active INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL
                );
                """)

                # notification_server_settings table (SQLite) - single-row KV store
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS notification_server_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                # automation_rules table (SQLite)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS automation_rules (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT,
                    trigger_event TEXT NOT NULL,
                    conditions_json TEXT NOT NULL DEFAULT '[]',
                    actions_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'active',
                    retry_limit INTEGER NOT NULL DEFAULT 3,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                """)

                # automation_execution_logs table (SQLite)
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS automation_execution_logs (
                    id TEXT PRIMARY KEY,
                    rule_id TEXT NOT NULL,
                    rule_name TEXT NOT NULL,
                    trigger_event TEXT NOT NULL,
                    payload_json TEXT NOT NULL DEFAULT '{}',
                    conditions_evaluated INTEGER NOT NULL DEFAULT 0,
                    conditions_passed INTEGER NOT NULL DEFAULT 0,
                    action_results_json TEXT NOT NULL DEFAULT '[]',
                    status TEXT NOT NULL DEFAULT 'success',
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    error_message TEXT,
                    created_at TEXT NOT NULL
                );
                """)

                # config_entries table (SQLite) — current active payload per domain
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_entries (
                    domain TEXT PRIMARY KEY,
                    data_json TEXT NOT NULL,
                    version INTEGER NOT NULL DEFAULT 1,
                    updated_by_admin_id TEXT,
                    updated_at TEXT NOT NULL
                );
                """)

                # config_history table (SQLite) — append-only version audit log
                cursor.execute("""
                CREATE TABLE IF NOT EXISTS config_history (
                    id TEXT PRIMARY KEY,
                    domain TEXT NOT NULL,
                    version INTEGER NOT NULL,
                    data_json TEXT NOT NULL,
                    changed_by_admin_id TEXT,
                    created_at TEXT NOT NULL
                );
                """)
            cursor.execute("CREATE TABLE IF NOT EXISTS admin_totp_steps (account_key TEXT PRIMARY KEY,last_step BIGINT NOT NULL)")
            for name, sql_type in (("price_lkr_monthly", "REAL"), ("price_lkr_yearly", "REAL"), ("paddle_price_yearly_id", "VARCHAR(128)"), ("billing_currency", "VARCHAR(3) DEFAULT 'USD'")):
                if self.is_postgres:
                    cursor.execute(f"ALTER TABLE admin_plans ADD COLUMN IF NOT EXISTS {name} {sql_type}")
                else:
                    cursor.execute("PRAGMA table_info(admin_plans)")
                    if name not in {row[1] for row in cursor.fetchall()}:
                        cursor.execute(f"ALTER TABLE admin_plans ADD COLUMN {name} {sql_type}")
            if self.is_postgres:
                cursor.execute("ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0")
            else:
                cursor.execute("PRAGMA table_info(verification_codes)")
                if "attempts" not in {row[1] for row in cursor.fetchall()}:
                    cursor.execute("ALTER TABLE verification_codes ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0")
            conn.commit()
        finally:
            self._release_connection(conn)

    def _convert_query(self, query: str) -> str:
        """Convert standard SQL placeholders (?) to PostgreSQL (%s) or INSERT OR REPLACE to UPSERT if Postgres."""
        import re
        # These are control-plane records, not Payment's plans/coupons or
        # Quota's audit records. Preserve domain names in API/config payloads.
        query = re.sub(
            r'\b(FROM|INTO|UPDATE|JOIN|TABLE IF NOT EXISTS)\s+(plans|coupons|audit_logs)\b',
            lambda match: f"{match[1]} admin_{match[2]}", query, flags=re.IGNORECASE,
        )
        if not self.is_postgres:
            return query

        # Convert ? to %s for PostgreSQL
        pg_query = query.replace("?", "%s")

        # Convert SQLite 'INSERT OR REPLACE INTO' to Postgres UPSERT
        if "INSERT OR REPLACE INTO" in pg_query:
            pg_query = pg_query.replace("INSERT OR REPLACE INTO", "INSERT INTO")

            if "admin_users" in pg_query:
                pg_query += """
                ON CONFLICT (id) DO UPDATE SET
                    email = EXCLUDED.email,
                    password_hash = EXCLUDED.password_hash,
                    name = EXCLUDED.name,
                    role_id = EXCLUDED.role_id,
                    role_name = EXCLUDED.role_name,
                    is_super_admin = EXCLUDED.is_super_admin,
                    totp_enabled = EXCLUDED.totp_enabled,
                    totp_secret = EXCLUDED.totp_secret,
                    status = EXCLUDED.status,
                    updated_at = EXCLUDED.updated_at
                """
            elif "admin_roles" in pg_query:
                pg_query += """
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    description = EXCLUDED.description,
                    is_custom = EXCLUDED.is_custom,
                    permissions_json = EXCLUDED.permissions_json
                """
            elif "verification_codes" in pg_query:
                pg_query += """
                ON CONFLICT (email) DO UPDATE SET
                    code = EXCLUDED.code,
                    expires_at = EXCLUDED.expires_at,
                    attempts = 0
                """
            elif "plans" in pg_query:
                pg_query += """
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    code = EXCLUDED.code,
                    description = EXCLUDED.description,
                    price_usd_monthly = EXCLUDED.price_usd_monthly,
                    price_usd_yearly = EXCLUDED.price_usd_yearly,
                    price_lkr_monthly = EXCLUDED.price_lkr_monthly,
                    price_lkr_yearly = EXCLUDED.price_lkr_yearly,
                    paddle_price_yearly_id = EXCLUDED.paddle_price_yearly_id,
                    billing_currency = EXCLUDED.billing_currency,
                    billing_interval = EXCLUDED.billing_interval,
                    monthly_quota = EXCLUDED.monthly_quota,
                    payhere_plan_id = EXCLUDED.payhere_plan_id,
                    paddle_price_id = EXCLUDED.paddle_price_id,
                    status = EXCLUDED.status,
                    feature_flags_json = EXCLUDED.feature_flags_json,
                    updated_at = EXCLUDED.updated_at
                """
            elif "coupons" in pg_query:
                pg_query += """
                ON CONFLICT (id) DO UPDATE SET
                    code = EXCLUDED.code,
                    discount_percent = EXCLUDED.discount_percent,
                    discount_amount_usd = EXCLUDED.discount_amount_usd,
                    duration = EXCLUDED.duration,
                    duration_in_months = EXCLUDED.duration_in_months,
                    max_redemptions = EXCLUDED.max_redemptions,
                    times_redeemed = EXCLUDED.times_redeemed,
                    status = EXCLUDED.status
                """
            elif "user_quota_overrides" in pg_query:
                pg_query += """
                ON CONFLICT (user_id) DO UPDATE SET
                    custom_quota = EXCLUDED.custom_quota,
                    reason = EXCLUDED.reason,
                    granted_by_admin_id = EXCLUDED.granted_by_admin_id,
                    expires_at = EXCLUDED.expires_at,
                    created_at = EXCLUDED.created_at
                """
            elif "config_entries" in pg_query:
                pg_query += """
                ON CONFLICT (domain) DO UPDATE SET
                    data_json = EXCLUDED.data_json,
                    version = EXCLUDED.version,
                    updated_by_admin_id = EXCLUDED.updated_by_admin_id,
                    updated_at = EXCLUDED.updated_at
                """
            elif "config_history" in pg_query:
                pg_query += """
                ON CONFLICT (id) DO UPDATE SET
                    domain = EXCLUDED.domain,
                    version = EXCLUDED.version,
                    data_json = EXCLUDED.data_json,
                    changed_by_admin_id = EXCLUDED.changed_by_admin_id,
                    created_at = EXCLUDED.created_at
                """
        return pg_query

    def execute(self, query: str, params: tuple = ()) -> int:
        conn = self.get_connection()
        try:
            cursor = conn.cursor()
            sql = self._convert_query(query)
            cursor.execute(sql, params)
            conn.commit()
            return cursor.rowcount
        except Exception:
            # Without this, a failed query (e.g. a UniqueViolation from a
            # duplicate invite email) leaves this pooled Postgres connection
            # stuck "in failed sql transaction" — every query on it, for
            # ANY unrelated request that happens to reuse it, then fails
            # too, until the container restarts and the pool is recreated.
            # Confirmed live: exactly this poisoned a connection in the
            # 10-connection pool and broke a completely unrelated request
            # right after a duplicate-email invite attempt.
            if self.is_postgres:
                conn.rollback()
            raise
        finally:
            self._release_connection(conn)

    def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        conn = self.get_connection()
        try:
            if self.is_postgres:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
            else:
                cursor = conn.cursor()
            sql = self._convert_query(query)
            cursor.execute(sql, params)
            row = cursor.fetchone()
            if not row:
                return None
            return dict(row)
        except Exception:
            if self.is_postgres:
                conn.rollback()
            raise
        finally:
            self._release_connection(conn)

    def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        conn = self.get_connection()
        try:
            if self.is_postgres:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
            else:
                cursor = conn.cursor()
            sql = self._convert_query(query)
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            return [dict(r) for r in rows]
        except Exception:
            if self.is_postgres:
                conn.rollback()
            raise
        finally:
            self._release_connection(conn)


admin_db = AdminDatabase()
