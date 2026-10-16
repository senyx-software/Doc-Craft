import os
import secrets
from typing import List, Optional, Union
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    SERVICE_NAME: str = "DocCraft Admin API"
    ENV: str = Field(default="development")
    PORT: int = Field(default=3018)
    HOST: str = Field(default="0.0.0.0")

    # Dedicated Admin Database Configuration
    ADMIN_DATABASE_URL: str = Field(
        default_factory=lambda: os.getenv("ADMIN_DATABASE_URL") or os.getenv("DATABASE_URL") or "sqlite:///admin_database.db"
    )

    # Security & Auth Settings
    JWT_SECRET: str = Field(default_factory=lambda: secrets.token_urlsafe(48), min_length=32, validation_alias="ADMIN_JWT_SECRET")
    JWT_ALGORITHM: str = Field(default="HS256")
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=60)

    # IP Whitelisting (NFR-ADM-06 internal isolation)
    IP_WHITELIST_ENABLED: bool = Field(default=True)
    TRUSTED_PROXY_IPS: List[str] = Field(default=[])
    ALLOWED_ADMIN_IPS: List[str] = Field(
        default=["127.0.0.1", "::1", "localhost", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"]
    )

    # TOTP 2FA Settings
    TOTP_ISSUER: str = Field(default="DocCraft Admin")
    TOTP_WINDOW: int = Field(default=1)  # 30-second window tolerance

    # Internal Microservices Base URLs
    AUTH_SERVICE_URL: str = Field(default="http://localhost:3011")
    QUOTA_SERVICE_URL: str = Field(default="http://localhost:3015")
    PAYMENT_SERVICE_URL: str = Field(default="http://localhost:3014")
    CHAT_SERVICE_URL: str = Field(default="http://localhost:3016")
    DOCUMENT_SERVICE_URL: str = Field(default="http://localhost:3013")
    NOTIFICATION_SERVICE_URL: str = Field(default="http://localhost:3012")
    CHAT_SERVICE_MCP_URL: str = Field(default="http://localhost:3016/internal/resources")
    GATEWAY_URL: str = Field(default="http://localhost:3001")

    # Analytics & PostHog Configuration
    ANALYTICS_SERVICE_URL: str = Field(default="http://localhost:3017")
    POSTHOG_API_KEY: str = Field(default="")
    POSTHOG_HOST: str = Field(default="https://app.posthog.com")
    # Personal/private API key (distinct from the client-side project key above) —
    # required to read Experiments via PostHog's REST API. Unset by default; A/B
    # Tests reports "not configured" honestly rather than showing fabricated data.
    POSTHOG_PERSONAL_API_KEY: Optional[str] = Field(default=None)
    POSTHOG_PROJECT_ID: Optional[str] = Field(default=None)

    # Resend Email Configuration
    RESEND_API_KEY: str = Field(default="")
    RESEND_FROM_EMAIL: str = Field(default="onboarding@resend.dev")

    # CORS
    ALLOWED_ORIGINS: List[str] = Field(default=["*"])

    # Redis Configuration (for automation worker + event pub/sub)
    REDIS_URL: str = Field(default="redis://localhost:6379")

    # Automation Worker Settings
    AUTOMATION_WORKER_CONCURRENCY: int = Field(default=5)
    AUTOMATION_RETRY_LIMIT: int = Field(default=3)

    # Internal Service Authentication
    INTERNAL_SERVICE_SECRET: str = Field(default_factory=lambda: secrets.token_urlsafe(48))

    @model_validator(mode='after')
    def production_identity(self):
        if self.ENV.lower()=='production':
            if not os.getenv('ADMIN_JWT_SECRET'):
                raise ValueError('Production requires a stable, dedicated ADMIN_JWT_SECRET')
            if '*' in self.ALLOWED_ORIGINS:
                raise ValueError('Production requires explicit admin CORS origins')
        return self

    model_config = SettingsConfigDict(
        env_file=[".env", "../../.env"],
        env_file_encoding="utf-8",
        extra="ignore"
    )


settings = Settings()
