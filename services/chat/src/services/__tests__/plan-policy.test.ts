import {configureServiceFixture} from '../../../../../shared/tests/service-fixtures.mjs';
configureServiceFixture('chat');
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('../../config/env.js', () => ({ env: { ADMIN_API_SERVICE_URL: 'http://127.0.0.1:9', INTERNAL_SERVICE_SECRET: 'fixture' } }));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.resetModules(); });

it('fallback models remain inside both deployment and administrator allowlists', async () => {
  const { resolveGroqModels } = await import('../planConfigClient.service.js');
  expect(resolveGroqModels(['a', 'b'], ['b', 'external'])).toEqual(['b']);
  expect(resolveGroqModels(['a'], [])).toEqual([]);
  expect(resolveGroqModels(['a'])).toEqual(['a']);
});

it('a denied model policy cannot reach a provider through fallback', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ data: { free: { groq_models: [] } } })));
  const { getGroqModelsForPlan } = await import('../planConfigClient.service.js');
  await expect(getGroqModelsForPlan('free', ['a'])).rejects.toMatchObject({ statusCode: 403, retryable: false });
});

it('policy outages fail closed and expiry reloads administrative changes', async () => {
  const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: { free: { groq_models: ['a'] } } })).mockResolvedValueOnce(new Response('', { status: 503 }));
  vi.stubGlobal('fetch', fetch);
  const { getGroqModelsForPlan } = await import('../planConfigClient.service.js');
  expect(await getGroqModelsForPlan('free', ['a', 'b'])).toEqual(['a']);
  now.mockReturnValue(6001);
  await expect(getGroqModelsForPlan('free', ['a', 'b'])).rejects.toMatchObject({ statusCode: 503, retryable: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});
