import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.db.admin_db import admin_db
from app.models.plan import (
    BillingIntervalEnum,
    PlanModel,
    PlanStatusEnum,
    UserQuotaOverrideModel,
)

# NOTE: `monthly_quota` is a historical field name kept for wire compatibility
# with the Quota Service, payment service, and both frontends — it actually
# caps generations per DAY, reset every midnight UTC (see quota.service.ts's
# TTL-to-midnight logic). Renaming the field itself would mean touching that
# JSON contract everywhere it's read; only the value's meaning changed here,
# never its name.
SEED_PLANS = [
    PlanModel(
        id="plan_guest",
        name="Guest Preview",
        code="guest",
        description="Anonymous preview session before signup — created via /auth/guest, never a paid/purchasable plan",
        price_usd_monthly=0.0,
        price_usd_yearly=0.0,
        billing_interval=BillingIntervalEnum.BOTH,
        monthly_quota=1,
        status=PlanStatusEnum.ACTIVE,
        feature_flags={"watermark_removal": False, "custom_font_upload": False},
    ),
    PlanModel(
        id="plan_free",
        name="Free Tier",
        code="free",
        description="Default free tier for individual users",
        price_usd_monthly=0.0,
        price_usd_yearly=0.0,
        billing_interval=BillingIntervalEnum.BOTH,
        monthly_quota=3,
        payhere_plan_id=None,
        paddle_price_id=None,
        status=PlanStatusEnum.ACTIVE,
        feature_flags={"watermark_removal": False, "custom_font_upload": False},
    ),
    PlanModel(
        id="plan_pro",
        name="Pro Professional",
        code="pro",
        description="Professional plan for growing teams & businesses",
        price_usd_monthly=29.0,
        price_usd_yearly=290.0,
        billing_interval=BillingIntervalEnum.BOTH,
        monthly_quota=10,
        payhere_plan_id=None,
        paddle_price_id=None,
        status=PlanStatusEnum.ACTIVE,
        feature_flags={"watermark_removal": True, "custom_font_upload": True},
    ),
    PlanModel(
        id="plan_max",
        name="Max",
        code="max",
        description="High volume processing & dedicated SLAs for large teams",
        price_usd_monthly=199.0,
        price_usd_yearly=1990.0,
        billing_interval=BillingIntervalEnum.BOTH,
        monthly_quota=25,
        payhere_plan_id=None,
        paddle_price_id=None,
        status=PlanStatusEnum.ACTIVE,
        feature_flags={"watermark_removal": True, "custom_font_upload": True, "priority_pdf_rendering": True},
    ),
]

# Built-in codes a super admin can retune (including toggling to unlimited)
# but never delete outright — each is load-bearing for a live code path:
# 'guest' gates /auth/guest sessions, 'free'/'pro'/'max' gate signed-up users.
SYSTEM_PLAN_CODES = {"guest", "free", "pro", "max"}

