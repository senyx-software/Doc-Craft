import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verify: vi.fn(), find: vi.fn(), upsert: vi.fn(), session: vi.fn(), update: vi.fn(),
  access: vi.fn(), refresh: vi.fn(), mfa: vi.fn(),
}));
vi.mock('../db/prisma.js', () => ({ prisma: {
  user: { findUnique: mocks.find, upsert: mocks.upsert, update: mocks.update },
  session: { create: mocks.session },
} }));
vi.mock('../services/firebase.service.js', () => ({ verifyGoogleIdToken: mocks.verify }));
vi.mock('../services/jwt.service.js', () => ({
  signAccessToken: mocks.access, signRefreshToken: mocks.refresh, signMfaToken: mocks.mfa,
  verifyRefreshToken: vi.fn(), verifyMfaToken: vi.fn(), getExpiresInSeconds: vi.fn(),
}));
vi.mock('../services/email.service.js', () => ({ sendWelcomeEmail: vi.fn(), sendPasswordResetEmail: vi.fn(), sendVerificationEmail: vi.fn() }));
vi.mock('../services/loginTracking.service.js', () => ({ recordLoginEvent: vi.fn() }));
vi.mock('../services/productTracking.service.js', () => ({ trackProductEvent: vi.fn() }));
import { googleLogin, verifyEmail, register, updateMe } from './auth.controller.js';

const user = { id: 'existing-user', email: 'person@example.com', emailVerified: true,
  plan: 'pro', userClass: 'freelancer', status: 'active', twoFactorEnabled: false, authProvider: 'email' };
const request = { body: { idToken: 'token' }, log: { error: vi.fn() } } as any;
let reply: any;
beforeEach(() => {
  vi.resetAllMocks();
  mocks.verify.mockResolvedValue({ email: user.email, fullName: 'Person' });
  mocks.find.mockResolvedValue({ ...user });
  mocks.upsert.mockResolvedValue({ ...user, authProvider: 'google' });
  mocks.access.mockResolvedValue('access');
  mocks.refresh.mockResolvedValue('refresh');
  mocks.mfa.mockResolvedValue('mfa');
  reply = { status: vi.fn().mockReturnThis(), send: vi.fn().mockReturnThis() };
});

describe('account persistence and verification regressions', () => {
  it('an arbitrary six-digit code cannot provision a verified account', async () => {
    mocks.find.mockResolvedValue(null);
    await verifyEmail({ body: { email: 'unregistered@example.com', code: '123456' } } as any, reply);
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('storage outages cannot create a temporary registered identity', async () => {
    mocks.find.mockRejectedValue(new Error('offline'));
    await expect(register({ body: { email: 'fixture@example.com', password: 'StrongAuditPassword123!' } } as any, reply)).rejects.toMatchObject({ statusCode: 503 });
    expect(reply.send).not.toHaveBeenCalled();
  });
  it('failed verification persistence does not return verified success', async () => {
    mocks.find.mockResolvedValue({ ...user, emailVerified: false, verificationToken: '123456', verificationTokenExpiresAt: new Date(Date.now() + 60000) });
    mocks.update.mockRejectedValue(new Error('offline'));
    await verifyEmail({ body: { email: user.email, code: '123456' } } as any, reply);
    expect(reply.status).toHaveBeenCalledWith(503);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('timezone-only profile edits are persisted rather than discarded', async () => {
    mocks.update.mockResolvedValue({ ...user, timezone: 'Asia/Colombo' });
    await updateMe({ user: { id: user.id }, body: { timezone: 'Asia/Colombo' } } as any, reply);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: { timezone: 'Asia/Colombo' } }));
  });
  it('invalid timezone edits never write to storage', async () => {
    await updateMe({ user: { id: user.id }, body: { timezone: 'invalid/zone' } } as any, reply);
    expect(reply.status).toHaveBeenCalledWith(400);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

describe('Google session exchange', () => {
  it('rejects invalid identity before querying accounts', async () => {
    mocks.verify.mockRejectedValue(new Error('invalid'));
    await googleLogin(request, reply);
    expect(reply.status).toHaveBeenCalledWith(401);
    expect(mocks.find).not.toHaveBeenCalled();
  });
  it('preserves an existing account and plan', async () => {
    await googleLogin(request, reply);
    expect(mocks.access).toHaveBeenCalledWith(user.id, user.email, 'pro', 'freelancer');
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.session).toHaveBeenCalledOnce();
    expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ accessToken: 'access', refreshToken: 'refresh' }));
  });
  it('provisions a verified Google account on first sign-in', async () => {
    mocks.find.mockResolvedValue(null);
    await googleLogin(request, reply);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ email: user.email, emailVerified: true, authProvider: 'google' }),
    }));
  });
  it('requires the existing second factor without issuing session tokens', async () => {
    mocks.find.mockResolvedValue({ ...user, twoFactorEnabled: true });
    await googleLogin(request, reply);
    expect(reply.send).toHaveBeenCalledWith({ requires2FA: true, mfaToken: 'mfa' });
    expect(mocks.access).not.toHaveBeenCalled();
    expect(mocks.session).not.toHaveBeenCalled();
  });
  it.each([{ emailVerified: false }, { status: 'suspended' }, { deletedAt: new Date() }, { lockedUntil: new Date(Date.now() + 60000) }])('blocks unavailable accounts %j', async (overrides) => {
    mocks.find.mockResolvedValue({ ...user, ...overrides });
    await googleLogin(request, reply);
    expect(reply.status).toHaveBeenCalledWith(403);
    expect(mocks.access).not.toHaveBeenCalled();
  });
  it('fails closed when the database is unavailable', async () => {
    mocks.find.mockRejectedValue(new Error('offline'));
    await googleLogin(request, reply);
    expect(reply.status).toHaveBeenCalledWith(503);
    expect(mocks.access).not.toHaveBeenCalled();
  });
});
