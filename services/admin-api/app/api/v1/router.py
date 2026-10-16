from fastapi import APIRouter
from app.api.v1.auth import router as auth_router
from app.api.v1.rbac import router as rbac_router
from app.api.v1.config import router as config_router
from app.api.v1.audit import router as audit_router
from app.api.v1.plans import router as plans_router
from app.api.v1.automation import router as automation_router
from app.api.v1.analytics import router as analytics_router
from app.api.v1.notifications import router as notifications_router
from app.api.v1.security import router as security_router
from app.api.v1.subscriptions import router as subscriptions_router
from app.api.v1.support import router as support_router
from app.api.v1.cost_ledger import router as cost_ledger_router
from app.api.v1.promotions import router as promotions_router
from app.api.v1.gdpr import router as gdpr_router
from app.api.v1.reports import router as reports_router
from app.api.v1.infrastructure import router as infrastructure_router
from app.api.v1 import users
from app.api.v1.templates import router as templates_router

router = APIRouter()
router.include_router(auth_router, prefix="/api/v1")
router.include_router(rbac_router, prefix="/api/v1")
router.include_router(audit_router, prefix="/api/v1")
router.include_router(security_router, prefix="/api/v1")
router.include_router(plans_router, prefix="/api/v1")
router.include_router(subscriptions_router, prefix="/api/v1")
router.include_router(cost_ledger_router, prefix="/api/v1")
router.include_router(promotions_router, prefix="/api/v1")
router.include_router(automation_router, prefix="/api/v1")
router.include_router(analytics_router, prefix="/api/v1")
router.include_router(notifications_router, prefix="/api/v1")
router.include_router(support_router, prefix="/api/v1")
router.include_router(gdpr_router, prefix="/api/v1")
router.include_router(reports_router, prefix="/api/v1")
router.include_router(infrastructure_router, prefix="/api/v1")
router.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
router.include_router(templates_router, prefix="/api/v1")
from app.api.v1.entitlements import router as entitlements_router
router.include_router(entitlements_router)
from app.api.v1.uploaded_templates import router as uploads_router
router.include_router(uploads_router)
router.include_router(config_router)
from app.api.v1.automation_intake import router as automation_intake_router
router.include_router(automation_intake_router)

# Alias for backwards compatibility
api_router = router


