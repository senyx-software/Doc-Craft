-- CreateTable
CREATE TABLE "quotas" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "limit" INTEGER NOT NULL DEFAULT 3,
    "periodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resetsAt" TIMESTAMP(3) NOT NULL,
    "overrideLimit" INTEGER,
    "overrideReason" TEXT,
    "overriddenByAdminId" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_reset_logs" (
    "id" TEXT NOT NULL,
    "resetAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usersReset" INTEGER NOT NULL DEFAULT 0,
    "triggeredBy" TEXT NOT NULL DEFAULT 'cron',

    CONSTRAINT "quota_reset_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quota_audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "requires2FA" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quota_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quotas_userId_key" ON "quotas"("userId");

-- CreateIndex
CREATE INDEX "quotas_userId_idx" ON "quotas"("userId");

-- CreateIndex
CREATE INDEX "quota_audit_logs_targetId_idx" ON "quota_audit_logs"("targetId");

-- CreateIndex
CREATE INDEX "quota_audit_logs_action_idx" ON "quota_audit_logs"("action");
