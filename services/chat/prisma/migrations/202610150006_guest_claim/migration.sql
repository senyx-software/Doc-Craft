CREATE TABLE "guest_migrations" (
    "guestId" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "sessionIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
