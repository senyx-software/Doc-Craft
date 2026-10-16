import {it,expect,vi,beforeEach} from 'vitest';
const mocks=vi.hoisted(()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
 return {chat:{sessionId:'s',documentType:'invoice',collectedSlots:{businessName:'Nexora'},collectedData:null,revision:2,readOnly:false,canGenerate:true,fieldStates:{},reconcileSnapshot:vi.fn()},template:vi.fn(),accent:vi.fn(),generate:vi.fn(),canvasWrite:vi.fn(async()=>({state:{sessionId:'s',revision:2,layoutRevision:1}}))};
});
vi.mock('../chatStore',()=>({useChatStore:{getState:()=>mocks.chat}}));
vi.mock('../../api/ai',()=>({updateSessionTemplate:mocks.template,updateSessionAccentColor:mocks.accent}));
vi.mock('../../api/documents',()=>({generateDocument:mocks.generate,getDocumentStatus:vi.fn(),getTemplates:vi.fn(),getAvailableTemplateIds:vi.fn(async()=>({templates:[]}))}));
vi.mock('../../api/client',()=>({apiRequest:mocks.canvasWrite,getToken:()=> 'synthetic'}));
import {useDocumentStore,flushCanvasLayout} from '../documentStore';
beforeEach(()=>{vi.clearAllMocks();useDocumentStore.getState().resetDocument();mocks.chat.sessionId='s';vi.stubGlobal('window',{});});
it('moving an existing canvas element saves without first adding any element',async()=>{
 useDocumentStore.getState().hydrateConversation({sessionId:'s',templateId:'tmpl_invoice_2023_01',documentType:'invoice',slots:{businessName:'Nexora'}});
 const element=useDocumentStore.getState().canvasElements![0];
 useDocumentStore.getState().updateElement(element.id,{x:71});
 await flushCanvasLayout();
 expect(mocks.canvasWrite).toHaveBeenCalledOnce();
 expect(mocks.canvasWrite.mock.calls[0]).toEqual(['/chat/api/chat/session/s/canvas',expect.objectContaining({method:'PUT',body:expect.objectContaining({expectedLayoutRevision:0,layout:expect.objectContaining({elementOverrides:expect.objectContaining({[element.id]:{x:71}})})})})]);
});
it('T15/T42 hydration resets presentation and never performs server writes',()=>{
 useDocumentStore.setState({documentId:'old',accentColor:'#f00',customElements:[],elementOverrides:{header_name:{text:'stale'}}});
 useDocumentStore.getState().hydrateConversation({templateId:'tmpl_invoice_2023_01',documentType:'invoice',slots:{businessName:'New company'}});
 const state=useDocumentStore.getState();expect(state.documentId).toBeNull();expect(state.accentColor).toBe('');expect(state.elementOverrides).toEqual({});expect(state.previewHtml).toContain('New company');expect(mocks.template).not.toHaveBeenCalled();expect(mocks.accent).not.toHaveBeenCalled();
});
it('T09/T15 a late generation receipt cannot replace another document',async()=>{
 let finish!:(value:unknown)=>void;mocks.generate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const data={senderAddress:'10 Sender Road',clientAddress:'20 Client Road',senderEmail:'hello@nexora.test',senderPhone:'+94771234567',businessName:'Nexora',clientName:'Acme',invoiceNumber:'INV-1',issueDate:'2026-10-13',dueDate:'2026-11-13',currency:'LKR',lineItems:[{description:'Design',quantity:1,unitPrice:100}]};
 const pending=useDocumentStore.getState().generateDocument('s','invoice',data,'00000000-0000-4000-a000-000000000001');
 mocks.chat.sessionId='other';useDocumentStore.getState().hydrateConversation({templateId:'tmpl_receipt_mobile_app_ui',documentType:'receipt',slots:{businessName:'Other'}});
 finish({document_id:'old-receipt',status:'queued'});await pending;expect(useDocumentStore.getState().documentId).toBeNull();expect(useDocumentStore.getState().previewHtml).toContain('Other');
});

it('T21/T42 metadata acknowledgements reconcile the authoritative revision',async()=>{
 mocks.template.mockResolvedValue({state:{sessionId:'s',revision:3,templateId:'tmpl_invoice_2023_01'}});
 await useDocumentStore.getState().selectTemplate('tmpl_invoice_2023_01');
 await vi.waitFor(()=>expect(mocks.chat.reconcileSnapshot).toHaveBeenCalledWith(expect.objectContaining({revision:3})));
});
it('T15/T42 metadata failures from a switched document cannot contaminate the active document',async()=>{
 let reject!:(reason:unknown)=>void;mocks.template.mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
 await useDocumentStore.getState().selectTemplate('tmpl_invoice_2023_01');await vi.waitFor(()=>expect(mocks.template).toHaveBeenCalled());
 mocks.chat.sessionId='other';useDocumentStore.getState().hydrateConversation({documentType:'receipt',slots:{businessName:'Other'}});reject(new Error('synthetic failure'));
 await new Promise(resolve=>setTimeout(resolve,0));expect(useDocumentStore.getState().error).toBeNull();expect(useDocumentStore.getState().previewHtml).toContain('Other');
});
it('T21 successive metadata choices are serialized and superseded queued choices are coalesced',async()=>{
 mocks.template.mockResolvedValue({state:{sessionId:'s',revision:4}});
 await Promise.all([useDocumentStore.getState().selectTemplate('tmpl_invoice_2023_01'),useDocumentStore.getState().selectTemplate('tmpl_invoice_2023_02')]);
 await vi.waitFor(()=>expect(mocks.template).toHaveBeenCalledWith('s','tmpl_invoice_2023_02'));
 expect(useDocumentStore.getState().selectedTemplate).toBe('tmpl_invoice_2023_02');
});
