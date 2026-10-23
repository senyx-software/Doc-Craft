-- Additive. Fails safely if legacy case-variant addresses collide; do not auto-merge accounts.
CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_normalized_uq
ON admin_users (LOWER(TRIM(email)));
