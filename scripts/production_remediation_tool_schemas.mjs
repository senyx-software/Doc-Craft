/** Export actual current MCP declarations without provider/database mocks being called. */
import {writeFileSync,readFileSync} from 'node:fs';
import {createMcpServer} from '../services/chat/dist/services/mcp.service.js';
const saved={id:'owned-schema-session',userId:'owned-schema-user',documentTypeId:'invoice',slots:{},createdAt:new Date(),updatedAt:new Date(),status:'active'};
const repository={load:async()=>saved,editCanvas(){},undoDocument(){},proposeLanguage(){}};
const server=createMcpServer(saved.id,saved.userId,{turnId:'schema-export',token:'non-network-placeholder',message:'Update the business name.'},repository);
const handler=server._requestHandlers.get('tools/list');
const listed=await handler({method:'tools/list',params:{}},{});
const tools=listed.tools.map(t=>({type:'function',function:{name:t.name,description:t.description,parameters:t.inputSchema}}));
const baseline=JSON.parse(readFileSync('docs/hybrid-ai/evidence/live/tool-schemas.json'));
const matched=tools.length===baseline.length&&tools.every(t=>JSON.stringify(t.function.parameters)===JSON.stringify(baseline.find(b=>b.function.name===t.function.name)?.function.parameters));
writeFileSync('docs/production-remediation/evidence/ai/current-schema-comparison.json',JSON.stringify({count:tools.length,all_parameters_match_baseline:matched,scope:'Current MCP tools/list handler with owned in-memory session; no inference or database dispatch'},null,2)+'\n');
writeFileSync('docs/production-remediation/evidence/ai/current-tool-schemas.json',JSON.stringify(tools,null,2)+'\n');
console.log(JSON.stringify({count:tools.length,all_parameters_match_baseline:matched}));
await server.close();process.exit(matched?0:1);
