import {it,expect,vi} from 'vitest';
vi.mock('../db.service.js',()=>({db:{}}));
import {buildContext} from '../context.service.js';
it('uses the actual turn after PostgreSQL JSONB reorders UUID keys',async()=>{
 const client={chatMessage:{findMany:vi.fn().mockResolvedValue([])}};
 const session={id:'s',status:'ACTIVE',documentTypeId:'invoice',slots:{_chat:{turns:{a:{startedAt:2,intent:{kind:'add'},localProposal:{residual:'CURRENT BANK CLAUSE'}},z:{startedAt:1,intent:{kind:'question'},localProposal:{residual:'STALE CLAUSE'}}}}}};
 const result=await buildContext(session,'CURRENT BANK CLAUSE',client);
 expect(result.system).toContain('CURRENT USER INTENT: {"kind":"add"}');
 expect(result.system).not.toContain('STALE CLAUSE');
});
it('explicit current turn ID determines extraction context independently of a legacy pointer',async()=>{
 const client={chatMessage:{findMany:vi.fn().mockResolvedValue([])}};
 const session={id:'s',status:'ACTIVE',documentTypeId:'invoice',slots:{_chat:{latestTurnId:'older',turns:{current:{startedAt:2,intent:{kind:'correct'},localProposal:{residual:'CURRENT EDIT'}},older:{startedAt:1,intent:{kind:'question'},localProposal:{residual:'STALE CLAUSE'}}}}}};
 const result=await buildContext(session,'CURRENT EDIT',client,undefined,'current');
 expect(result.system).toContain('CURRENT USER INTENT: {"kind":"correct"}');expect(result.system).not.toContain('STALE CLAUSE');
});
it('bounded context retrieves relevant older evidence while preserving confirmed structured facts',async()=>{
 const recent=Array.from({length:20},(_,i)=>({id:'recent'+i,role:i%2?'USER':'ASSISTANT',content:'recent text '+i+' '.repeat(1500)}));
 const older=[{id:'older',role:'USER',content:'The services must include production support.'}];
 const client={chatMessage:{findMany:vi.fn().mockResolvedValueOnce(recent).mockResolvedValueOnce(older)}};
 const session={id:'s',userId:'u',documentTypeId:'invoice',status:'ACTIVE',slots:{businessName:'Nexora'}};
 const result=await buildContext(session,'Include production support',client);
 expect(result.messages.some(m=>m.content.includes('production support'))).toBe(true);
 expect(result.messages.reduce((n,m)=>n+m.content.length,0)).toBeLessThanOrEqual(24000);
 expect(result.system).toContain('Nexora');expect(result.system).not.toContain('guest_user');
 expect(client.chatMessage.findMany.mock.calls.every(([query])=>query.where.sessionId==='s'&&query.where.flaggedPromptInjection===false)).toBe(true);
});

it('T37 excludes recent IDs before the older-evidence limit and preserves Unicode search',async()=>{
 const recent=Array.from({length:20},(_,i)=>({id:'r'+i,role:'USER',content:'Recent reply '+i,createdAt:new Date(2026,9,13,12,i)}));
 const client={chatMessage:{findMany:vi.fn().mockResolvedValueOnce([...recent].reverse()).mockResolvedValueOnce([{id:'older',role:'USER',content:'My company address is 40/20, Sagabo Mawatha',createdAt:new Date(2026,9,12)}])}};
 const result=await buildContext({id:'s',userId:'u',documentTypeId:'invoice',status:'ACTIVE',slots:{businessName:'Nexora'}},'Remember the address ලිපිනය',client);
 expect(client.chatMessage.findMany.mock.calls[1][0].where.id.notIn).toHaveLength(20);expect(result.evidence.older.content).toContain('40/20');expect(result.messages[0].content).toContain('40/20');
});
