import {configureServiceFixture} from '../../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('chat');
import {it,expect,vi,afterEach} from 'vitest';
vi.mock('../../config/env.js',()=>({env:{QUOTA_SERVICE_URL:'http://isolated.test',INTERNAL_SERVICE_SECRET:'synthetic'}}));
import {checkChatQuota} from '../quotaClient.service.js';
afterEach(()=>vi.unstubAllGlobals());
it('quota reservation respects 200 and 403 results',async()=>{for(const status of [200,403]){vi.stubGlobal('fetch',vi.fn(async()=>Response.json({used:2,limit:5},{status})));expect((await checkChatQuota('u','free')).allowed).toBe(status===200);}});
it('quota outage stops provider work with a retryable service error',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('synthetic outage');}));await expect(checkChatQuota('u','free')).rejects.toMatchObject({code:'QUOTA_UNAVAILABLE',statusCode:503,retryable:true});});
it('unexpected status and unlimited plans are handled consistently',async()=>{vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:500})));await expect(checkChatQuota('u','free')).rejects.toMatchObject({code:'QUOTA_UNAVAILABLE',statusCode:503,retryable:true});vi.stubGlobal('fetch',vi.fn(async()=>Response.json({used:42,limit:-1})));expect((await checkChatQuota('u','pro')).limit).toBe(-1);});
