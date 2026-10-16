from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError

from app.api.v1.router import router as api_v1_router
from app.core.config import settings
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    generic_exception_handler,
    validation_exception_handler,
)
from app.security.middleware import IPWhitelistMiddleware, SecurityHeadersMiddleware, SubmissionBudgetMiddleware

from contextlib import asynccontextmanager
from app.cli.bootstrap import bootstrap_super_admin


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: bootstrap admin, start automation worker + event subscriber."""
    import asyncio

    # 1. Bootstrap Super Admin
    try:
        bootstrap_super_admin()
    except Exception as exc:
        print(f"[lifespan] Super Admin bootstrap notice: {str(exc)})")

    # 2. Start Automation Worker (asyncio BLPOP loop)
    from app.workers.automation_worker import AutomationWorker
    worker = AutomationWorker(
        redis_url=settings.REDIS_URL,
        concurrency=settings.AUTOMATION_WORKER_CONCURRENCY,
    )
    worker_task = asyncio.create_task(worker.start())

    # 3. Start Event Subscriber (Redis pub/sub)
    from app.queues.events import run_event_subscriber
    subscriber_task = asyncio.create_task(run_event_subscriber(settings.REDIS_URL))
    from app.services.automation_inbox import run as run_billing_inbox
    inbox_stop=asyncio.Event()
    inbox_task=asyncio.create_task(run_billing_inbox(inbox_stop))

    yield

    # Graceful shutdown
    worker.stop()
    inbox_stop.set()
    subscriber_task.cancel()
    try:
        await asyncio.wait_for(asyncio.gather(worker_task, subscriber_task,inbox_task, return_exceptions=True),timeout=25)
    except asyncio.TimeoutError:
        worker_task.cancel()
        await asyncio.gather(worker_task,return_exceptions=True)
        print('[lifespan] Automation drain deadline exceeded; inspect outstanding work before restart')


app = FastAPI(
    title=settings.SERVICE_NAME,
    version="1.0.0",
    description="DocCraft Admin API Control Plane Service",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# 1. Custom Exception Handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# 2. Security Middlewares (Order: Security Headers -> IP Whitelist -> CORS)
app.add_middleware(SecurityHeadersMiddleware)
from shared.request_limits import RequestBodyLimit
app.add_middleware(RequestBodyLimit, max_bytes=1024*1024)
app.add_middleware(SubmissionBudgetMiddleware)
app.add_middleware(IPWhitelistMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Mount API V1 Router
app.include_router(api_v1_router)


@app.get("/health", tags=["Monitoring"])
def health_check():
    return {
        "status": "ok",
        "service": settings.SERVICE_NAME,
        "env": settings.ENV,
        "ip_whitelist_enabled": settings.IP_WHITELIST_ENABLED,
    }


@app.get("/", tags=["Root"])
def root():
    return {
        "message": "DocCraft Admin API Control Plane Service is running independently of public gateway",
        "version": "1.0.0",
    }


@app.get('/ready')
async def readiness_check():
    from shared.readiness import dependency_readiness
    from app.db.admin_db import admin_db
    return await dependency_readiness(lambda:admin_db.fetch_one('SELECT 1'))
