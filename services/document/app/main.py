import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import document
from app.services.db import init_db
from app.workers.pdf_worker import start_pdf_worker
from app.services.authentication import authenticate_document_request
from shared.request_limits import RequestBodyLimit

app = FastAPI(
    title="DocCraft Document Service API",
    version="1.0.0",
    description="Handles document templates, synchronous previews, asynchronous PDF generation via sidecar, and public sharing."
)
app.add_middleware(RequestBodyLimit, path_limits={'/v1/document/templates/uploads': 7 * 1024 * 1024})
app.middleware("http")(authenticate_document_request)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount the router under the official documentation prefix (/v1/document)
app.include_router(document.router, prefix="/v1/document")

from fastapi.openapi.utils import get_openapi

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="DocCraft Document Service API",
        version="1.0.0",
        description="Handles document templates, synchronous previews, asynchronous PDF generation via sidecar, and public sharing.",
        routes=app.routes,
    )
    openapi_schema["components"]["securitySchemes"] = {
        "BearerAuth": {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "Enter your JWT Bearer token obtained from POST /v1/auth/login"
        }
    }
    openapi_schema["security"] = [{"BearerAuth": []}]
    openapi_schema["servers"] = [
        {"url": "http://localhost:3001/v1/document", "description": "API Gateway Proxy"},
        {"url": "http://localhost:3013", "description": "Direct Service Local"}
    ]
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi


@app.on_event("startup")
async def startup_event():
    # 1. Initialize database and create tables if not exists
    print("[main] Initializing database schema...")
    try:
        init_db()
        print("[main] Database schema initialized successfully.")
    except Exception as e:
        print(f"[main] Database initialization warning (non-fatal): {e}")

    # 2. Spawn BullMQ background worker task
    print("[main] Spawning background BullMQ PDF worker...")
    app.state.worker_task=asyncio.create_task(start_pdf_worker())
    from app.services.recovery import recovery_loop
    app.state.recovery_task=asyncio.create_task(recovery_loop())
    print("[main] Background worker task spawned.")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "document"}


@app.on_event('shutdown')
async def shutdown_worker():
    from app.services.pdf_runtime import shutdown_pdf_executor
    shutdown_pdf_executor()
    recovery=getattr(app.state,'recovery_task',None)
    if recovery:
        recovery.cancel()
        await asyncio.gather(recovery,return_exceptions=True)
    task=getattr(app.state,'worker_task',None)
    if task:
        task.cancel()
        await asyncio.gather(task,return_exceptions=True)

@app.get('/ready')
async def readiness_check():
    from shared.readiness import dependency_readiness
    from app.services.db import engine
    from sqlalchemy import text
    def database():
        with engine.connect() as connection:connection.execute(text('SELECT 1'))
    if not getattr(app.state,'worker_task',None) or app.state.worker_task.done():
        from fastapi.responses import JSONResponse
        return JSONResponse({'status':'worker unavailable'},status_code=503)
    return await dependency_readiness(database)
