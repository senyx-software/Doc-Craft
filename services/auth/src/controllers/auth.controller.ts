import {recordFailedAuthentication,recordSuccessfulAuthentication} from '../services/login-budget.service.js';
import {revokeAccess,revokeAllAccess} from '../services/access-revocation.service.js';
import {tokenDigest} from '../services/token-digest.service.js';
import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword, validatePasswordStrength } from '../services/password.service.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken, signMfaToken, verifyMfaToken } from '../services/jwt.service.js';
import { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail } from '../services/email.service.js';
import {sealSecret} from '../../../../shared/sealed-secret.mjs';
import {claimTotp} from '../services/totp-security.service.js';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';

// otplib's default window is 0 — a code is accepted only if it matches the
// exact current 30-second tick, with zero tolerance for clock drift between
// the user's phone and this server, or for the delay between reading a code
// off an app and submitting it. window: 1 accepts the previous/current/next
// step (~±30s), the standard tolerance most TOTP implementations use (the
// admin portal's own TOTP check already does this — see
// services/admin-api's TOTP_WINDOW=1). Without it, users intermittently get
// "Invalid TOTP code" for entirely correct codes.
authenticator.options = { window: 1 };
import { randomBytes, randomUUID, randomInt } from 'crypto';
import { recordLoginEvent } from '../services/loginTracking.service.js';
import { trackProductEvent } from '../services/productTracking.service.js';
import { verifyGoogleIdToken } from '../services/firebase.service.js';

export async function googleLogin(request: FastifyRequest, reply: FastifyReply) {
  let profile;
  try {
    profile = await verifyGoogleIdToken((request.body as { idToken: string }).idToken);
  } catch (error:any) {
    if(error?.statusCode===503)return reply.status(503).send({error:'Google sign-in is unavailable'});
    return reply.status(401).send({ error: 'Invalid or expired Google sign-in. Please try again.' });
  }
  // Database failures must not create temporary identities.
  try {
    let user = await prisma.user.findUnique({ where: { email: profile.email } });
    const isNewUser = !user;
    if (!user) {
      user = await prisma.user.upsert({
        where: { email: profile.email },
        create: { ...profile, authProvider: 'google', emailVerified: true },
        update: {},
      });
    }
    if (user.status !== 'active' || user.deletedAt || (user.lockedUntil && user.lockedUntil > new Date())) {
      return reply.status(403).send({ error: 'This account is unavailable. Please contact support or try again later.' });
    }
    if (!user.emailVerified) {
      return reply.status(403).send({ error: 'Please verify your existing account email before signing in with Google.' });
    }
    if (user.twoFactorEnabled) {
      return reply.send({ requires2FA: true, mfaToken: await signMfaToken(user.id) });
    }
    const accessToken = await signAccessToken(user.id, user.email, user.plan, user.userClass);
    const refreshToken = await signRefreshToken(user.id);
    await prisma.session.create({ data: {
      userId: user.id, refreshToken:tokenDigest(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    } });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    recordLoginEvent(user.id, request);
    trackProductEvent(user.id, isNewUser ? 'user_signed_up' : 'user_logged_in', { method: 'google', auth_provider: 'google' });
    return reply.send({
      user: { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl,
        authProvider: user.authProvider, plan: user.plan, userClass: user.userClass, twoFactorEnabled: false },
      accessToken, refreshToken,
    });
  } catch (error) {
    request.log.error(error);
    return reply.status(503).send({ error: 'Google sign-in is temporarily unavailable. Please try again.' });
  }
}

async function persisted<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); }
  catch { throw Object.assign(new Error('Account storage is temporarily unavailable'), { statusCode: 503 }); }
}
async function safeFindUserByEmail(email: string) { return persisted(() => prisma.user.findUnique({ where: { email } })); }
async function safeFindUserById(id: string) { return persisted(() => prisma.user.findUnique({ where: { id } })); }
async function safeCreateUser(data: any) { return persisted(() => prisma.user.create({ data })); }
async function safeCreateSession(data: any) { return persisted(() => prisma.session.create({ data:{...data,refreshToken:tokenDigest(data.refreshToken)} })); }

