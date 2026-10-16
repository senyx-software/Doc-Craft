-- Prisma encodes prior timestamp-without-zone values as UTC. Preserve those
-- instants explicitly, independently of the migration connection's TimeZone.
-- Before upgrading any already-running Phase 4 deployment, reconcile rows
-- created by non-UTC SQL defaults; their intended instants are ambiguous.
ALTER TABLE "payment_outbox"
  ALTER COLUMN "nextAttemptAt" TYPE TIMESTAMPTZ(3) USING "nextAttemptAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "completedAt" TYPE TIMESTAMPTZ(3) USING "completedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';
