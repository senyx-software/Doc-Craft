import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({quota:vi.fn(),entitlements:vi.fn()}));
vi.mock('../../api/billing',()=>({getQuota:mocks.quota}));
vi.mock('../../api/client',()=>({get:mocks.entitlements}));
vi.mock('../../api/payment',()=>({redirectToCheckout:vi.fn()}));
import {useQuotaStore} from '../quotaStore';

beforeEach(()=>{vi.resetAllMocks();vi.stubGlobal('localStorage',{getItem:()=>null});useQuotaStore.setState({quota:null,entitlements:null});});
afterEach(()=>vi.unstubAllGlobals());

it('retains authoritative logo permissions when quota usage is unavailable',async()=>{
  const entitlements={plan:'free',account_enabled:true,custom_logo:false};
  mocks.quota.mockRejectedValue(new Error('Quota unavailable'));
  mocks.entitlements.mockResolvedValue(entitlements);
  await useQuotaStore.getState().fetchQuota();
  expect(useQuotaStore.getState()).toMatchObject({quota:null,entitlements});
});

it('clears unavailable feature permissions while preserving a successful usage response',async()=>{
  const quota={daily_limit:3,remaining:2};
  mocks.quota.mockResolvedValue(quota);
  mocks.entitlements.mockRejectedValue(new Error('Policy unavailable'));
  await useQuotaStore.getState().fetchQuota();
  expect(useQuotaStore.getState()).toMatchObject({quota,entitlements:null});
});
