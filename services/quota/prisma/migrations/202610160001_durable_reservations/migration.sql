CREATE TABLE "quota_reservations" (
 "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL, "reservationId" TEXT NOT NULL,
 "day" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "refundedAt" TIMESTAMP(3));
CREATE INDEX "quota_reservations_userId_day_idx" ON "quota_reservations"("userId","day");
CREATE TABLE "quota_daily_usage" ("userId" TEXT NOT NULL, "day" TEXT NOT NULL,
 "used" INTEGER NOT NULL DEFAULT 0 CHECK ("used">=0), PRIMARY KEY("userId","day"));
-- Preserve known legacy usage; staging rollout must first drain old writers and
-- reconcile Redis usage with these reporting rows (see deployment guide).
INSERT INTO "quota_daily_usage"("userId","day","used")
 SELECT "userId", to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC','YYYY-MM-DD'), GREATEST("used",0)
 FROM "quotas" WHERE "resetsAt">CURRENT_TIMESTAMP;

CREATE TABLE "quota_windows"("userId" TEXT PRIMARY KEY,"windowId" TEXT NOT NULL,"startsAt" TIMESTAMP(3) NOT NULL,"endsAt" TIMESTAMP(3) NOT NULL,"used" INTEGER NOT NULL DEFAULT 0 CHECK("used">=0));
-- Preserve the existing window at cutover. Its configured expiry is not extended;
-- the next accepted request begins a fresh rolling window.
INSERT INTO "quota_windows"("userId","windowId","startsAt","endsAt","used")
 SELECT "userId", 'legacy:'||"userId", "periodStart", "resetsAt", GREATEST("used",0) FROM "quotas" WHERE "resetsAt">CURRENT_TIMESTAMP;