export async function register(request: FastifyRequest, reply: FastifyReply) {
  const { email, password, fullName } = request.body as any;

  const { valid, message } = validatePasswordStrength(password);
  if (!valid) {
    return reply.status(400).send({ error: message });
  }

  const existingUser = await safeFindUserByEmail(email);
  if (existingUser) {
    if (existingUser.emailVerified) {
      return reply.status(409).send({ error: 'User with this email already exists. Please log in.' });
    }

    // Unverified existing user — update credentials & issue a new 6-digit OTP code
    const passwordHash = await hashPassword(password);
    const otpCode = randomInt(100000, 1000000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    existingUser.passwordHash = passwordHash;
    existingUser.fullName = fullName || existingUser.fullName;
    existingUser.verificationToken = otpCode;
    existingUser.verificationTokenExpiresAt = otpExpiry;

    try {
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          passwordHash,
          fullName: fullName || existingUser.fullName,
          verificationToken: otpCode,
          verificationTokenExpiresAt: otpExpiry
        }
      });
    } catch (err) {}

    sendVerificationEmail(email, otpCode, fullName || existingUser.fullName).catch(() => {});

    return reply.status(201).send({
      status: 'success',
      message: 'Account created! Please check your email for the 6-digit verification code.',
      email: existingUser.email,
      requiresVerification: true
    });
  }

  const passwordHash = await hashPassword(password);
  const otpCode = randomInt(100000, 1000000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  const user = await safeCreateUser({
    email,
    passwordHash,
    fullName,
    authProvider: 'email',
    verificationToken: otpCode,
    verificationTokenExpiresAt: otpExpiry,
    emailVerified: false
  });

  sendVerificationEmail(email, otpCode, fullName).catch(() => {});

  return reply.status(201).send({
    status: 'success',
    message: 'Account created! Please check your email for the 6-digit verification code.',
    email: user.email,
    requiresVerification: true
  });
}

export async function login(request: FastifyRequest, reply: FastifyReply) {
  const { email, password, totpCode } = request.body as any;

  const user = await safeFindUserByEmail(email);
  if (!user || !user.passwordHash) {
    return reply.status(401).send({ error: 'Invalid email or password' });
  }

  if (user.status !== 'active' || user.deletedAt) return reply.status(403).send({ error: 'Account unavailable' });

  if (!user.emailVerified) {
    return reply.status(401).send({ error: 'Please verify your email first before logging in.' });
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return reply.status(403).send({ error: 'Account temporarily locked due to failed attempts. Try again later.' });
  }

  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    await recordFailedAuthentication(user.id);
    return reply.status(401).send({ error: 'Invalid email or password' });
  }

  if (user.twoFactorEnabled) {
    const mfaToken = await signMfaToken(user.id);
    return reply.send({
      requires2FA: true,
      mfaToken,
      message: 'Please provide TOTP code to complete login'
    });
  }

  await recordSuccessfulAuthentication(user.id);
  const accessToken = await signAccessToken(user.id, user.email, user.plan, (user as any).userClass);
  const refreshToken = await signRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await safeCreateSession({ userId: user.id, refreshToken, expiresAt });
  try {
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  } catch (err) {}
  recordLoginEvent(user.id, request);
  trackProductEvent(user.id, 'user_logged_in', { method: 'password' });

  return reply.send({
    user: { id: user.id, email: user.email, fullName: user.fullName, plan: user.plan, userClass: (user as any).userClass },
    accessToken,
    refreshToken,
  });
}

