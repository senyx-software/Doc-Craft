import {configureServiceFixture} from '../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('payment');
/**
 * test.setup.ts — sets environment variables before any module is imported.
 * This prevents env.ts from throwing "Missing required environment variable" errors.
 */

process.env['DATABASE_URL']             = 'postgresql://test:test@localhost:5432/test';
process.env['DIRECT_URL']               = 'postgresql://test:test@localhost:5432/test';
process.env['REDIS_URL']                = 'redis://localhost:6379';
process.env['JWT_SECRET']               = 'test-jwt-secret-32-chars-minimum!!';
process.env['INTERNAL_SERVICE_SECRET']  = 'test-internal-secret';
process.env['PADDLE_API_KEY']           = 'pdl_test_key';
process.env['PADDLE_WEBHOOK_SECRET']    = 'pdl_test_webhook_secret';
process.env['PADDLE_SANDBOX']           = 'true';
process.env['PADDLE_PRO_MONTHLY_PRICE_ID'] = 'pri_monthly_test';
process.env['PADDLE_PRO_YEARLY_PRICE_ID']  = 'pri_yearly_test';
process.env['PAYHERE_MERCHANT_ID']      = 'TEST_MERCHANT';
process.env['PAYHERE_MERCHANT_SECRET']  = 'TEST_SECRET_XYZ';
process.env['PAYHERE_SANDBOX']          = 'true';
process.env['PAYMENT_SERVICE_PUBLIC_URL'] = 'http://localhost:3014';
process.env['QUOTA_SERVICE_URL']        = 'http://localhost:3015';
process.env['NOTIFICATION_SERVICE_URL'] = 'http://localhost:3012';
process.env['FRONTEND_URL']             = 'http://localhost:5173';
process.env['NODE_ENV']                 = 'test';
process.env['PORT']                     = '3014';
