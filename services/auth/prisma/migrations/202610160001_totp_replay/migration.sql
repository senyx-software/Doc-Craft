ALTER TABLE "users" ADD COLUMN "lastTotpStep" BIGINT NOT NULL DEFAULT -1;
CREATE TABLE "access_revocations"("key" TEXT PRIMARY KEY,"revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"expiresAt" TIMESTAMP(3) NOT NULL);
CREATE INDEX "access_revocations_expiresAt_idx" ON "access_revocations"("expiresAt");