export async function login2FA(request: FastifyRequest, reply: FastifyReply) {
  const { mfaToken, totpCode } = request.body as { mfaToken: string; totpCode: string };

  let decoded;
  try {
    decoded = await verifyMfaToken(mfaToken);
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid or expired MFA token. Please log in again.' });
  }

  const user = await prisma.user.findUnique({ where: { id: decoded.sub } });
  if (!user || !user.totpSecret) {
    return reply.status(401).send({ error: 'Invalid user or 2FA not enabled' });
  }

  if (user.status !== 'active' || user.deletedAt || !user.twoFactorEnabled || (user.lockedUntil && user.lockedUntil > new Date())) return reply.status(403).send({ error: 'Account unavailable' });

  const isValidTotp = await claimTotp(user.id,user.totpSecret,totpCode);
  if (!isValidTotp) {
    await recordFailedAuthentication(user.id);
    return reply.status(401).send({ error: 'Invalid 2FA code' });
  }

  await recordSuccessfulAuthentication(user.id);

  const accessToken = await signAccessToken(user.id, user.email, user.plan, (user as any).userClass);
  const refreshToken = await signRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: { userId: user.id, refreshToken:tokenDigest(refreshToken), expiresAt },
  });
  recordLoginEvent(user.id, request);
  trackProductEvent(user.id, 'user_logged_in', { method: 'password_2fa' });

  return reply.send({
    user: { id: user.id, email: user.email, fullName: user.fullName, plan: user.plan, userClass: (user as any).userClass },
    accessToken,
    refreshToken,
  });
}

export async function verifyEmail(request: FastifyRequest, reply: FastifyReply) {
  const { email, code } = request.body as { email: string; code: string };

  if (!email || !code) {
    return reply.status(400).send({ error: 'Email and 6-digit verification code are required' });
  }

  let user = await safeFindUserByEmail(email);
  
  if (!user) return reply.status(400).send({ error: 'Invalid email or verification code' });

  if (user.emailVerified) {
    return reply.send({ status: 'verified', message: 'Email is already verified. You can log in now!' });
  }

  if (!user.verificationToken || user.verificationToken !== code.trim()) {
    return reply.status(400).send({ error: 'Invalid verification code' });
  }

  const expiresAt = user.verificationTokenExpiresAt;
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return reply.status(400).send({ error: 'Verification code has expired. Please request a new one.' });
  }

  user.emailVerified = true;
  user.verificationToken = null;
  user.verificationTokenExpiresAt = null;

  try {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationToken: null,
        verificationTokenExpiresAt: null,
      }
    });
  } catch {
    return reply.status(503).send({ error: 'Email verification could not be saved. Please retry.' });
  }

  trackProductEvent(user.id, 'user_signed_up', { auth_provider: user.authProvider || 'email' });
  return reply.send({ status: 'verified', message: 'Email successfully verified. You can now log in!' });
}

export async function resendVerificationCode(request: FastifyRequest, reply: FastifyReply) {
  const { email } = request.body as { email: string };
  if (!email) {
    return reply.status(400).send({ error: 'Email address is required' });
  }

  let user = await safeFindUserByEmail(email);

  // Generate a new 6-digit OTP and 10-minute expiry
  const otpCode = randomInt(100000, 1000000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

  if (!user) {
    return reply.send({ status: 'success', message: 'If an unverified account exists, a verification code has been sent.' });
  } else {
    if (user.emailVerified) {
      return reply.send({ status: 'success', message: 'Email is already verified. You can log in directly!' });
    }

    user.verificationToken = otpCode;
    user.verificationTokenExpiresAt = otpExpiry;

    try {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationToken: otpCode,
          verificationTokenExpiresAt: otpExpiry
        }
      });
    } catch { return reply.status(503).send({ error: "Verification code could not be saved. Please retry." }); }
  }

  sendVerificationEmail(email, otpCode, user.fullName || '').catch(() => {});

  return reply.send({
    status: 'success',
    message: 'A new 6-digit verification code has been sent to your email.'
  });
}

