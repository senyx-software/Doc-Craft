-- =============================================================================
-- DocCraft — Complete Database Schema for Supabase
-- =============================================================================
-- Run this entire file in the Supabase SQL Editor:
--   Dashboard → Project → SQL Editor → New query → Paste → Run
--
-- This script is idempotent: safe to run even if tables already exist.
-- =============================================================================

-- ─── Auth Service Tables ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "users" (
    "id"           TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "passwordHash" TEXT,
    "fullName"     TEXT,
    "avatarUrl"    TEXT,
    "authProvider" TEXT NOT NULL DEFAULT 'email',
    "plan"         TEXT NOT NULL DEFAULT 'free',
    "timezone"     TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_key" ON "users"("email");

CREATE TABLE IF NOT EXISTS "sessions" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    "refreshToken" TEXT NOT NULL,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sessions_refreshToken_key" ON "sessions"("refreshToken");

DO $$ BEGIN
  ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "password_resets" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "token"     TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used"      BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "password_resets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "password_resets_token_key" ON "password_resets"("token");

DO $$ BEGIN
  ALTER TABLE "password_resets" ADD CONSTRAINT "password_resets_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── Quota Service Tables ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "quotas" (
    "id"                  TEXT NOT NULL,
    "userId"              TEXT NOT NULL,
    "used"                INTEGER NOT NULL DEFAULT 0,
    "limit"               INTEGER NOT NULL DEFAULT 3,
    "periodStart"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetsAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "overrideLimit"       INTEGER,
    "overrideReason"      TEXT,
    "overriddenByAdminId" TEXT,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "quotas_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quotas_userId_key" ON "quotas"("userId");
CREATE INDEX IF NOT EXISTS "quotas_userId_idx" ON "quotas"("userId");

CREATE TABLE IF NOT EXISTS "quota_reset_logs" (
    "id"          TEXT NOT NULL,
    "resetAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usersReset"  INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',
    CONSTRAINT "quota_reset_logs_pkey" PRIMARY KEY ("id")
);

-- ─── Payment Service Tables ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "plans" (
    "id"                   TEXT NOT NULL,
    "name"                 TEXT NOT NULL,
    "priceMonthly"         DOUBLE PRECISION,
    "priceYearly"          DOUBLE PRECISION,
    "paddlePriceMonthlyId" TEXT,
    "paddlePriceYearlyId"  TEXT,
    "features"             JSONB NOT NULL DEFAULT '{}',
    "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "plans_name_key" ON "plans"("name");

CREATE TABLE IF NOT EXISTS "subscriptions" (
    "id"                    TEXT NOT NULL,
    "userId"                TEXT NOT NULL,
    "planId"                TEXT NOT NULL,
    "gateway"               TEXT NOT NULL,
    "paddleCustomerId"      TEXT,
    "paddleSubscriptionId"  TEXT,
    "payhereSubscriptionId" TEXT,
    "payhereOrderId"        TEXT,
    "status"                TEXT NOT NULL DEFAULT 'active',
    "currentPeriodStart"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelAtPeriodEnd"     BOOLEAN NOT NULL DEFAULT false,
    "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt"           TIMESTAMP(3),
    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_userId_key" ON "subscriptions"("userId");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_paddleSubscriptionId_key" ON "subscriptions"("paddleSubscriptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_payhereSubscriptionId_key" ON "subscriptions"("payhereSubscriptionId");
CREATE INDEX IF NOT EXISTS "subscriptions_userId_idx" ON "subscriptions"("userId");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions"("status");

DO $$ BEGIN
  ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "billing_invoices" (
    "id"               TEXT NOT NULL,
    "userId"           TEXT NOT NULL,
    "subscriptionId"   TEXT NOT NULL,
    "gatewayInvoiceId" TEXT NOT NULL,
    "gateway"          TEXT NOT NULL,
    "amount"           DOUBLE PRECISION NOT NULL,
    "currency"         TEXT NOT NULL DEFAULT 'LKR',
    "status"           TEXT NOT NULL,
    "pdfUrl"           TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt"           TIMESTAMP(3),
    CONSTRAINT "billing_invoices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_invoices_gatewayInvoiceId_key" ON "billing_invoices"("gatewayInvoiceId");
CREATE INDEX IF NOT EXISTS "billing_invoices_userId_idx" ON "billing_invoices"("userId");

DO $$ BEGIN
  ALTER TABLE "billing_invoices" ADD CONSTRAINT "billing_invoices_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "coupons" (
    "id"           TEXT NOT NULL,
    "code"         TEXT NOT NULL,
    "discountType" TEXT NOT NULL,
    "value"        DOUBLE PRECISION NOT NULL,
    "expiresAt"    TIMESTAMP(3) NOT NULL,
    "usageLimit"   INTEGER,
    "usageCount"   INTEGER NOT NULL DEFAULT 0,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt"    TIMESTAMP(3),
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "coupons_code_key" ON "coupons"("code");
CREATE INDEX IF NOT EXISTS "coupons_code_idx" ON "coupons"("code");

CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id"          TEXT NOT NULL,
    "eventId"     TEXT NOT NULL,
    "gateway"     TEXT NOT NULL,
    "eventType"   TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_eventId_key" ON "webhook_events"("eventId");
CREATE INDEX IF NOT EXISTS "webhook_events_eventId_idx" ON "webhook_events"("eventId");

-- ─── Chat & Document Service Tables ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "document_types" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "slotSchema"   JSONB NOT NULL DEFAULT '[]',
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "document_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "document_types_name_key" ON "document_types"("name");

CREATE TABLE IF NOT EXISTS "templates" (
    "id"                  TEXT NOT NULL,
    "documentTypeId"      TEXT NOT NULL,
    "name"                TEXT NOT NULL,
    "thumbnailUrl"        TEXT NOT NULL,
    "htmlPath"            TEXT NOT NULL,
    "isPremium"           BOOLEAN NOT NULL DEFAULT false,
    "colorPalettePresets" JSONB NOT NULL DEFAULT '[]',
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "chat_sessions" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "title"           TEXT NOT NULL DEFAULT 'Untitled Session',
    "isArchived"       BOOLEAN NOT NULL DEFAULT false,
    "documentTypeId"  TEXT NOT NULL,
    "templateId"      TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'active',
    "slots"           JSONB NOT NULL DEFAULT '{}',
    "accentColor"     TEXT,
    "modelPreference" TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt"     TIMESTAMP(3),
    "expiresAt"       TIMESTAMP(3),
    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_sessions_userId_idx" ON "chat_sessions"("userId");

CREATE TABLE IF NOT EXISTS "chat_messages" (
    "id"                     TEXT NOT NULL,
    "sessionId"              TEXT NOT NULL,
    "role"                   TEXT NOT NULL,
    "content"                TEXT NOT NULL,
    "flaggedPromptInjection" BOOLEAN NOT NULL DEFAULT false,
    "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chat_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "chat_messages_sessionId_idx" ON "chat_messages"("sessionId");

DO $$ BEGIN
  ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sessionId_fkey"
    FOREIGN KEY ("sessionId") REFERENCES "chat_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =============================================================================
-- Done! All DocCraft tables created.
-- Tables: users, sessions, password_resets, quotas, quota_reset_logs,
--         plans, subscriptions, billing_invoices, coupons, webhook_events,
--         document_types, templates, chat_sessions, chat_messages
-- =============================================================================
