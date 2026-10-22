import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.admin_db import admin_db
from app.models.config import ConfigEntry, ConfigVersionHistory

SEED_DOMAIN_CONFIGS: Dict[str, Dict[str, Any]] = {
    "template_catalog": {},
    "feature_flags": {
        "customLogo": {"type":"boolean","default":False,"plan_matrix":{"guest":False,"free":False,"pro":True,"max":True}},
        "allTemplates": {"type":"boolean","default":False,"plan_matrix":{"guest":False,"free":False,"pro":True,"max":True}},
        "watermark_removal": {"type": "boolean", "default": False, "plan_matrix": {"free": False, "pro": True, "max": True}},
        "custom_font_upload": {"type": "boolean", "default": False, "plan_matrix": {"free": False, "pro": True, "max": True}},
        "priority_pdf_rendering": {"type": "boolean", "default": False, "plan_matrix": {"free": False, "pro": False, "max": True}},
        "max_template_slots": {"type": "integer", "default": 10, "plan_matrix": {"free": 10, "pro": 50, "max": 500}},
    },
    "templates": {
        "default_invoice_template_id": "tmpl_invoice_2023_01",
        "default_quotation_template_id": "tmpl_quotation_modern",
        "allowed_file_types": ["pdf", "png", "svg"],
    },
    "branding": {
        "company_name": "DocCraft",
        "logo_url": "https://cdn.doccraft.app/assets/logo.svg",
        "accent_color": "#1e88e5",
        "font_family": "Inter, sans-serif",
        "support_email": "support@doccraft.app",
    },
    # NOTE: merchant IDs, webhook secrets, and API keys stay in each service's own
    # env vars — never in this shared, admin-editable, Redis-broadcast config.
    # This domain is a flat bag shared by two independent consumers:
    #   - Payment (paymentConfigClient.getPaymentSettings) reads default_payment_provider/allow_*
    #   - Gateway (rateLimiterMiddleware) reads rate_limits and maintenance_mode
    "settings": {
        "default_payment_provider": "auto",  # "auto" | "paddle" | "payhere"
        "allow_paddle": True,
        "allow_payhere": True,
        "allow_firebase": False,
        "document_storage_provider": "local",
        "rate_limits": {"auth": 10, "admin": 200, "user": 100, "public": 20},
        "maintenance_mode": False,
    },
    # Caps which of Chat's real, integrated Claude models each plan tier may
    # use — "max_model" is the most capable model the plan is allowed to
    # escalate to, applied by Chat's model-router.service.ts on every turn.
    "ai_model_routing": {
        "provider": "groq",
        "free": {"max_model": "claude-haiku-4-5"},
        "pro": {"max_model": "claude-sonnet-4-5"},
        "max": {"max_model": "claude-sonnet-4-5"},
    },
    "chat_mcp_tools": {
        "start_chat_session": {"enabled": True, "rate_limit_per_min": 20},
        "send_message": {"enabled": True, "rate_limit_per_min": 60},
        "complete_session": {"enabled": True, "rate_limit_per_min": 30},
        "inspect_session_resources": {"enabled": True, "admin_read_only": True},
    },
}
# NOTE: "plans" is intentionally not seeded here — it's owned by plan_repository
# (the real `plans` table) and synced into config_entries from there. See
# config_engine.update_domain_config's "plans" guard.


class ConfigRepository:
    """Repository managing persistent admin_db entries and version history for admin configurations."""

    def __init__(self):
        self._seed_initial_data()

    def _seed_initial_data(self):
        for domain, data in SEED_DOMAIN_CONFIGS.items():
            # Only seed a domain that has never been persisted — avoids clobbering
            # real admin edits every time this process restarts.
            if self.get_domain_config(domain) is None:
                self._insert_domain_config(domain, data, version=1, admin_id="adm_system")

    def _row_to_entry(self, row: dict) -> ConfigEntry:
        return ConfigEntry(
            domain=row["domain"],
            data=json.loads(row["data_json"]),
            version=int(row["version"]),
            updated_by_admin_id=row.get("updated_by_admin_id"),
            updated_at=datetime.fromisoformat(row["updated_at"]),
        )

    def _row_to_history(self, row: dict) -> ConfigVersionHistory:
        return ConfigVersionHistory(
            id=row["id"],
            domain=row["domain"],
            version=int(row["version"]),
            data_snapshot=json.loads(row["data_json"]),
            changed_by_admin_id=row.get("changed_by_admin_id"),
            created_at=datetime.fromisoformat(row["created_at"]),
        )

    def _insert_domain_config(self, domain: str, data: Dict[str, Any], version: int, admin_id: Optional[str], expected_version: Optional[int] = None) -> ConfigEntry:
        now_iso=datetime.now(timezone.utc).isoformat();data_json=json.dumps(data)
        connection=admin_db.get_connection()
        try:
            cursor=connection.cursor()
            if admin_db.is_postgres:
                cursor.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,4805))',(domain,))
            else:cursor.execute('BEGIN IMMEDIATE')
            cursor.execute(admin_db._convert_query('SELECT version FROM config_entries WHERE domain=?'),(domain,))
            previous=cursor.fetchone()
            if expected_version is not None and (int(previous[0]) if previous else 0) != expected_version:
                from fastapi import HTTPException
                raise HTTPException(409, 'Configuration changed; reload before saving')
            # Seeding must never replace an existing operator policy.
            if version==1 and previous:
                connection.rollback()
            else:
                version=int(previous[0])+1 if previous else 1
                cursor.execute(admin_db._convert_query('''INSERT INTO config_entries(domain,data_json,version,updated_by_admin_id,updated_at)
                    VALUES(?,?,?,?,?) ON CONFLICT(domain) DO UPDATE SET data_json=excluded.data_json,
                    version=excluded.version,updated_by_admin_id=excluded.updated_by_admin_id,updated_at=excluded.updated_at'''),(domain,data_json,version,admin_id,now_iso))
                cursor.execute(admin_db._convert_query('INSERT INTO config_history(id,domain,version,data_json,changed_by_admin_id,created_at) VALUES(?,?,?,?,?,?)'),(f'ver_{domain}_{version}',domain,version,data_json,admin_id,now_iso))
                connection.commit()
        except BaseException:
            connection.rollback();raise
        finally:admin_db._release_connection(connection)
        return self.get_domain_config(domain)

    def get_domain_config(self, domain: str) -> Optional[ConfigEntry]:
        row = admin_db.fetch_one("SELECT * FROM config_entries WHERE domain = ?", (domain.lower().strip(),))
        return self._row_to_entry(row) if row else None

    def list_all_domain_configs(self) -> List[ConfigEntry]:
        rows = admin_db.fetch_all("SELECT * FROM config_entries ORDER BY domain ASC")
        return [self._row_to_entry(r) for r in rows]

    def update_domain_config(self, domain: str, data: Dict[str, Any], admin_id: str, expected_version: Optional[int] = None) -> ConfigEntry:
        domain_key = domain.lower().strip()
        existing = self.get_domain_config(domain_key)
        new_version = (existing.version + 1) if existing else 1
        return self._insert_domain_config(domain_key, data, version=new_version, admin_id=admin_id, expected_version=expected_version)

    def get_version_history(self, domain: str) -> List[ConfigVersionHistory]:
        rows = admin_db.fetch_all(
            "SELECT * FROM config_history WHERE domain = ? ORDER BY version ASC",
            (domain.lower().strip(),),
        )
        return [self._row_to_history(r) for r in rows]


config_repository = ConfigRepository()