export async function refresh(request: FastifyRequest, reply: FastifyReply) {
  const { refreshToken } = request.body as any;
  let decoded;
  try {
    decoded = await verifyRefreshToken(refreshToken);
  } catch (err) {
    return reply.status(401).send({ error: 'Invalid or expired refresh token' });
  }

  const session = await prisma.session.findUnique({
    where: { refreshToken:tokenDigest(refreshToken) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) await prisma.session.delete({ where: { id: session.id } });
    return reply.status(401).send({ error: 'Session expired or invalid' });
  }

  const user = session.user;
  if (user.id !== decoded.sub || user.status !== 'active' || user.deletedAt) return reply.status(403).send({ error: 'Account unavailable' });
  const newAccessToken = await signAccessToken(user.id, user.email, user.plan, (user as any).userClass);
  const newRefreshToken = await signRefreshToken(user.id);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

  await prisma.$transaction([
    prisma.session.delete({ where: { id: session.id } }),
    prisma.session.create({
      data: { userId: user.id, refreshToken:tokenDigest(newRefreshToken), expiresAt },
    }),
  ]);

  return reply.send({ accessToken: newAccessToken, refreshToken: newRefreshToken });
}

export async function logout(request: FastifyRequest, reply: FastifyReply) {
  const {refreshToken}=request.body as {refreshToken?:string};
  const userId=request.headers['x-user-id'] as string;
  await revokeAccess(request.headers.authorization!.slice(7));
  if(refreshToken)await prisma.session.deleteMany({where:{refreshToken:tokenDigest(refreshToken),userId}});
  else await prisma.session.deleteMany({where:{userId}});
  return reply.send({ success: true });
}

export async function forgotPassword(request: FastifyRequest, reply: FastifyReply) {
  const { email } = request.body as any;
  const user = await prisma.user.findUnique({ where: { email } });
  
  if (!user) {
    return reply.send({ success: true, message: 'If an account exists, a reset email has been sent.' });
  }

  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

  await prisma.passwordReset.create({
    data: { userId: user.id, token, expiresAt }
  });

  sendPasswordResetEmail(user.email, token, user.fullName || undefined).catch(err => {
    console.error('Failed to send password reset email:', err);
  });

  return reply.send({ success: true, message: 'If an account exists, a reset email has been sent.' });
}

export async function resetPassword(request: FastifyRequest, reply: FastifyReply) {
  const { token, newPassword } = request.body as any;
  
  const resetRecord = await prisma.passwordReset.findUnique({ where: { token } });

  if (!resetRecord || resetRecord.used || resetRecord.expiresAt < new Date()) {
    return reply.status(400).send({ error: 'Invalid or expired reset token' });
  }

  const { valid, message } = validatePasswordStrength(newPassword);
  if (!valid) return reply.status(400).send({ error: message });

  const passwordHash = await hashPassword(newPassword);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: resetRecord.userId },
      data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null }
    }),
    prisma.passwordReset.update({
      where: { id: resetRecord.id },
      data: { used: true }
    })
  ]);

  await prisma.session.deleteMany({where:{userId:resetRecord.userId}});
  await revokeAllAccess(resetRecord.userId);
  return reply.send({ success: true, message: 'Password has been reset successfully' });
}

export async function getMe(request: FastifyRequest, reply: FastifyReply) {
  const userPayload = (request as any).user;
  const user = await safeFindUserById(userPayload.id);

  if (!user) return reply.status(404).send({ error: 'User not found' });
  return reply.send({ user });
}

export async function updateMe(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).user.id;
  const { fullName, avatarUrl, timezone } = request.body as any;

  const data: any = {};
  if (fullName !== undefined) data.fullName = fullName;
  if (avatarUrl !== undefined) data.avatarUrl = avatarUrl;
  if (timezone !== undefined) {
    try { new Intl.DateTimeFormat('en', { timeZone: timezone }).format(); }
    catch { return reply.status(400).send({ error: 'Invalid timezone' }); }
    data.timezone = timezone;
  }

  if (Object.keys(data).length === 0) {
    return reply.status(400).send({ error: 'No fields to update' });
  }

  const user = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, email: true, fullName: true, avatarUrl: true, plan: true, userClass: true, status: true, authProvider: true, twoFactorEnabled: true, timezone: true }
  });

  return reply.send({ user });
}

