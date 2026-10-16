-- Intentionally invalidate legacy plaintext sessions during this security
-- upgrade. Users sign in again. User accounts and documents are unaffected.
UPDATE "sessions" SET "refreshToken" = 'invalidated:' || "id"
WHERE "refreshToken" NOT LIKE 'sha256:%';
