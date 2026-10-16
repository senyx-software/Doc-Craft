import {it,expect,vi} from 'vitest';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
const mock=vi.hoisted(()=>({load:vi.fn(async(user:string,id:string)=>{if(user!=='u'||id!=='s')throw new Error('denied');return {id:'s',userId:'u',documentTypeId:'invoice',status:'ACTIVE',slots:{businessName:'Nexora'}};}),apply:vi.fn()}));
vi.mock('../conversation.repository.js',()=>({conversations:mock}));
import {createMcpServer} from '../mcp.service.js';
async function connected(turn?:{turnId:string;token:string;message:string}){const [a,b]=InMemoryTransport.createLinkedPair(),server=createMcpServer('s','u',turn),client=new Client({name:'isolated-test',version:'1'},{capabilities:{}});await Promise.all([server.connect(b),client.connect(a)]);return {server,client};}
it('actual MCP transport scopes reads and denies cross-session/uncheckpointed writes',async()=>{const {server,client}=await connected();try {const state=await client.callTool({name:'get_session_state',arguments:{}});expect(JSON.stringify(state)).toContain('Nexora');const cross=await client.callTool({name:'get_session_state',arguments:{sessionId:'other'}});expect(cross.isError).toBe(true);const edit=await client.callTool({name:'update_slots',arguments:{slots:{businessName:'Other'}}});expect(edit.isError).toBe(true);expect(mock.apply).not.toHaveBeenCalled();}finally{await Promise.all([client.close(),server.close()]);}});
it('tool schemas contain canonical line-item quantities and currency fields',async()=>{const {server,client}=await connected();try{const listed=await client.listTools();const update=listed.tools.find(t=>t.name==='update_slots')!;expect(JSON.stringify(update.inputSchema)).toContain('unitPrice');expect(JSON.stringify(update.inputSchema)).toContain('currency');}finally{await Promise.all([client.close(),server.close()]);}});

it('model tools cannot forge pending-answer validation bypasses',async()=>{const {server,client}=await connected({turnId:'turn',token:'lease',message:'hello'});try {for(const argumentsValue of [{pendingAnswer:{quantity:100}},{itemOperations:[{operation:'add',fromPending:true,item:{description:'Invented',quantity:1,unitPrice:0}}]}]){const result=await client.callTool({name:'update_slots',arguments:argumentsValue});expect(result.isError).toBe(true);}expect(mock.apply).not.toHaveBeenCalled();}finally{await Promise.all([client.close(),server.close()]);}});

it('T43 model tool schema rejects aliased arrays with forged nested properties',async()=>{
 const {server,client}=await connected({turnId:'turn',token:'lease',message:'Add Design quantity 1 price 100'});
 try {const result=await client.callTool({name:'update_slots',arguments:{slots:{items:[{description:'Design',quantity:1,unitPrice:100,fromPending:true}]}}});expect(result.isError).toBe(true);} finally{await Promise.all([client.close(),server.close()]);}
});
