import {it,expect,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('../../../store/chatStore',()=>({useChatStore:()=>({messages:[{role:'assistant',content:'Next question'}],documentType:'invoice',collectedSlots:{},summary:'Invoice summary\nNexora\nTotal: LKR 120000.00',currentField:'businessName',readyToGenerate:false,pendingCorrection:null,isLoading:false,isLoadingSessions:false,readOnly:false,pendingTurn:null,error:null,sessionId:'s',userSessions:[]})}));
vi.mock('../../../store/documentStore',()=>({useDocumentStore:()=>({generationStatus:null,documentId:null,pollGeneration:vi.fn(),error:null})}));
import ChatPanel from '../ChatPanel';
it('T38 Review and authoritative summary remain visible even for incomplete documents',()=>{const html=renderToStaticMarkup(<ChatPanel/>);expect(html).toContain('btn-summary');expect(html).toContain('aria-label="Document summary"');expect(html).toContain('Nexora');expect(html).toContain('120000.00');});
