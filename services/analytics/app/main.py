from fastapi.openapi.utils import get_openapi
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import analytics
from app.workers.posthog_worker import start_posthog_worker
from shared.request_limits import RequestBodyLimit

app = FastAPI(
    title="DocCraft Analytics Service API",
    version="1.0.0",
    description="Product analytics and dashboard reporting.",
)
app.add_middleware(RequestBodyLimit,max_bytes=100*1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3017", "http://127.0.0.1:3017",
                   "http://localhost:5173", "http://localhost:5174"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(analytics.router, prefix="/v1/analytics")


def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
    openapi_schema = get_openapi(
        title="DocCraft Analytics Service API",
        version="1.0.0",
        description="Product analytics and dashboard reporting.",
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
        {"url": "http://localhost:3001/v1/analytics",
            "description": "API Gateway Proxy"},
        {"url": "http://localhost:3017", "description": "Direct Service Local"}
    ]
    app.openapi_schema = openapi_schema
    return app.openapi_schema


app.openapi = custom_openapi


@app.on_event("startup")
async def startup_event():
    print("[main] Spawning background BullMQ Posthog worker...")
    asyncio.create_task(start_posthog_worker())
    print("[main] Background worker task spawned.")


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "analytics"}

@app.get('/ready')
async def readiness_check():
    from shared.readiness import dependency_readiness
    from app.services.db import engine
    from sqlalchemy import text
    def database():
        with engine.connect() as connection:connection.execute(text('SELECT 1'))
    return await dependency_readiness(database)
