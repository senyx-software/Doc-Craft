import type { ConversationSnapshot } from '../../types';
import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({
  auth:{isAuthenticated:true,isGuest:false},chat:{} as Partial<ConversationSnapshot> & { isLoading?: boolean; error?: string | null; reconcileSnapshot?: (state:ConversationSnapshot)=>void },read:vi.fn(),confirm:vi.fn(),send:vi.fn(),save:vi.fn(),addImage:vi.fn(),capture:vi.fn(),modal:vi.fn(),clone:{style:{} as Record<string,string>,querySelectorAll:()=>[],remove:vi.fn()},
}));
vi.stubGlobal('localStorage',{getItem:()=>null,setItem:vi.fn(),removeItem:vi.fn()});
vi.mock('../chatStore',()=>({useChatStore:{getState:()=>mocks.chat}}));
vi.mock('../authStore',()=>({useAuthStore:{getState:()=>mocks.auth}}));
vi.mock('../quotaStore',()=>({useQuotaStore:{getState:()=>({setShowGuestDownloadModal:mocks.modal})}}));
vi.mock('../../api/ai',()=>({getSummary:mocks.read,confirmDocument:mocks.confirm,sendChatMessage:mocks.send}));
vi.mock('jspdf',()=>({default:class {addImage=mocks.addImage;addPage=vi.fn();save=mocks.save;}}));
vi.mock('html2canvas',()=>({default:mocks.capture}));
import {useDocumentStore} from '../documentStore';
import {snapshot} from '../../../../shared/conversation-state.mjs';
const slots={businessName:'Nexora',clientName:'Yohan',senderAddress:'10 Sender Road',clientAddress:'20 Client Road',senderEmail:'hello@nexora.com',senderPhone:'0771234567',invoiceNumber:'INV-1',issueDate:'2026-10-14',dueDate:'2026-12-12',currency:'LKR',lineItems:[{description:'Design',quantity:2,unitPrice:100000}]};
function state(raw:Record<string,unknown>=slots){return snapshot({id:'s',status:'ACTIVE',documentTypeId:'invoice',templateId:'tmpl_invoice_odoo_community',slots:raw});}
beforeEach(()=>{
 vi.clearAllMocks();mocks.auth.isAuthenticated=true;mocks.auth.isGuest=false;
 Object.assign(mocks.chat,{...state(),isLoading:false,error:null,assets:[],reconcileSnapshot:vi.fn((s:ConversationSnapshot)=>Object.assign(mocks.chat,s))});
 mocks.clone={style:{},querySelectorAll:()=>[],remove:vi.fn()};
 vi.stubGlobal('window',{});vi.stubGlobal('document',{cookie:'',createElement:()=>({textContent:'',remove:vi.fn()}),head:{appendChild:vi.fn()},querySelectorAll:()=>[{querySelector:()=>({cloneNode:()=>mocks.clone})}],body:{appendChild:vi.fn()},fonts:{ready:Promise.resolve()}});
 vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>{callback(0);return 1;});
 mocks.read.mockResolvedValue({state:state()});mocks.confirm.mockImplementation(async(_id:string,_fp:string,revision:number)=>({state:{...state(),revision:revision+1,finalization:{...state().finalization,status:'confirmed'}}}));
 mocks.capture.mockResolvedValue({toDataURL:()=> 'data:image/jpeg;base64,fixture'});
 useDocumentStore.getState().resetDocument();useDocumentStore.setState({selectedTemplate:'tmpl_invoice_odoo_community'});
});
it('Download validates and confirms the saved document, captures the preview, and saves a PDF without chat or generation',async()=>{
 await useDocumentStore.getState().exportPdf();expect(mocks.read).toHaveBeenCalledWith('s');expect(mocks.confirm).toHaveBeenCalledWith('s',state().finalization.fingerprint,0);expect(mocks.capture).toHaveBeenCalledOnce();expect(mocks.save).toHaveBeenCalledWith(expect.stringMatching(/^DocCraft-invoice-.*\.pdf$/));expect(mocks.send).not.toHaveBeenCalled();expect(useDocumentStore.getState().isExporting).toBe(false);
});
it('guest download calls are blocked even when the store method is invoked directly',async()=>{
 mocks.auth.isGuest=true;await useDocumentStore.getState().exportPdf();expect(mocks.modal).toHaveBeenCalledWith(true);expect(mocks.read).not.toHaveBeenCalled();expect(mocks.capture).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();
});
it('incomplete details stop export and show the required question at the Download control',async()=>{
 mocks.read.mockResolvedValueOnce({state:state({...slots,clientName:''})});await useDocumentStore.getState().exportPdf();expect(mocks.confirm).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();expect(useDocumentStore.getState().error).toContain('client');expect(useDocumentStore.getState().isExporting).toBe(false);
});
it('a failed chat reply does not prevent PDF download or lose its retry context',async()=>{
 const saved=state({...slots,_chat:{latestTurnId:'turn',turns:{turn:{status:'failure',retryable:true,message:'Suggest wording'}}}});Object.assign(mocks.chat,saved,{error:'Provider busy'});
 mocks.read.mockResolvedValueOnce({state:saved});mocks.confirm.mockResolvedValueOnce({state:{...saved,revision:1,finalization:{...saved.finalization,status:'confirmed'}}});
 await useDocumentStore.getState().exportPdf();expect(mocks.save).toHaveBeenCalledOnce();expect(mocks.chat.pendingTurn?.id).toBe('turn');expect(mocks.send).not.toHaveBeenCalled();
});
it('storage failures do not trigger PDF capture or claim a download succeeded',async()=>{
 mocks.read.mockRejectedValueOnce(new Error('Storage unavailable'));await useDocumentStore.getState().exportPdf();expect(mocks.capture).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();expect(useDocumentStore.getState().error).toBe('Storage unavailable');
});
it('a change during rasterization cannot download an outdated version and always removes the clone',async()=>{
 mocks.capture.mockImplementationOnce(async()=>{mocks.chat.revision=(mocks.chat.revision??0)+1;return {toDataURL:()=> 'fixture'};});await useDocumentStore.getState().exportPdf();expect(mocks.save).not.toHaveBeenCalled();expect(mocks.clone.remove).toHaveBeenCalledOnce();expect(useDocumentStore.getState().error).toContain('changed while exporting');expect(useDocumentStore.getState().isExporting).toBe(false);
});
