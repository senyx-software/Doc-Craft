CREATE TABLE "payment_outbox"("id" TEXT PRIMARY KEY,"kind" TEXT NOT NULL,"payload" JSONB NOT NULL,
 "attempts" INTEGER NOT NULL DEFAULT 0,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "completedAt" TIMESTAMP(3),"updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "payment_outbox_completedAt_nextAttemptAt_idx" ON "payment_outbox"("completedAt","nextAttemptAt");
CREATE TABLE "payment_provider_cursors"("id" TEXT PRIMARY KEY,"occurredAt" TIMESTAMP(3) NOT NULL,"eventId" TEXT NOT NULL);
CREATE TABLE "billing_adjustments"("providerId" TEXT PRIMARY KEY,"invoiceId" TEXT NOT NULL REFERENCES "billing_invoices"("id"),"amountMinor" INTEGER NOT NULL CHECK("amountMinor">=0),"currency" TEXT NOT NULL,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE INDEX "billing_adjustments_invoiceId_idx" ON "billing_adjustments"("invoiceId");
ALTER TABLE "subscriptions" ADD COLUMN "payhereSyncAt" TIMESTAMP(3);
