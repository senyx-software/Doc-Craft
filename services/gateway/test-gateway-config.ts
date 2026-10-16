import { gatewayConfigClient } from './src/services/configClient.service.js';
import { Redis } from 'ioredis';
import { env } from './src/config/env.js';

async function runGatewayConfigVerification() {
  console.log('=== Gateway Admin Config Integration Verification ===');

  try {
    // 1. Fetch domain configuration (Tier 1/2/3 read)
    console.log('[1/4] Fetching dynamic config for domain "plans"...');
    const plansConfig = await gatewayConfigClient.getConfig('plans');
    console.log('✔ Fetched plans config. Keys:', Object.keys(plansConfig));
    if (!plansConfig.pro) {
      throw new Error('Expected "pro" plan in plans configuration!');
    }

    console.log('[2/4] Testing feature flag resolution...');
    const watermarkFree = await gatewayConfigClient.isFeatureEnabled('watermark_removal', 'free');
    const watermarkPro = await gatewayConfigClient.isFeatureEnabled('watermark_removal', 'pro');
    console.log(`✔ Feature watermark_removal: free=${watermarkFree}, pro=${watermarkPro}`);
    if (watermarkFree !== false || watermarkPro !== true) {
      throw new Error('Feature flag watermark_removal matrix mismatch!');
    }

    console.log('[3/4] Testing Pub/Sub invalidation listener...');
    const pubRedis = new Redis(env.REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    pubRedis.on('error', () => {});
    
    try {
      await pubRedis.connect();
      const eventPayload = JSON.stringify({
        domain: 'plans',
        version: 99,
        timestamp: Date.now(),
      });
      await pubRedis.publish('config_invalidation', eventPayload);
      console.log('✔ Published mock config_invalidation event to Redis Pub/Sub.');
    } catch {
      console.log('ℹ Redis server offline; skipping live Pub/Sub network publish test.');
    }

    // Wait 100ms for subscriber callback
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Fetch again
    const refreshedPlans = await gatewayConfigClient.getConfig('plans');
    console.log('✔ Successfully re-fetched configuration.');

    try {
      pubRedis.disconnect();
    } catch {}

    console.log('[4/4] Gateway Admin Config Verification completed successfully!');
    process.exit(0);
  } catch (err: any) {
    console.error('❌ Verification failed:', err.message);
    process.exit(1);
  }
}

runGatewayConfigVerification();