export async function googleCallback(request: FastifyRequest, reply: FastifyReply) {
  try {
    const token = await (request.server as any).googleOAuth2.getAccessTokenFromAuthorizationCodeFlow(request);
    
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token.token.access_token}` },
    });
    const profile = (await res.json()) as any;
    
    if (!profile.email) return reply.status(400).send({ error: 'Failed to retrieve email from Google' });

    let user = await prisma.user.findUnique({ where: { email: profile.email } });
    let isNewUser = false;

    if (!user) {
      user = await prisma.user.create({
        data: {
          email: profile.email,
          fullName: profile.name,
          avatarUrl: profile.picture,
          authProvider: 'google',
          emailVerified: true
        }
      });
      isNewUser = true;
    }

    const accessToken = await signAccessToken(user.id, user.email, user.plan, (user as any).userClass);
    const refreshToken = await signRefreshToken(user.id);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({ data: { userId: user.id, refreshToken:tokenDigest(refreshToken), expiresAt } });
    try {
      await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    } catch (err) {}
    recordLoginEvent(user.id, request);
    if (isNewUser) {
      trackProductEvent(user.id, 'user_signed_up', { auth_provider: 'google' });
    } else {
      trackProductEvent(user.id, 'user_logged_in', { method: 'google_oauth' });
    }

    // Use URL fragment (#) so tokens are available to client-side JS but NEVER sent to the server in HTTP requests
    return reply.redirect(`${process.env.FRONTEND_URL || 'http://localhost:5173'}/oauth-callback#accessToken=${accessToken}&refreshToken=${refreshToken}`);
  } catch (err) {
    request.log.error(err);
    return reply.status(500).send({ error: 'OAuth authentication failed' });
  }
}

export async function enable2FA(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).user.id;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  if (!user) return reply.status(404).send({ error: 'User not found' });
  if (user.twoFactorEnabled) return reply.status(400).send({ error: '2FA is already enabled' });

  const secret = authenticator.generateSecret();
  const otpauthUrl = authenticator.keyuri(user.email, 'DocCraft', secret);
  const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);
  
  await prisma.user.update({
    where: { id: userId },
    data: { pendingTotpSecret: sealSecret(secret,userId),lastTotpStep:BigInt(-1) } 
  });

  return reply.send({ secret, qrCodeUrl });
}

export async function verify2FA(request: FastifyRequest, reply: FastifyReply) {
  const { totpCode } = request.body as any;
  const userId = (request as any).user.id;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.pendingTotpSecret) return reply.status(400).send({ error: '2FA setup not initiated' });

  const isValid = await claimTotp(user.id,user.pendingTotpSecret,totpCode,'pendingTotpSecret');
  if (!isValid) return reply.status(400).send({ error: 'Invalid TOTP code' });

  await prisma.user.update({
    where: { id: userId },
    data: { 
      twoFactorEnabled: true,
      totpSecret: user.pendingTotpSecret,
      pendingTotpSecret: null 
    }
  });

  return reply.send({ success: true });
}

export async function disable2FA(request: FastifyRequest, reply: FastifyReply) {
  const userId = (request as any).user.id;
  const { totpCode } = request.body as any;

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.totpSecret || !user.twoFactorEnabled) {
    return reply.status(400).send({ error: '2FA not enabled' });
  }

  const isValid = await claimTotp(user.id,user.totpSecret,totpCode);
  if (!isValid) return reply.status(400).send({ error: 'Invalid TOTP code' });

  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: false, totpSecret: null, pendingTotpSecret: null }
  });

  return reply.send({ success: true });
}

export async function guestLogin(request: FastifyRequest, reply: FastifyReply) {
  const guestId = `guest_${randomUUID()}`;
  const guestEmail = `${guestId}@guest.doccraft.app`;

  try {
    await prisma.user.create({ data: {
      id: guestId,
      email: guestEmail,
      passwordHash: '',
      fullName: 'Guest User',
      authProvider: 'guest',
      plan: 'guest',
      isGuest: true,
      emailVerified: true,
      userClass: 'guest',
    } });
  } catch (error: any) {
    request.log.warn({ code: error?.code, name: error?.name }, 'Guest session creation failed');
    return reply.status(503).send({ error: 'Guest sign-in is temporarily unavailable. Please try again.' });
  }

  // 'guest' is its own admin-managed quota tier (see admin-api's plans
  // table), distinct from 'free' — so an anonymous preview session doesn't
  // silently share a signed-up free user's daily quota.
  const expiresAt = Math.floor(Date.now() / 1000) + 24 * 60 * 60;
  const sessionToken = await signAccessToken(guestId, guestEmail, 'guest', 'guest', expiresAt);

  return reply.send({
    session_token: sessionToken,
    guest_user_id: guestId,
    expires_at: new Date(expiresAt * 1000).toISOString(),
  });
}
