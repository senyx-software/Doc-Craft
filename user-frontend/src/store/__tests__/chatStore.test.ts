/* eslint-disable @typescript-eslint/no-explicit-any -- synthetic browser and store fixtures */
import {beforeEach,it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({asset:vi.fn(),removeAssets:vi.fn(),confirm:vi.fn(),send:vi.fn(),start:vi.fn(),summary:vi.fn(),edit:vi.fn(),token:'test-token',canvas:vi.fn(),hydrate:vi.fn(),generate:vi.fn()}));
vi.mock('../../api/client',()=>({getToken:()=>mocks.token}));
vi.mock('../../api/ai',()=>({saveDocumentAsset:mocks.asset,removeDocumentAssets:mocks.removeAssets,confirmDocument:mocks.confirm,sendChatMessage:mocks.send,startSession:mocks.start,getSummary:mocks.summary,updateSemanticFields:mocks.edit,listUserSessions:async()=>[],deleteUserSession:async()=>true}));
vi.mock('../documentStore',()=>({useDocumentStore:{getState:()=>({selectedTemplate:'t',hydrateConversation:mocks.hydrate,generateDocument:mocks.generate,refreshCanvasElements:mocks.canvas,selectTemplate:vi.fn(),setAccentColor:vi.fn()})}}));
import {useChatStore} from '../chatStore';
import {snapshot} from '../../../../shared/conversation-state.mjs';
import {ChatStreamError} from '../../../../shared/chat-stream.mjs';
function state(id='s',slots:any={businessName:'Nexora'}){return snapshot({id,userId:'u',documentTypeId:'invoice',status:'ACTIVE',slots});}
beforeEach(()=>{vi.clearAllMocks();(globalThis as any).window={location:{href:'http://localhost/builder'},history:{replaceState:vi.fn()}};useChatStore.getState().resetChat();useChatStore.setState({sessionId:'s',documentType:'invoice',collectedSlots:{businessName:'Nexora'},revision:0});});
it('assets are reconciled with the preview and restored after refresh without contacting AI',async()=>{
 const asset={id:'asset_one',role:'logo' as const,name:'logo.png',width:1,height:1,src:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jCzQAAAAASUVORK5CYII='};
 const saved={...state(),assets:[asset],revision:1};mocks.asset.mockResolvedValue({state:saved});await useChatStore.getState().saveDocumentAsset(asset);
 expect(mocks.asset).toHaveBeenCalledWith('s',asset,0);expect(useChatStore.getState().assets).toEqual([asset]);expect(mocks.canvas).toHaveBeenCalledWith({documentType:'invoice',...saved.slots});expect(mocks.send).not.toHaveBeenCalled();
 mocks.summary.mockResolvedValue({state:saved,messages:[]});await useChatStore.getState().loadSessionFromDb('s');expect(useChatStore.getState().assets).toEqual([asset]);expect(mocks.hydrate).toHaveBeenCalledWith(saved);
});
it('failed uploads do not invent artwork or a saved acknowledgement',async()=>{
 mocks.asset.mockRejectedValueOnce(new Error('Storage unavailable'));await expect(useChatStore.getState().saveDocumentAsset({id:'asset',role:'logo',name:'logo.png',width:1,height:1,src:'data:image/png;base64,AAAA'})).rejects.toThrow('Storage unavailable');expect(useChatStore.getState().assets).toEqual([]);expect(useChatStore.getState().messages).toEqual([]);
});
it('a delayed asset acknowledgement cannot replace another conversation',async()=>{
 let resolve!:any;mocks.asset.mockImplementation(()=>new Promise(r=>resolve=r));const upload=useChatStore.getState().saveDocumentAsset({id:'asset',role:'logo',name:'logo.png',width:1,height:1,src:'data:image/png;base64,AAAA'});
 useChatStore.getState().resetChat();useChatStore.setState({sessionId:'other',documentType:'receipt'});resolve({state:{...state(),assets:[],revision:2}});await upload;expect(useChatStore.getState().sessionId).toBe('other');expect(mocks.canvas).not.toHaveBeenCalled();
});
it('F01 failure preserves saved name, transcript and turn ID without synthetic question',async()=>{mocks.send.mockRejectedValue(new ChatStreamError());await useChatStore.getState().sendMessage('Please help');const s=useChatStore.getState();expect(s.collectedSlots.businessName).toBe('Nexora');expect(s.messages).toHaveLength(1);expect(s.messages[0].role).toBe('user');expect(s.error).not.toContain('business name');const id=s.pendingTurn!.id;await s.retryMessage();expect(mocks.send.mock.calls[1][0].turn_id).toBe(id);expect(useChatStore.getState().messages).toHaveLength(1);});
it('company reply blocked by throttling retries once under its original turn identity',async()=>{
 useChatStore.setState({collectedSlots:{},currentField:'businessName'});
 mocks.send.mockRejectedValueOnce(new ChatStreamError('failure',429,undefined,'CHAT_RATE_LIMITED')).mockResolvedValueOnce({state:state('s',{businessName:'nexora'}),ai_message:'Saved business or company name. What is the client name?'});
 await useChatStore.getState().sendMessage('nexora');const id=useChatStore.getState().pendingTurn!.id;
 expect(useChatStore.getState().error).toContain('Too many requests');expect(useChatStore.getState().collectedSlots).toEqual({});
 await useChatStore.getState().retryMessage();expect(mocks.send.mock.calls[1][0].turn_id).toBe(id);expect(useChatStore.getState().collectedSlots.businessName).toBe('nexora');expect(useChatStore.getState().currentField).toBe('clientName');expect(useChatStore.getState().pendingTurn).toBeNull();expect(useChatStore.getState().messages).toHaveLength(2);
});
it('successful retry consumes authoritative state without guessing the answered field',async()=>{mocks.send.mockRejectedValueOnce(new ChatStreamError()).mockResolvedValueOnce({state:state('s',{businessName:'Nexora',clientName:'Acme'}),ai_message:'What reference number should we use?'});await useChatStore.getState().sendMessage('Client name is Acme');await useChatStore.getState().retryMessage();const s=useChatStore.getState();expect(s.pendingTurn).toBe(null);expect(s.currentField).toBe('invoiceNumber');expect(s.messages).toHaveLength(2);expect(s.collectedSlots.senderAddress).toBeUndefined();});
it('late response from previous session cannot replace active state',async()=>{let resolve!:any;mocks.send.mockImplementation(()=>new Promise(r=>resolve=r));const sending=useChatStore.getState().sendMessage('Nexora');useChatStore.getState().resetChat();useChatStore.setState({sessionId:'other',documentType:'receipt',collectedSlots:{businessName:'Other'}});resolve({state:state(),ai_message:'old reply'});await sending;expect(useChatStore.getState().sessionId).toBe('other');expect(useChatStore.getState().collectedSlots.businessName).toBe('Other');expect(useChatStore.getState().messages).toHaveLength(0);});
it('restore replaces pending question, correction and readiness completely',async()=>{useChatStore.setState({currentField:'dueDate',readyToGenerate:true,pendingRequired:['dueDate'],summary:'old',pendingTurn:{id:'t',message:'old'}});mocks.summary.mockResolvedValue({state:state('restored'),messages:[{role:'USER',content:'Nexora'}],summary:'new'});await useChatStore.getState().loadSessionFromDb('restored');const s=useChatStore.getState();expect(s.currentField).toBe('clientName');expect(s.readyToGenerate).toBe(false);expect(s.pendingTurn).toBeNull();expect(s.summary).toBe('new');expect(s.pendingCorrection).toBeNull();expect((globalThis as any).window.history.replaceState).toHaveBeenCalled();});
it('real session creation failure never generates a fake backend ID',async()=>{mocks.start.mockRejectedValue(new Error('unavailable'));await useChatStore.getState().startSession('invoice');expect(useChatStore.getState().sessionId).toBeNull();expect(useChatStore.getState().error).toBe('unavailable');});
it('semantic edit adopts committed state and refreshes canvas',async()=>{mocks.edit.mockResolvedValue({state:state('s',{businessName:'Nexora Technologies'})});await useChatStore.getState().updateSemanticFields({businessName:'Nexora Technologies'});expect(mocks.edit).toHaveBeenCalledWith('s',{businessName:'Nexora Technologies'},0);expect(useChatStore.getState().collectedSlots.businessName).toBe('Nexora Technologies');expect(mocks.canvas).toHaveBeenCalled();});
it('identity reset invalidates all pending work and clears history',async()=>{useChatStore.setState({messages:[{role:'assistant',content:'private'}],userSessions:[{id:'s'}]});useChatStore.getState().resetChat();expect(useChatStore.getState().sessionId).toBeNull();expect(useChatStore.getState().userSessions).toHaveLength(0);expect(useChatStore.getState().collectedSlots).toEqual({});});

it('browser refresh restores a recoverable turn with its original ID',async()=>{const restored={...state('s'),pendingTurn:{id:'original-turn',message:'Please help'},stage:'recovering'};mocks.summary.mockResolvedValue({state:restored,messages:[{role:'USER',content:'Please help'}]});await useChatStore.getState().loadSessionFromDb('s');expect(useChatStore.getState().pendingTurn?.id).toBe('original-turn');expect(useChatStore.getState().error).toContain('retry');});

it('T20 backend draft action opens compatible draft and hydrates preview from saved state',async()=>{
 const draft={...state('new-draft',{businessName:'Nexora',senderAddress:'40/20, Road'}),documentType:'quotation'};
 mocks.send.mockResolvedValue({state:state(),ai_message:'Created quotation draft.',actions:[{kind:'open_session',id:'operation',sessionId:'new-draft',sourceSessionId:'s',documentType:'quotation'}]});
 mocks.summary.mockResolvedValue({state:draft,messages:[],summary:'Quotation summary'});
 await useChatStore.getState().sendMessage('Change this to a quotation');expect(useChatStore.getState().sessionId).toBe('new-draft');expect(useChatStore.getState().collectedSlots.senderAddress).toBe('40/20, Road');expect(mocks.hydrate).toHaveBeenCalledWith(draft);expect(useChatStore.getState().messages[0].content).toBe('Created quotation draft.');
});
it('T33 finalized edits consume revision state while preserving correct provider text',async()=>{
 useChatStore.setState({readOnly:true,lifecycle:'COMPLETED'});const draft=state('revision',{businessName:'Updated'});
 mocks.send.mockResolvedValue({state:draft,ai_message:'Saved business name.',actions:[{kind:'open_session',id:'operation',sessionId:'revision',sourceSessionId:'s',documentType:'invoice'}]});
 await useChatStore.getState().sendMessage('Change business name to Updated');expect(useChatStore.getState().sessionId).toBe('revision');expect(useChatStore.getState().messages.at(-1)?.content).toBe('Saved business name.');expect(mocks.hydrate).toHaveBeenCalledWith(draft);
});
it('T09 generation action uses committed revision and stable operation identity',async()=>{
 mocks.send.mockResolvedValue({state:state(),ai_message:'Requesting generation.',actions:[{kind:'generate',id:'operation',sessionId:'s',documentType:'invoice',revision:12}]});
 await useChatStore.getState().sendMessage('Generate the invoice');expect(mocks.generate).toHaveBeenCalledWith('s','invoice',state().slots,'operation',12);
});
it('T20/T36 failed draft hydration retains source and retries the same transition',async()=>{
 mocks.send.mockResolvedValue({state:state(),ai_message:'Created draft.',actions:[{kind:'open_session',id:'operation',sessionId:'new',sourceSessionId:'s',documentType:'quotation'}]});mocks.summary.mockRejectedValueOnce(new Error('temporarily unavailable')).mockResolvedValueOnce({state:{...state('new'),documentType:'quotation'},messages:[]});
 await useChatStore.getState().sendMessage('Change this to quotation');expect(useChatStore.getState().sessionId).toBe('s');const id=useChatStore.getState().pendingTurn!.id;
 await useChatStore.getState().retryMessage();expect(mocks.send.mock.calls[1][0].turn_id).toBe(id);expect(useChatStore.getState().sessionId).toBe('new');
});
it('review confirmation uses the reviewed fingerprint and revision, then corrections require another review',async()=>{
 const reviewed={...state(),readyToGenerate:true,canGenerate:false,finalization:{status:'unconfirmed',fingerprint:'reviewed'}};
 mocks.summary.mockResolvedValue({state:reviewed,summary:'Reviewed company details'});await useChatStore.getState().fetchSummary();
 mocks.confirm.mockResolvedValue({state:{...reviewed,canGenerate:true,finalization:{status:'confirmed',fingerprint:'reviewed'}}});await useChatStore.getState().confirmDocument();expect(mocks.confirm).toHaveBeenCalledWith('s','reviewed',reviewed.revision);expect(useChatStore.getState().canGenerate).toBe(true);
 mocks.edit.mockResolvedValue({state:{...state('s',{businessName:'OpenAI'}),canGenerate:false,finalization:{status:'unconfirmed',fingerprint:'changed'}}});await useChatStore.getState().updateSemanticFields({businessName:'OpenAI'});expect(useChatStore.getState().canGenerate).toBe(false);expect(useChatStore.getState().summary).toBeNull();
});
it('a delayed SSE completion cannot overwrite a newer correction or refresh stale canvas data',async()=>{
 let resolve!:any;mocks.send.mockImplementation(()=>new Promise(r=>resolve=r));
 const sending=useChatStore.getState().sendMessage('Change client phone to 0712345678');
 const newer=state('s',{senderPhone:'0382298760',clientPhone:'0741234567',_chat:{revision:8}});useChatStore.getState().reconcileSnapshot(newer);
 resolve({state:state('s',{clientPhone:'0712345678',_chat:{revision:7}}),ai_message:'Earlier update saved.'});await sending;
 expect(useChatStore.getState().collectedSlots.clientPhone).toBe('0741234567');expect(useChatStore.getState().collectedSlots.senderPhone).toBe('0382298760');expect(useChatStore.getState().revision).toBe(8);expect(mocks.canvas).not.toHaveBeenCalled();expect(useChatStore.getState().isLoading).toBe(false);
});
it('chat edits and refresh hydrate notes, banking details and distinct contact fields from the same snapshot',async()=>{
 const saved=state('s',{senderPhone:'0382298760',clientPhone:'0741234567',notesAndTerms:'Valid for 30 days.',accountDetails:'BOC, Panadura, Account: 007903232',_chat:{revision:5}});
 mocks.send.mockResolvedValue({state:saved,ai_message:'Saved notes and bank details.'});await useChatStore.getState().sendMessage('add note valid 30 days add my bank details boc panadura 007903232');expect(mocks.canvas).toHaveBeenCalledWith({documentType:'invoice',...saved.slots});
 mocks.summary.mockResolvedValue({state:saved,messages:[]});await useChatStore.getState().loadSessionFromDb('s');expect(mocks.hydrate).toHaveBeenCalledWith(saved);expect(useChatStore.getState().collectedSlots).toEqual(saved.slots);
});
it('a stale canvas edit response cannot overwrite a newer authoritative revision',async()=>{
 let resolve!:any;mocks.edit.mockImplementation(()=>new Promise(r=>resolve=r));const editing=useChatStore.getState().updateSemanticFields({clientPhone:'0712345678'});
 const newer=state('s',{senderPhone:'0382298760',clientPhone:'0741234567',_chat:{revision:8}});useChatStore.getState().reconcileSnapshot(newer);
 resolve({state:state('s',{clientPhone:'0712345678',_chat:{revision:7}})});await editing;expect(useChatStore.getState().collectedSlots).toEqual(newer.slots);expect(mocks.canvas).not.toHaveBeenCalled();
});
it('late approval cannot confirm or restore details changed during its request',async()=>{
 const reviewed={...state(),readyToGenerate:true,canGenerate:false,finalization:{status:'unconfirmed',fingerprint:'old'}};useChatStore.getState().reconcileSnapshot(reviewed);
 let resolve!:any;mocks.confirm.mockImplementation(()=>new Promise(r=>resolve=r));const confirming=useChatStore.getState().confirmDocument();
 const edited=state('s',{businessName:'OpenAI',_chat:{revision:9}});useChatStore.getState().reconcileSnapshot(edited);
 resolve({state:{...reviewed,revision:8,canGenerate:true,finalization:{status:'confirmed',fingerprint:'old'}}});await confirming;expect(useChatStore.getState().collectedSlots.businessName).toBe('OpenAI');expect(useChatStore.getState().canGenerate).toBe(false);expect(useChatStore.getState().isLoading).toBe(false);
});
