import {configureServiceFixture} from '../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('quota');
/**
 * test.setup.ts — sets env vars before any module is imported so config/env.ts
 * does not throw on missing required variables.
 */

process.env['DATABASE_URL']            = 'postgresql://test:test@localhost:5432/test';
process.env['DIRECT_URL']              = 'postgresql://test:test@localhost:5432/test';
process.env['REDIS_URL']               = 'redis://localhost:6379';
process.env['JWT_SECRET']              = 'test-jwt-secret-32-chars-minimum!!';
process.env['INTERNAL_SERVICE_SECRET'] = 'test-internal-secret';
process.env['NODE_ENV']                = 'test';
process.env['PORT']                    = '3015';