class PlanRepository:
    """Persistent Repository for managing pricing plans, user quota overrides, and discount coupons via admin_db."""

    def __init__(self):
        self._seed_initial_data()

    def _seed_initial_data(self):
        for plan in SEED_PLANS:
            if not self.get_plan_by_id(plan.id):
                self._save_plan(plan)
        # Seed Redis so consuming services (Quota, Payment, Gateway) get live config on startup
        self._sync_plans_to_redis()

    def dedupe_by_code(self, plans: list) -> list:
        """Drop any plan whose code collides with an earlier plan in the list.

        Two (or more) plans sharing the same code would otherwise silently
        overwrite each other's shared `quota:plan:{code}` Redis key —
        whichever one a caller processes last wins, with no warning. That
        already happened once (a malformed duplicate "free" row capped every
        real free-tier user's quota at 0 instead of the admin-configured 5).
        Every place that builds a code-keyed plans payload for Redis/
        ConfigEngine should route through this instead of a bare dict
        comprehension, so a stray duplicate can't silently corrupt a real
        plan's quota again.
        """
        seen_codes: dict[str, str] = {}
        deduped: list = []
        for p in plans:
            if p.code in seen_codes:
                print(
                    f"[plan_repository] Skipping plan '{p.id}' (name={p.name!r}) "
                    f"— code '{p.code}' already used by plan '{seen_codes[p.code]}'. "
                    f"Fix the duplicate code in the plans table; neither row's "
                    f"quota is being trusted automatically."
                )
                continue
            seen_codes[p.code] = p.id
            deduped.append(p)
        return deduped

    def _sync_plans_to_redis(self):
        """Push all active plans into Redis config:domain:plans and quota:plan:{code} keys."""
        try:
            from app.core.redis import cache_manager
            from app.services.config_engine import config_engine
            plans_by_code = self.dedupe_by_code(self.list_active_plans())

            plans_dict = {p.code: p.model_dump(mode="json") for p in plans_by_code}
            # Write full plans payload to the shared config domain key (5-min TTL)
            config_engine.update_domain_config("plans", plans_dict, admin_id="system_seed")
            # Write per-plan daily quota limits for the Quota Service Lua path
            for p in plans_by_code:
                cache_manager.set(f"quota:plan:{p.code}", p.monthly_quota, ttl=None)
            print(f"[plan_repository] Seeded {len(plans_by_code)} plans into Redis")
        except Exception as e:
            print(f"[plan_repository] Redis seed skipped (Redis may be offline): {e}")



    # --- Helper methods ---
    def _row_to_plan(self, row: dict) -> PlanModel:
        ff = json.loads(row.get("feature_flags_json", "{}")) if row.get("feature_flags_json") else {}
        created_at_val = row.get("created_at")
        updated_at_val = row.get("updated_at")

        dt_created = datetime.fromisoformat(created_at_val) if isinstance(created_at_val, str) else datetime.now(timezone.utc)
        dt_updated = datetime.fromisoformat(updated_at_val) if isinstance(updated_at_val, str) else datetime.now(timezone.utc)

        return PlanModel(
            id=row["id"],
            name=row["name"],
            # Never fall back to `name` here — a plan with a blank `code`
            # column but a name like "free"/"pro" would silently resolve to
            # the SAME code as a real, correctly-configured plan, and
            # _sync_plans_to_redis below has no duplicate detection: whichever
            # row is processed last wins the shared Redis key. That's exactly
            # what happened with a stray zero-quota "free"-named row silently
            # capping every real free-tier user's quota at 0 instead of the
            # admin-configured 5. `row["id"]` is always unique, so it can
            # never collide with a real plan's code this way.
            code=row.get("code") or row["id"],
            description=row.get("description"),
            price_usd_monthly=float(row.get("price_usd_monthly", 0.0)),
            price_usd_yearly=float(row.get("price_usd_yearly", 0.0)),
            price_lkr_monthly=row.get("price_lkr_monthly"),
            price_lkr_yearly=row.get("price_lkr_yearly"),
            paddle_price_yearly_id=row.get("paddle_price_yearly_id"),
            billing_currency=row.get("billing_currency") or "USD",
            billing_interval=BillingIntervalEnum(row.get("billing_interval", "both")),
            monthly_quota=int(row.get("monthly_quota", 0)),
            payhere_plan_id=row.get("payhere_plan_id"),
            paddle_price_id=row.get("paddle_price_id"),
            status=PlanStatusEnum(row.get("status", "active")),
            feature_flags=ff,
            created_at=dt_created,
            updated_at=dt_updated,
        )

    def _save_plan(self, plan: PlanModel) -> PlanModel:
        now_iso = plan.updated_at.isoformat() if plan.updated_at else datetime.now(timezone.utc).isoformat()
        created_iso = plan.created_at.isoformat() if plan.created_at else datetime.now(timezone.utc).isoformat()
        ff_json = json.dumps(plan.feature_flags or {})

        admin_db.execute(
            """
            INSERT OR REPLACE INTO plans
            (id, name, code, description, price_usd_monthly, price_usd_yearly, billing_interval, monthly_quota, payhere_plan_id, paddle_price_id, status, feature_flags_json, created_at, updated_at, price_lkr_monthly, price_lkr_yearly, paddle_price_yearly_id, billing_currency)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                plan.id,
                plan.name,
                plan.code,
                plan.description,
                plan.price_usd_monthly,
                plan.price_usd_yearly,
                plan.billing_interval.value if hasattr(plan.billing_interval, "value") else str(plan.billing_interval),
                plan.monthly_quota,
                plan.payhere_plan_id,
                plan.paddle_price_id,
                plan.status.value if hasattr(plan.status, "value") else str(plan.status),
                ff_json,
                created_iso,
                now_iso,
                plan.price_lkr_monthly,
                plan.price_lkr_yearly,
                plan.paddle_price_yearly_id,
                plan.billing_currency,
            ),
        )
        return plan

    def _row_to_override(self, row: dict) -> UserQuotaOverrideModel:
        created_at_val = row.get("created_at")
        expires_at_val = row.get("expires_at")
        dt_created = datetime.fromisoformat(created_at_val) if isinstance(created_at_val, str) else datetime.now(timezone.utc)
        dt_expires = datetime.fromisoformat(expires_at_val) if isinstance(expires_at_val, str) else None

        return UserQuotaOverrideModel(
            id=row["id"],
            user_id=row["user_id"],
            custom_quota=int(row["custom_quota"]),
            reason=row.get("reason"),
            granted_by_admin_id=row["granted_by_admin_id"],
            expires_at=dt_expires,
            created_at=dt_created,
        )

    # --- Plan Operations ---
    def list_plans(self, include_archived: bool = False) -> List[PlanModel]:
        if include_archived:
            rows = admin_db.fetch_all("SELECT * FROM plans ORDER BY price_usd_monthly ASC")
        else:
            rows = admin_db.fetch_all("SELECT * FROM plans WHERE status != 'archived' ORDER BY price_usd_monthly ASC")
        return [self._row_to_plan(r) for r in rows]

    def list_active_plans(self) -> List[PlanModel]:
        """Only status == ACTIVE plans — this, not `list_plans()`, is the set
        that belongs in the Redis broadcast (config:domain:plans /
        quota:plan:{code}) the Quota/Payment/Gateway services actually read.
        A DRAFT plan must not resolve quota for anyone still assigned to it
        (that's what "deactivating" a plan means), so it's excluded here even
        though `list_plans(include_archived=False)` still includes it for the
        admin's own plan list/reactivation UI.
        """
        return [p for p in self.list_plans(include_archived=False) if p.status == PlanStatusEnum.ACTIVE]

    def get_plan_by_id(self, plan_id: str) -> Optional[PlanModel]:
        row = admin_db.fetch_one("SELECT * FROM plans WHERE id = ?", (plan_id,))
        return self._row_to_plan(row) if row else None

    def get_plan_by_code(self, code: str) -> Optional[PlanModel]:
        target = code.lower().strip()
        row = admin_db.fetch_one("SELECT * FROM plans WHERE LOWER(code) = ?", (target,))
        return self._row_to_plan(row) if row else None

    def create_plan(
        self,
        name: str,
        code: str,
        description: Optional[str],
        price_usd_monthly: float,
        price_usd_yearly: float,
        billing_interval: BillingIntervalEnum,
        monthly_quota: int,
        payhere_plan_id: Optional[str],
        paddle_price_id: Optional[str],
        feature_flags: Dict[str, Any],
        price_lkr_monthly: Optional[float] = None,
        price_lkr_yearly: Optional[float] = None,
        paddle_price_yearly_id: Optional[str] = None,
        billing_currency: str = "USD",
    ) -> PlanModel:
        plan_id = f"plan_{code.lower().replace(' ', '_')}"
        plan = PlanModel(
            id=plan_id,
            name=name,
            code=code,
            description=description,
            price_usd_monthly=price_usd_monthly,
            price_usd_yearly=price_usd_yearly,
            price_lkr_monthly=price_lkr_monthly,
            price_lkr_yearly=price_lkr_yearly,
            paddle_price_yearly_id=paddle_price_yearly_id,
            billing_currency=billing_currency,
            billing_interval=billing_interval,
            monthly_quota=monthly_quota,
            payhere_plan_id=payhere_plan_id,
            paddle_price_id=paddle_price_id,
            status=PlanStatusEnum.ACTIVE,
            feature_flags=feature_flags,
        )
        return self._save_plan(plan)

    def update_plan(self, plan_id: str, updates: Dict[str, Any]) -> Optional[PlanModel]:
        plan = self.get_plan_by_id(plan_id)
        if not plan:
            return None
        for key, val in updates.items():
            if val is not None and hasattr(plan, key):
                setattr(plan, key, val)
        plan.updated_at = datetime.now(timezone.utc)
        return self._save_plan(plan)

    def archive_plan(self, plan_id: str) -> Optional[PlanModel]:
        plan = self.get_plan_by_id(plan_id)
        if plan:
            plan.status = PlanStatusEnum.ARCHIVED
            plan.updated_at = datetime.now(timezone.utc)
            return self._save_plan(plan)
        return None

    # --- User Quota Override Operations ---
    def set_user_quota_override(
        self,
        user_id: str,
        custom_quota: int,
        admin_id: str,
        reason: Optional[str] = None,
        expires_at: Optional[datetime] = None,
    ) -> UserQuotaOverrideModel:
        override_id = f"ovr_{user_id}"
        override = UserQuotaOverrideModel(
            id=override_id,
            user_id=user_id,
            custom_quota=custom_quota,
            reason=reason,
            granted_by_admin_id=admin_id,
            expires_at=expires_at,
        )
        created_iso = override.created_at.isoformat()
        expires_iso = override.expires_at.isoformat() if override.expires_at else None

        admin_db.execute(
            """
            INSERT OR REPLACE INTO user_quota_overrides
            (id, user_id, custom_quota, reason, granted_by_admin_id, expires_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                override.id,
                override.user_id,
                override.custom_quota,
                override.reason,
                override.granted_by_admin_id,
                expires_iso,
                created_iso,
            ),
        )
        return override

    def get_user_quota_override(self, user_id: str) -> Optional[UserQuotaOverrideModel]:
        row = admin_db.fetch_one("SELECT * FROM user_quota_overrides WHERE user_id = ?", (user_id,))
        return self._row_to_override(row) if row else None

    def remove_user_quota_override(self, user_id: str) -> bool:
        rowcount = admin_db.execute("DELETE FROM user_quota_overrides WHERE user_id = ?", (user_id,))
        return rowcount > 0


plan_repository = PlanRepository()
