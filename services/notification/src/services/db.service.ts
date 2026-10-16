import {redact} from '../../../../shared/redact.mjs';
import {pgConnectionOptions} from '../../../../shared/pg-tls.mjs';
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), 'notification.env') });

const { Pool } = pg;

let pool: pg.Pool | null = null;
let initialized = false;

export function getDbPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    pool = new Pool(pgConnectionOptions(connectionString,{requireTls:process.env.PG_REQUIRE_TLS==='true',caFile:process.env.PGSSLROOTCERT}));
    if (!initialized) {
      initialized = true;
      if(process.env.NOTIFICATION_RUN_MIGRATIONS!=='false')initDb(pool).catch(() => console.warn('[db.service] Schema initialization failed'));
    }
  }
  return pool;
}

export async function initDb(p: pg.Pool) {
  try {
    await p.query(`
      CREATE TABLE IF NOT EXISTS "NotificationLog" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "channel" TEXT NOT NULL DEFAULT 'email',
        "status" TEXT NOT NULL DEFAULT 'sent',
        "payload" JSONB,
        "dedupeKey" TEXT,
        "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        "sentAt" TIMESTAMP WITH TIME ZONE
      );
      CREATE TABLE IF NOT EXISTS "NotificationPreference" (
        "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        "userId" TEXT UNIQUE NOT NULL,
        "marketing" BOOLEAN DEFAULT true,
        "billing" BOOLEAN DEFAULT true,
        "documentReady" BOOLEAN DEFAULT true,
        "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS "NotificationDelivery" (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        payload JSONB NOT NULL,
        fingerprint TEXT NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "completedAt" TIMESTAMPTZ
      );
      ALTER TABLE "NotificationDelivery" ADD COLUMN IF NOT EXISTS "attemptStartedAt" TIMESTAMPTZ;
      ALTER TABLE "NotificationDelivery" ADD COLUMN IF NOT EXISTS "requiresReview" BOOLEAN NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS notification_delivery_pending ON "NotificationDelivery" ("nextAttemptAt",id) WHERE "completedAt" IS NULL;
    `);
    console.log('[db.service] Notification database tables initialized successfully.');
  } catch (err: any) {
    console.warn('[db.service] Failed to initialize DB tables');
    throw err;
  }
}

export async function checkNotificationPreference(userId: string, emailType: string): Promise<boolean> {
  // If it's a critical email like password reset, verify email, or welcome, always send
  if (emailType === 'password_reset' || emailType === 'welcome' || emailType === 'verify_email') return true;

  const db = getDbPool();
  try {
    const res = await db.query(
      'SELECT * FROM "NotificationPreference" WHERE "userId" = $1',
      [userId]
    );
    const data = res.rows[0];
    if (!data) return true; // Default to true if not found

    if (emailType === 'marketing' && !data.marketing) return false;
    if (emailType === 'renewal' && !data.billing) return false;
    if (emailType === 'payment_failed' && !data.billing) return false;
    if (emailType === 'document_ready' && !data.documentReady) return false;

    return true;
  } catch (error) {
    console.error('Notification preference lookup failed');
    return true; // Default to send on error
  }
}

export async function logNotification(data: {
  userId: string;
  type: string;
  channel: string;
  status: string;
  payload: any;
  dedupeKey: string;
}) {
  const db = getDbPool();
  try {
    await db.query(
      `INSERT INTO "NotificationLog" ("userId", "type", "channel", "status", "payload", "dedupeKey", "createdAt", "sentAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        data.userId,
        data.type,
        data.channel,
        data.status,
        JSON.stringify(redact(data.payload)),
        data.dedupeKey,
        new Date(),
        data.status === 'sent' ? new Date() : null
      ]
    );
  } catch (error: any) {
    console.error('Notification log write failed');
  }
}

export async function getPreferences(userId: string) {
  const db = getDbPool();
  const res = await db.query(
    'SELECT * FROM "NotificationPreference" WHERE "userId" = $1',
    [userId]
  );
  return res.rows[0];
}

export async function updatePreferences(userId: string, body: any) {
  const db = getDbPool();
  
  // Retrieve existing preferences to merge updates
  const currentRes = await db.query(
    'SELECT * FROM "NotificationPreference" WHERE "userId" = $1',
    [userId]
  );
  const current = currentRes.rows[0] || { marketing: true, billing: true, documentReady: true };
  
  const marketing = body.marketing !== undefined ? body.marketing : current.marketing;
  const billing = body.billing !== undefined ? body.billing : current.billing;
  const documentReady = body.documentReady !== undefined ? body.documentReady : current.documentReady;

  await db.query(
    `INSERT INTO "NotificationPreference" ("userId", "marketing", "billing", "documentReady", "updatedAt")
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT ("userId") 
     DO UPDATE SET 
       "marketing" = EXCLUDED."marketing", 
       "billing" = EXCLUDED."billing", 
       "documentReady" = EXCLUDED."documentReady", 
       "updatedAt" = EXCLUDED."updatedAt"`,
    [userId, marketing, billing, documentReady, new Date()]
  );
  return { status: 'updated' };
}

export async function getLogs(userId?: string) {
  const db = getDbPool();
  let query = 'SELECT * FROM "NotificationLog"';
  const params = [];
  if (userId) {
    query += ' WHERE "userId" = $1';
    params.push(userId);
  }
  query += ' ORDER BY "createdAt" DESC LIMIT 50';
  const res = await db.query(query, params);
  return res.rows;
}

export async function getAdminLogs(opts: {
  statusFilter?: string;
  typeFilter?: string;
  limit?: number;
}) {
  const db = getDbPool();
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.statusFilter) {
    params.push(opts.statusFilter);
    conditions.push(`"status" = $${params.length}`);
  }
  if (opts.typeFilter) {
    params.push(opts.typeFilter);
    conditions.push(`"type" = $${params.length}`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const query = `SELECT * FROM "NotificationLog" ${where} ORDER BY "createdAt" DESC LIMIT ${limit}`;
  try {
    const res = await db.query(query, params);
    return res.rows;
  } catch (err: any) {
    console.warn('[db.service] Notification log query failed');
    return [];
  }
}


export async function closeDb(){if(pool){await pool.end();pool=null;}}
