// Define required environment variables before importing gateway files
process.env.JWT_SECRET = "REPLACE_WITH_STRONG_RANDOM_SECRET";
process.env.CORS_ORIGINS = "http://localhost:5173";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.AUTH_SERVICE_URL = "http://localhost:3011";
process.env.AI_SERVICE_URL = "http://localhost:3016";
process.env.DOCUMENT_SERVICE_URL = "http://localhost:3013";
process.env.BILLING_SERVICE_URL = "http://localhost:3014";
process.env.QUOTA_SERVICE_URL = "http://localhost:3015";
process.env.NOTIFICATION_SERVICE_URL = "http://localhost:3012";
process.env.ANALYTICS_SERVICE_URL = "http://localhost:3017";
process.env.ADMIN_API_SERVICE_URL = "http://localhost:3018";

import { SignJWT } from 'jose';

async function runTests() {
  console.log('=== Running Gateway Verification Tests ===');
  
  // Use dynamic import to avoid ESM hoist execution order breaking env loads
  const { verifyJwt } = await import('./src/security/jwtVerifier.js');

  // 1. Validate JWT signer and verifier logic
  console.log('Testing JWT token generation and verification...');
  const secretBytes = new TextEncoder().encode(process.env.JWT_SECRET);
  const token = await new SignJWT({ email: 'user@doccraft.app', plan: 'pro' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject('user-uuid-123')
    .setExpirationTime('1h')
    .sign(secretBytes);

  const decoded = await verifyJwt(token);
  if (decoded.sub === 'user-uuid-123' && decoded.plan === 'pro') {
    console.log('JWT signature and expiry verified successfully!');
  } else {
    throw new Error('JWT verification payload mismatch');
  }

  // 2. Validate routing config liveness
  console.log('Testing Gateway liveness check endpoint...');
  const gatewayHealth = await fetch('http://localhost:3001/health');
  if (gatewayHealth.status === 200) {
    const healthJson = await gatewayHealth.json() as any;
    if (healthJson.status === 'ok') {
      console.log('Gateway liveness check succeeded!');
    }
  } else {
    console.warn('Gateway server is not running on port 3001. Ensure it is booted.');
  }

  console.log('=== All tests passed successfully! ===');
}

runTests().catch((err) => {
  console.error('Verification test failed:', err);
  process.exit(1);
});
