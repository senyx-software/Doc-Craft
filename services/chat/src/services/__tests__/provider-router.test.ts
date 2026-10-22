import {beforeEach,it,expect,vi} from 'vitest';
const state=vi.hoisted(()=>({policy:{account_enabled:true,ai_enabled:true,ai_provider:'groq',max_model:'claude-haiku-4-5'},groq:vi.fn(),claude:vi.fn()}));
vi.mock('../../../../../shared/entitlements.mjs',async original=>({...await original<any>(),getEntitlements:vi.fn(async()=>state.policy)}));
vi.mock('../groq.service.js',()=>({runGroqAgenticLoop:state.groq}));
vi.mock('../claude.service.js',()=>({runAgenticLoop:state.claude}));
vi.mock('../hybrid-ai.service.js',()=>({getHybridRuntime:async()=>({enabled:false,version:0}),runHybridAgenticLoop:vi.fn()}));
import {runConfiguredAgenticLoop} from '../provider-router.service.js';
beforeEach(()=>{
 vi.clearAllMocks();state.policy={account_enabled:true,ai_enabled:true,ai_provider:'groq',max_model:'claude-haiku-4-5'};
 state.groq.mockImplementation(async function*(){yield {type:'done',model:'groq-fixture'};});
 state.claude.mockImplementation(async function*(){yield {type:'done',model:'claude-fixture'};});
});
async function run(){const events=[];for await(const event of runConfiguredAgenticLoop([{role:'user',content:'a'.repeat(600)}],'system',{} as any,'session',undefined,'owner'))events.push(event);return events;}
it('changes from Groq to Claude with the current admin policy and enforces plan model ceiling',async()=>{
 expect((await run()).at(-1)).toMatchObject({model:'groq-fixture'});
 state.policy.ai_provider='claude';await run();
 expect(state.claude.mock.calls[0][1]).toBe('claude-haiku-4-5');expect(state.groq).toHaveBeenCalledTimes(1);
 state.policy.max_model='claude-sonnet-4-5';await run();expect(state.claude.mock.calls[1][1]).toBe('claude-sonnet-4-5');
});
it('does not dispatch requests for suspended accounts or a disabled AI feature',async()=>{
 state.policy.account_enabled=false;await expect(run()).rejects.toMatchObject({statusCode:403});
 expect(state.groq).not.toHaveBeenCalled();expect(state.claude).not.toHaveBeenCalled();
});
