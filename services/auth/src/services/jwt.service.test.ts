import {configureServiceFixture} from '../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('auth');
import { expect, it, vi } from 'vitest';
vi.hoisted(() => { process.env.JWT_SECRET = 'audit-test-access-secret-with-32-characters'; process.env.JWT_REFRESH_SECRET = 'audit-test-refresh-secret-with-32-characters'; });
import { signAccessToken, signMfaToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './jwt.service.js';
it('an MFA challenge cannot authenticate as an access token', async () => {
  await expect(verifyAccessToken(await signMfaToken('fixture'))).rejects.toThrow();
});
it('valid typed tokens keep the expected subject', async () => {
  expect((await verifyAccessToken(await signAccessToken('fixture', 'fixture@example.test', 'max'))).sub).toBe('fixture');
  expect((await verifyRefreshToken(await signRefreshToken('fixture'))).sub).toBe('fixture');
});
