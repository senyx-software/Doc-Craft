/** Audit-only handler probes: external Google transport and persistence explicitly stubbed. */
import { beforeEach, expect, it, vi } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const mocks = vi.hoisted(() => ({ find: vi.fn(), session: vi.fn(), update: vi.fn(), access: vi.fn(), refresh: vi.fn() }));
vi.mock('../../services/auth/src/db/prisma.js', () => ({ prisma: {
  user: { findUnique: mocks.find, update: mocks.update }, session: { create: mocks.session },
} }));
vi.mock('../../services/auth/src/services/jwt.service.js', () => ({
  signAccessToken: mocks.access, signRefreshToken: mocks.refresh,
  signMfaToken: vi.fn(), verifyRefreshToken: vi.fn(), verifyMfaToken: vi.fn(), getExpiresInSeconds: vi.fn(),
}));
vi.mock('../../services/auth/src/services/email.service.js', () => ({ sendWelcomeEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock('../../services/auth/src/services/loginTracking.service.js', () => ({ recordLoginEvent: vi.fn() }));
vi.mock('../../services/auth/src/services/productTracking.service.js', () => ({ trackProductEvent: vi.fn() }));
vi.mock('../../services/auth/src/services/firebase.service.js', () => ({ verifyGoogleIdToken: vi.fn() }));
import { googleCallback } from '../../services/auth/src/controllers/auth.controller.js';

const evidence: unknown[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue('audit-placeholder-access');
  mocks.refresh.mockResolvedValue('audit-placeholder-refresh');
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ email: 'auditor@example.com', verified_email: true })));
});

it.each([
  ['mfa_enabled', { twoFactorEnabled: true }],
  ['suspended', { status: 'suspended' }],
  ['soft_deleted', { deletedAt: new Date() }],
  ['locked', { lockedUntil: new Date(Date.now() + 60000) }],
])('records OAuth callback handling for %s accounts', async (condition, overrides) => {
  const user = { id: 'audit-user', email: 'auditor@example.com', plan: 'free', userClass: 'freelancer', status: 'active', twoFactorEnabled: false, ...overrides };
  mocks.find.mockResolvedValue(user);
  const request = { server: { googleOAuth2: { getAccessTokenFromAuthorizationCodeFlow: vi.fn(async () => ({ token: { access_token: 'audit-placeholder-google' } })) } }, log: { error: vi.fn() } } as any;
  const reply = { redirect: vi.fn(), status: vi.fn().mockReturnThis(), send: vi.fn() } as any;
  await googleCallback(request, reply);
  const result = { condition, access_signed: mocks.access.mock.calls.length === 1, refresh_session_created: mocks.session.mock.calls.length === 1, redirect_with_fragment: String(reply.redirect.mock.calls[0]?.[0]).includes('#accessToken='), status_rejection: reply.status.mock.calls[0]?.[0] ?? null };
  evidence.push(result);
  const directory = resolve('docs/production-audit/evidence');
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'oauth-callback-handler.json'), JSON.stringify({ probe: 'SEC-001', type: 'actual_handler_stubbed_google_and_database', real_external_oauth: false, results: evidence, limitations: 'No real Google credentials or account compromise exercised; runtime Auth consumers still reject suspended/deleted accounts.' }, null, 2) + '\n');
  // Confirm existing behavior for an audit finding; these expectations do not endorse it.
  expect(result.access_signed).toBe(true);
  expect(result.refresh_session_created).toBe(true);
  expect(result.redirect_with_fragment).toBe(true);
});
