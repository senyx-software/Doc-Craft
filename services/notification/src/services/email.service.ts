import {serviceFetch} from '../../../../shared/service-auth.mjs';
import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';
import handlebars from 'handlebars';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { LOGO_DATA_URI } from '../assets/logoBase64.js';

dotenv.config({ path: path.resolve(process.cwd(), 'notification.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let resendClient: Resend | null = null;
let adminConfigCache: any = null;
let lastCacheTime = 0;

export async function fetchAdminConfig() {
  const now = Date.now();

  const adminApiUrl = process.env.ADMIN_API_URL || 'http://localhost:3018';
  try {
    const res = await serviceFetch('admin-api', `${adminApiUrl}/api/v1/admin/notifications/config/public`, {
      headers: { 'X-Internal-Secret': process.env.INTERNAL_SERVICE_SECRET || '' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      adminConfigCache = data;
      lastCacheTime = now;
      return adminConfigCache;
    }
  } catch (err: any) {
    console.warn('[Notification Service] Provider policy unavailable; delivery retained for retry');
  }
  throw new Error('Email provider policy unavailable');
}

export async function sendEmail(type: string, data: any, idempotencyKey?:string,beforeProviderRequest?:()=>Promise<void>) {
  const toEmail = data.email || data.to;
  if (!toEmail) throw new Error('No destination email provided in job data');

  const adminConfig = await fetchAdminConfig();
  const settings = adminConfig?.settings || {};
  if((settings.email_provider || 'resend')!=='resend')throw new Error('Email delivery is disabled by the administrator');
  const templates = adminConfig?.templates || {};

  // Check Admin enable/disable flags
  const emailNotificationsEnabled = settings.email_notifications_enabled !== undefined ? settings.email_notifications_enabled : true;
  const isCritical = ['verify_email', 'password_reset', 'welcome', 'staff_invite', 'payment_receipt'].includes(type);

  if (!emailNotificationsEnabled && !isCritical) {
    console.log(`[Notification Service] Global email notifications disabled by Admin. Skipping non-critical event '${type}'.`);
    return { skipped: true, reason: 'Global email notifications disabled by Admin' };
  }

  // Branding tokens
  const primaryColor = settings.branding_primary_color || '#8B5CF6';
  // Known-dead defaults that predate this fix (verified via curl: both 404 /
  // fail to resolve, which is exactly why the header logo rendered as a
  // broken image). Treat them — and an unset value — as "no custom logo
  // configured" and use the logo shipped inline with this service instead of
  // depending on any external host being reachable at send time. An admin
  // who configures their own real logo URL still overrides this normally.
  const DEAD_LOGO_DEFAULTS = new Set([
    'https://doccraft.app/logo-left.png',
    'https://cdn.doccraft.app/assets/logo.svg',
  ]);
  const configuredLogoUrl = settings.branding_logo_url;
  const logoUrl = configuredLogoUrl && !DEAD_LOGO_DEFAULTS.has(configuredLogoUrl)
    ? configuredLogoUrl
    : LOGO_DATA_URI;
  const footerText = settings.branding_footer_text || '© 2026 DocCraft Inc. All rights reserved.';
  const senderEmail = settings.sender_email || process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  const senderName = settings.sender_name || 'DocCraft Platform';
  // Guard against senderEmail already being in "Name <email>" form (an admin
  // config value or RESEND_FROM_EMAIL set that way) — wrapping it again here
  // produced an invalid double-nested From header like
  // "DocCraft Platform <DocCraft <noreply@docCraft.com>>", which Resend
  // rejected outright, so every email silently never sent.
  const fromEmail = senderEmail.includes('<') ? senderEmail : `${senderName} <${senderEmail}>`;

  if (!process.env.RESEND_API_KEY || process.env.RESEND_API_KEY.includes('dummy')) {
    if (process.env.NODE_ENV === 'test') return { skipped: true, reason: 'Test transport' };
    throw new Error('Email delivery is not configured');
  }

  // Look up Admin-managed template override — keyed by event type (admin-api's
  // /config/public already filters to active, type-bound templates only).
  const adminTemplate = templates[type] || null;

  const defaultSubjects: Record<string, string> = {
    'verify_email': 'Verify your DocCraft Account',
    'welcome': 'Welcome to DocCraft!',
    'password_reset': 'DocCraft Password Reset Request',
    'document_ready': 'Your DocCraft Document is Ready!',
    'invoice_ready': 'Your DocCraft Invoice is Ready',
    'quota_alert': 'Monthly Document Quota Warning',
    'renewal': 'Subscription Renewal',
    'payment_receipt': 'Your DocCraft payment receipt',
    'payment_failed': 'Payment Failed',
    'cancellation': 'Subscription Cancelled',
    'staff_invite': "You've been invited to DocCraft Admin"
  };

  const subjectTemplateStr = adminTemplate?.subject || defaultSubjects[type] || 'DocCraft Notification';

  const templateData = {
    ...data,
    full_name: data.fullName || data.full_name || 'User',
    invoice_id: data.invoiceId || data.invoice_id || 'INV-001',
    percentage: data.percentage || 80,
    token: data.token || 'N/A',
    primary_color: primaryColor,
    logo_url: logoUrl,
    footer_text: footerText,
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173'
  };

  const compiledSubject = handlebars.compile(subjectTemplateStr)(templateData);

  let rawHtml = adminTemplate?.body_html;
  if (!rawHtml) {
    try {
      const templatePath = path.join(__dirname, '..', 'templates', `${type}.hbs`);
      if (fs.existsSync(templatePath)) {
        rawHtml = fs.readFileSync(templatePath, 'utf-8');
      }
    } catch (err) {}
  }

  if (!rawHtml) {
    rawHtml = `<p>Hello {{full_name}},</p><p>Your code/token is: <strong>{{token}}</strong></p>`;
  }

  const compiledBody = handlebars.compile(rawHtml)(templateData);

  // Wrap compiled body with Admin Branding layout
  const brandedHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #f4f4f7; color: #51545e; margin: 0; padding: 20px; }
          .email-wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
          .email-header { background: #111827; padding: 24px; text-align: center; border-bottom: 3px solid ${primaryColor}; }
          .email-header img { height: 36px; }
          .email-body { padding: 32px 24px; font-size: 15px; line-height: 1.6; color: #374151; }
          .email-footer { background: #f9fafb; padding: 20px; text-align: center; font-size: 12px; color: #9ca3af; border-top: 1px solid #e5e7eb; }
        </style>
      </head>
      <body>
        <div class="email-wrapper">
          <div class="email-header">
            <img src="${logoUrl}" alt="DocCraft Logo" />
          </div>
          <div class="email-body">
            ${compiledBody}
          </div>
          <div class="email-footer">
            ${footerText}
          </div>
        </div>
      </body>
    </html>
  `;

  // A plain-text alternative alongside the HTML body is standard email
  // hygiene — an HTML-only send (no multipart/alternative text part) is
  // itself a mild spam signal to filters like Gmail's. Derived from the
  // compiled inner body (not the full page wrapper) since that already
  // resolved all the Handlebars variables (token, name, etc.).
  const plainText = compiledBody
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  try {
    if (!resendClient) {
      resendClient = new Resend(process.env.RESEND_API_KEY);
    }

    await beforeProviderRequest?.();
    const { data: resendData, error } = await resendClient.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: compiledSubject,
      html: brandedHtml,
      text: plainText,
    },idempotencyKey?{idempotencyKey}:undefined);

    if (error) {
      console.warn('[Notification Service] Provider rejected delivery');
      throw new Error('Email provider rejected delivery');
    }
    return resendData;
  } catch (err: any) {
    console.warn('[Notification Service] Delivery failed; retained for retry');
    throw new Error('Email delivery failed');
  }
}
