import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from app.db.admin_db import admin_db

class SecurityRepository:
    """
    Database repository for live security alerts, active sessions, IP logs, bot detection, and abuse reports.
    Queries and persists real runtime security events and administrative telemetry directly in the dedicated database.
    """

    def __init__(self):
        pass

    # ── Live Event Capturing Helpers ──────────────────────────────────────────
    def log_ip_access(self, ip_address: str, user_email: str, action: str, user_agent: str) -> Dict[str, Any]:
        """Record a real incoming IP access event in the database."""
        log_id = f"ip_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        admin_db.execute(
            """
            INSERT INTO ip_access_logs (id, ip_address, user_email, action, user_agent, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (log_id, ip_address or "127.0.0.1", user_email or "Anonymous", action, user_agent or "Browser", now_iso)
        )
        return {"id": log_id, "ip_address": ip_address, "user_email": user_email, "action": action, "user_agent": user_agent, "created_at": now_iso}

    def record_session(self, user_email: str, ip_address: str, device_agent: str) -> Dict[str, Any]:
        """Record or update a real active customer/admin JWT session in the database."""
        now_iso = datetime.now(timezone.utc).isoformat()
        sess_id = f"sess_{uuid.uuid4().hex[:10]}"
        admin_db.execute(
            """
            INSERT INTO active_sessions (id, user_email, ip_address, device_agent, last_active, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (sess_id, user_email, ip_address or "127.0.0.1", device_agent or "Browser Console", "Active now", now_iso)
        )
        return {"id": sess_id, "user_email": user_email, "ip_address": ip_address, "device_agent": device_agent, "last_active": "Active now", "created_at": now_iso}

    def log_bot_detection(
        self, ip_address: str, user_agent: str, reason: str,
        risk_score: float = 0.85, status: str = "Blocked",
    ) -> Dict[str, Any]:
        """Record a real bot/abuse-pattern detection event (reported by the Quota Service's ipAbuseDetection middleware)."""
        log_id = f"bot_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        admin_db.execute(
            """
            INSERT INTO bot_detection_logs (id, ip_address, user_agent, reason, risk_score, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (log_id, ip_address or "unknown", user_agent or "unknown", reason, risk_score, status, now_iso),
        )
        return {
            "id": log_id, "ip_address": ip_address, "user_agent": user_agent,
            "reason": reason, "risk_score": risk_score, "status": status, "created_at": now_iso,
        }

    def log_rate_limit_violation(self, ip_address: str, identifier: str, group_name: str, path: str, limit_val: int) -> Dict[str, Any]:
        """Record a real 429 block reported by the Gateway's rate limiter."""
        log_id = f"rl_{uuid.uuid4().hex[:12]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        admin_db.execute(
            """
            INSERT INTO rate_limit_violations (id, ip_address, identifier, group_name, path, limit_val, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (log_id, ip_address or "unknown", identifier or "unknown", group_name, path, limit_val, now_iso),
        )
        return {
            "id": log_id, "ip_address": ip_address, "identifier": identifier,
            "group_name": group_name, "path": path, "limit_val": limit_val, "created_at": now_iso,
        }

    def create_alert(self, title: str, details: str, severity: str = "medium") -> Dict[str, Any]:
        """Record a real security alert event in the database."""
        alt_id = f"alt_{uuid.uuid4().hex[:10]}"
        now_iso = datetime.now(timezone.utc).isoformat()
        admin_db.execute(
            """
            INSERT INTO security_alerts (id, title, details, severity, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (alt_id, title, details, severity, "Pending", now_iso)
        )
        return {"id": alt_id, "title": title, "details": details, "severity": severity, "status": "Pending", "created_at": now_iso}

    # ── Security Alerts ──
    def get_alerts(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Fetch real security alerts from security_alerts table, supplemented dynamically
        with high/medium severity events captured in audit_logs.
        """
        query = "SELECT * FROM security_alerts"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC"
        db_alerts = admin_db.fetch_all(query, tuple(params))

        # Dynamically build alerts from real security audit logs (e.g. login failures, ip blocks)
        audit_sec_events = admin_db.fetch_all(
            """
            SELECT * FROM audit_logs 
            WHERE module = 'security' OR action LIKE '%.failed' OR action LIKE '%blocked%' OR action LIKE '%unauthorized%'
            ORDER BY created_at DESC LIMIT 20
            """
        )

        seen_ids = {a["id"] for a in db_alerts}
        for audit in audit_sec_events:
            event_id = f"alt_sec_{audit['id']}"
            if event_id not in seen_ids:
                sev = "high" if "blocked" in audit["action"] or "failed" in audit["action"] else "medium"
                db_alerts.append({
                    "id": event_id,
                    "title": f"Security Event: {audit['action']}",
                    "details": f"Action '{audit['action']}' performed by {audit.get('admin_email') or 'IP ' + audit.get('ip_address', '127.0.0.1')}",
                    "severity": sev,
                    "status": "Pending",
                    "created_at": audit["created_at"]
                })

        db_alerts.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return db_alerts

    def resolve_alert(self, alert_id: str) -> Optional[Dict[str, Any]]:
        admin_db.execute("UPDATE security_alerts SET status = 'Resolved' WHERE id = ?", (alert_id,))
        return admin_db.fetch_one("SELECT * FROM security_alerts WHERE id = ?", (alert_id,))

    # ── Active Sessions ──
    def get_sessions(self) -> List[Dict[str, Any]]:
        import time
        from datetime import datetime, timezone
        rows=admin_db.fetch_all("SELECT id,admin_id,user_email,created_at,expires_at FROM admin_login_sessions WHERE expires_at>? ORDER BY created_at DESC",(int(time.time()),))
        for row in rows:
            row['created_at']=datetime.fromtimestamp(int(row['created_at']),timezone.utc).isoformat()
            row['expires_at']=datetime.fromtimestamp(int(row['expires_at']),timezone.utc).isoformat()
            row['ip_address']='Not recorded'
            row['device_agent']='Not recorded'
            row['status']='active'
            row['user_id']=row.pop('admin_id')
            row['last_active']='Valid until '+row['expires_at']
        return rows

    def terminate_session(self, session_id: str) -> bool:
        rows=admin_db.execute("DELETE FROM admin_login_sessions WHERE id=?",(session_id,))
        return rows>0

    # ── IP Access Logs & Rate Limits ──
    def get_ip_logs(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Fetch real IP access logs. Merges ip_access_logs and audit_logs to reflect real live incoming requests.
        """
        logs = admin_db.fetch_all("SELECT * FROM ip_access_logs ORDER BY created_at DESC LIMIT ?", (limit,))
        
        # Supplement with real events from audit_logs
        audit_rows = admin_db.fetch_all("SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT ?", (limit,))
        seen_ips = {f"{l.get('ip_address')}_{l.get('created_at')}" for l in logs}

        for r in audit_rows:
            ip_val = r.get("ip_address") or "127.0.0.1"
            ts_val = r.get("created_at") or ""
            key = f"{ip_val}_{ts_val}"
            if key not in seen_ips:
                logs.append({
                    "id": f"ip_log_{r['id']}",
                    "ip_address": ip_val,
                    "user_email": r.get("admin_email") or r.get("admin_id") or "System",
                    "action": r.get("action") or "API Request",
                    "user_agent": r.get("user_agent") or "Admin Console Client",
                    "created_at": ts_val
                })

        logs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        return logs[:limit]

    def get_rate_limits(self, limit: int = 50) -> List[Dict[str, Any]]:
        """
        Fetch real rate limit / WAF violations reported by the Gateway's
        rateLimiterMiddleware when it actually returns a 429. This used to
        reinterpret any audit_logs row containing "blocked"/"rate"/"failed"/
        "security" as a rate-limit violation — mislabeling unrelated events
        (e.g. an admin's own failed login) as gateway rate-limiting. An empty
        list here is the honest state until a real 429 has been reported.
        """
        rows = admin_db.fetch_all(
            "SELECT * FROM rate_limit_violations ORDER BY created_at DESC LIMIT ?", (limit,)
        )
        return [
            {
                "id": r["id"],
                "ip_address": r.get("ip_address") or "unknown",
                "user_email": r.get("identifier") or "unknown",
                "action": f"exceeded {r.get('limit_val')} req/min on {r.get('path')}",
                "user_agent": f"Gateway Rate Limiter ({r.get('group_name')})",
                "created_at": r.get("created_at") or "",
            }
            for r in rows
        ]

    # ── Bot Detection Logs ──
    def get_bot_logs(self) -> List[Dict[str, Any]]:
        """Fetch bot & scraper detection logs captured from request inspection."""
        return admin_db.fetch_all("SELECT * FROM bot_detection_logs ORDER BY created_at DESC")

    # ── Account Abuse Reports ──
    def get_abuse_reports(self, status: Optional[str] = None) -> List[Dict[str, Any]]:
        """Fetch account abuse reports from database."""
        query = "SELECT * FROM account_abuse_reports"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY created_at DESC"
        return admin_db.fetch_all(query, tuple(params))

    def resolve_abuse_report(self, report_id: str) -> Optional[Dict[str, Any]]:
        admin_db.execute("UPDATE account_abuse_reports SET status = 'Resolved' WHERE id = ?", (report_id,))
        return admin_db.fetch_one("SELECT * FROM account_abuse_reports WHERE id = ?", (report_id,))


security_repository = SecurityRepository()
