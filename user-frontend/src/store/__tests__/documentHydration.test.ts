import {it,expect,vi,beforeEach} from 'vitest';
import type {ConversationSnapshot} from '../../types';
const mocks=vi.hoisted(()=>{
 const values=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(key:string)=>values.get(key)||null,setItem:(key:string,value:string)=>values.set(key,value),removeItem:(key:string)=>values.delete(key)});
 return {chat:{sessionId:'s',documentType:'invoice',collectedSlots:{businessName:'Nexora'},collectedData:null,revision:2,readOnly:false,canGenerate:true,fieldStates:{},reconcileSnapshot:vi.fn(),updateSemanticFields:vi.fn()},template:vi.fn(),accent:vi.fn(),generate:vi.fn(),preview:vi.fn(),catalog:vi.fn(),canvasWrite:vi.fn(async(...args:unknown[])=>{void args;return {state:{sessionId:'s',revision:2,layoutRevision:1}};})};
});
vi.mock('../chatStore',()=>({useChatStore:{getState:()=>mocks.chat}}));
vi.mock('../../api/ai',()=>({updateSessionTemplate:mocks.template,updateSessionAccentColor:mocks.accent}));
vi.mock('../../api/documents',()=>({generateDocument:mocks.generate,getUploadedPreview:mocks.preview,getDocumentStatus:vi.fn(),getTemplates:vi.fn(),getAvailableTemplateIds:mocks.catalog}));
vi.mock('../../api/client',()=>({apiRequest:mocks.canvasWrite,getToken:()=> 'synthetic'}));
import {useDocumentStore,flushCanvasLayout} from '../documentStore';
beforeEach(()=>{vi.clearAllMocks();mocks.catalog.mockResolvedValue({templates:[]});useDocumentStore.getState().resetDocument();mocks.chat.sessionId='s';vi.stubGlobal('window',{});});
it('uploaded template hydration restores its actual rendered document',async()=>{
 mocks.preview.mockResolvedValue({html:'<h1>Approved company format</h1>'});
 mocks.catalog.mockResolvedValue({templates:[{id:'upl_company_v1',premium:false,name:'Company format'}]});
 useDocumentStore.getState().hydrateConversation({sessionId:'s',templateId:'upl_company_v1',documentType:'invoice',slots:{businessName:'Nexora'}});
 await vi.waitFor(()=>expect(useDocumentStore.getState().previewHtml).toContain('Approved company format'));
 expect(mocks.preview).toHaveBeenCalledWith('upl_company_v1',{documentType:'invoice',businessName:'Nexora'});
 expect(useDocumentStore.getState().canvasElements).toBeNull();
});
it('editable uploaded templates start blank and bind chat values while retaining manual layout edits',async()=>{
 const definition={version:1,pageWidth:595,pageHeight:842,pageCount:1,elements:[
  {id:'upl_static_0_1',type:'text',text:'Invoice',x:30,y:30,w:160,h:20,fontSize:18,fontWeight:700,color:'#222222',align:'left',section:'header',zIndex:1},
  {id:'upl_field_businessName_0_2',type:'text',text:'',binding:'businessName',x:30,y:100,w:180,h:20,fontSize:10,fontWeight:400,color:'#222222',align:'left',section:'header',zIndex:2},
 ]};
 mocks.preview.mockResolvedValue({html:'<h1>Invoice</h1>',canvasDefinition:definition});
 mocks.catalog.mockResolvedValue({templates:[{id:'upl_company_v1',premium:false,name:'Company format'}]});
 useDocumentStore.getState().hydrateConversation({sessionId:'s',templateId:'upl_company_v1',documentType:'invoice',slots:{}});
 await vi.waitFor(()=>expect(useDocumentStore.getState().canvasElements).not.toBeNull());
 expect(useDocumentStore.getState().canvasElements!.find(element=>element.id==='upl_field_businessName_0_2')).toMatchObject({text:'',semanticField:'businessName'});
 useDocumentStore.getState().updateElement('upl_static_0_1',{x:75,text:'Tax invoice'});
 useDocumentStore.getState().refreshCanvasElements({businessName:'New company',documentType:'invoice'});
 expect(useDocumentStore.getState().canvasElements!.find(element=>element.id==='upl_field_businessName_0_2')).toMatchObject({text:'New company'});
 expect(useDocumentStore.getState().canvasElements!.find(element=>element.id==='upl_static_0_1')).toMatchObject({text:'Tax invoice',x:75});
 expect(useDocumentStore.getState().canvasElements!.find(element=>element.id==='upl_field_businessName_0_2')).toMatchObject({semanticField:'businessName'});
 useDocumentStore.getState().updateElement('upl_field_businessName_0_2',{text:'Edited in canvas'});
 await vi.waitFor(()=>{expect(useDocumentStore.getState().error).toBeNull();expect(mocks.chat.updateSemanticFields).toHaveBeenCalledWith({businessName:'Edited in canvas'});});
 await flushCanvasLayout();
 const saved=(mocks.canvasWrite.mock.calls.at(-1)![1] as {body:{layout:NonNullable<ConversationSnapshot['canvasLayout']>}}).body.layout;
 expect(saved.elementOverrides.upl_static_0_1).toEqual({x:75,text:'Tax invoice'});
 expect('text' in saved.elementOverrides.upl_field_businessName_0_2).toBe(false);
 useDocumentStore.getState().hydrateConversation({sessionId:'s',templateId:'upl_company_v1',documentType:'invoice',slots:{businessName:'Saved company'},canvasLayout:saved});
 await vi.waitFor(()=>expect(useDocumentStore.getState().canvasElements?.find(element=>element.id==='upl_field_businessName_0_2')).toMatchObject({text:'Saved company'}));
 expect(useDocumentStore.getState().canvasElements!.find(element=>element.id==='upl_static_0_1')).toMatchObject({text:'Tax invoice',x:75});
 let finish!:(value:unknown)=>void;
 mocks.template.mockResolvedValue({state:{sessionId:'s',revision:3}});
 mocks.preview.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const pending=useDocumentStore.getState().selectTemplate('upl_company_v1');
 useDocumentStore.getState().refreshCanvasElements({documentType:'invoice',businessName:'Newest company'});
 finish({html:'Older details',canvasDefinition:definition});await pending;
 expect(useDocumentStore.getState().canvasElements!.find(element=>element.id==='upl_field_businessName_0_2')).toMatchObject({text:'Newest company'});
});
it('late uploaded previews cannot replace a newer rendered document',async()=>{
 let finish!:(value:{html:string})=>void;
 mocks.preview.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValueOnce({html:'<h1>Latest saved details</h1>'});
 useDocumentStore.setState({selectedTemplate:'upl_company_v1'});
 useDocumentStore.getState().refreshCanvasElements({documentType:'invoice',businessName:'Earlier'});
 useDocumentStore.getState().refreshCanvasElements({documentType:'invoice',businessName:'Latest'});
 await vi.waitFor(()=>expect(useDocumentStore.getState().previewHtml).toContain('Latest saved details'));
 finish({html:'<h1>Outdated details</h1>'});await Promise.resolve();
 expect(useDocumentStore.getState().previewHtml).toContain('Latest saved details');
});
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
it('literal custom templates persist through the scoped canvas API and hydrate without built-in elements',async()=>{
 useDocumentStore.getState().hydrateConversation({sessionId:'s',templateId:'tmpl_invoice_2023_01',documentType:'invoice',slots:{businessName:'Nexora'}});
 useDocumentStore.getState().applyCustomTemplateElements([{id:'saved',type:'text',section:'custom',x:20,y:30,w:200,h:40,zIndex:1,text:'Saved literal',fontSize:20,fontWeight:400,color:'#112233',align:'left'}],595,842,'#ffffff');
 await flushCanvasLayout();
 const layout=(mocks.canvasWrite.mock.calls.at(-1)![1] as {body:{layout:NonNullable<ConversationSnapshot['canvasLayout']>}}).body.layout;
 expect(layout.canvasMode).toBe('literal');expect(layout.customElements).toHaveLength(1);
 useDocumentStore.getState().hydrateConversation({sessionId:'s',templateId:'tmpl_invoice_2023_01',documentType:'invoice',slots:{businessName:'Nexora'},canvasLayout:layout});
 expect(useDocumentStore.getState().canvasElements).toHaveLength(1);
 expect(useDocumentStore.getState().canvasElements![0]).toMatchObject({text:'Saved literal',x:20,y:30});
 useDocumentStore.getState().refreshCanvasElements({businessName:'Other value',documentType:'invoice'});
 expect(useDocumentStore.getState().canvasElements).toHaveLength(1);
});
it('resetting a literal layout and local undo/redo retain the canvas mode',()=>{
 useDocumentStore.getState().hydrateConversation({sessionId:'s',templateId:'tmpl_invoice_2023_01',documentType:'invoice',slots:{}});
 useDocumentStore.getState().applyCustomTemplateElements([{id:'saved',type:'text',section:'custom',x:20,y:30,w:200,h:40,zIndex:1,text:'Saved literal',fontSize:20,fontWeight:400,color:'#112233',align:'left'}]);
 mocks.chat.sessionId='';
 useDocumentStore.getState().resetElementLayout({documentType:'invoice'});
 expect(useDocumentStore.getState().canvasMode).toBe('template');expect(useDocumentStore.getState().canvasElements!.length).toBeGreaterThan(1);
 useDocumentStore.getState().undo({documentType:'invoice'});
 expect(useDocumentStore.getState().canvasMode).toBe('literal');expect(useDocumentStore.getState().canvasElements).toHaveLength(1);
 useDocumentStore.getState().redo({documentType:'invoice'});
 expect(useDocumentStore.getState().canvasMode).toBe('template');
});
