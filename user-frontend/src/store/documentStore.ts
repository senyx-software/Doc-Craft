/**
 * Document Store — Zustand
 * Manages document generation, preview, layout, templates, and PDF export.
 * Includes DEMO MODE with mock templates and a sample invoice preview.
 */

import { useChatStore } from './chatStore';
import { create } from 'zustand';
import type {
  DocumentType,
  Template,
  LayoutState,
} from '../types';
import type { InvoiceElement } from '../types/canvasElement';
import { PAGE_WIDTH, PAGE_HEIGHT } from '../types/canvasElement';
import { persist } from 'zustand/middleware';
import * as documentsApi from '../api/documents';
import { semanticCanvasPatch } from '../../../shared/canvas-fields.mjs';
import { workflow,documentData,templateSchema } from '../../../shared/document-contract.mjs';
import { preparePdfDownload } from '../utils/pdfDownload';
import { assetElements } from '../../../shared/document-assets.mjs';
import { withExportFontMetrics } from '../utils/exportFontMetrics';
import { apiRequest, getToken } from '../api/client';
import { canvasLayout } from '../../../shared/canvas-layout.mjs';
import {editorContext} from '../../../shared/editor-commands.mjs';
import {clearUploadedDefinitions,registerUploadedDefinition,uploadedDefinition,uploadedTemplateElements,type EditableTemplateDefinition} from '../utils/uploadedTemplateElements';
import type { ConversationSnapshot } from '../types';

let documentGeneration=0;
let uploadedPreviewSequence=0;
let restoringCanvas=false;
let canvasSession: string | null=null;
let canvasRevision=0;
let canvasTimer: ReturnType<typeof setTimeout> | undefined;
let canvasWrite: Promise<void> | undefined;
let canvasDirty=false;

export function currentEditorContext() {
  const state=useDocumentStore.getState(),elements=(state.canvasElements||[]).slice(0,1000).map(el=>({id:el.id,type:el.type,label:el.type==='text'?el.text.slice(0,120):el.type,...Object.fromEntries(['x','y','w','h','fontSize','fontWeight'].filter(key=>typeof (el as unknown as Record<string,unknown>)[key]==='number').map(key=>[key,(el as unknown as Record<string,unknown>)[key]]))}));
  return editorContext({elements,selectedIds:state.selectedElementIds.filter(id=>elements.some(el=>el.id===id))});
}
export function editorStateForChat() {return {editor_context:currentEditorContext(),expected_layout_revision:canvasRevision};}
export function acceptCanvasSnapshot(state:ConversationSnapshot) {
  if(canvasSession!==state.sessionId||(state.layoutRevision||0)<canvasRevision)return;
  if((state.layoutRevision||0)===canvasRevision)return;
  restoringCanvas=true;
  try {
    canvasRevision=state.layoutRevision||0;canvasDirty=false;
    const layout=canvasLayout(state.canvasLayout||{}) as NonNullable<ConversationSnapshot['canvasLayout']>;
    useDocumentStore.setState({...layout,selectedElementIds:state.editorContext?.selectedIds||[],selectedElementId:state.editorContext?.selectedIds?.at(-1)||null,historyPast:[],historyFuture:[]});
  }finally {restoringCanvas=false;}
}

export async function flushCanvasLayout(): Promise<void> {
  if (canvasTimer) clearTimeout(canvasTimer);
  if (canvasWrite) { await canvasWrite; if (canvasDirty) return flushCanvasLayout(); return; }
  if (!canvasDirty || !canvasSession || useChatStore.getState().sessionId!==canvasSession) return;
  const session=canvasSession, epoch=documentGeneration, token=getToken();
  const state=useDocumentStore.getState();
  let layout;
  try { layout=canvasLayout({canvasMode:state.canvasMode,elementOverrides:state.elementOverrides,customElements:state.customElements,pageWidth:state.pageWidth,pageHeight:state.pageHeight,pageBackgroundColor:state.pageBackgroundColor}); }
  catch(error){useDocumentStore.setState({error:'Canvas changes exceed the supported size or format and were not saved.'});throw error;}
  canvasDirty=false;
  canvasWrite=apiRequest<{state:ConversationSnapshot}>('/chat/api/chat/session/'+encodeURIComponent(session)+'/canvas', {
    method:'PUT',body:{layout,expectedLayoutRevision:canvasRevision,editorContext:currentEditorContext()},
  }).then(response=>{
    if(epoch!==documentGeneration || token!==getToken() || canvasSession!==session) return;
    canvasRevision=response.state.layoutRevision || 0;
    useChatStore.getState().reconcileSnapshot(response.state);
  }).catch(error=>{
    if(epoch===documentGeneration && token===getToken()) useDocumentStore.setState({error:'Canvas changes were not saved. Reload before editing in another tab, then try again.'});
    throw error;
  }).finally(()=>{canvasWrite=undefined;});
  await canvasWrite;
  if(canvasDirty) await flushCanvasLayout();
}
function isDemoMode(): boolean {
  return import.meta.env.DEV && localStorage.getItem('doccraft_token') === 'demo_token_for_testing';
}

export function isGuestMode(): boolean {
  try {
    const token = localStorage.getItem('doccraft_token');
    if (!token) return false;
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.sub === 'string' && payload.sub.startsWith('guest_');
  } catch {
    return false;
  }
}


import { renderTemplate, getTemplateAccent, DOCUMENT_TYPE_TEMPLATES } from '../utils/templateRenderer';
import { getElementsForTemplate } from '../utils/invoiceElements';

export type CanvasTool = 'select' | 'rect' | 'ellipse' | 'line' | 'text';

// An uploaded/drawn asset the user can reuse — click a thumbnail in the
// Uploads or Signature tab to drop another copy onto the canvas, instead of
// re-uploading/re-drawing it every time.
export interface UploadedAsset {
  id: string;
  dataUrl: string;
  kind: 'image' | 'signature';
}

export const SAMPLE_DOCUMENT_DATA: Record<DocumentType, Record<string, unknown>> = {
  proposal:{documentType:'proposal',businessName:'Example Company',clientName:'Example Client',invoiceNumber:'PRO-SAMPLE',subject:'Example project',issueDate:'2026-10-13',dueDate:'2026-11-13',currency:'USD',lineItems:[{description:'Example service',quantity:1,unitPrice:100}]},
  invoice: {
    documentType: 'invoice',
    businessName: 'Organization Name',
    clientName: 'Acme Systems',
    invoiceNumber: 'INV-2026-SAMPLE',
    lineItems: [
      { description: 'Cloud Integration Support', quantity: 2, unitPrice: 25000, total: 50000 },
      { description: 'React Frontend UI Setup', quantity: 1, unitPrice: 75000, total: 75000 },
    ],
    subtotal: 125000,
    totalDue: 125000,
    issueDate: '2026-08-16',
    dueDate: '2026-08-30',
    subject: 'Web Application Development',
  },
  quotation: {
    documentType: 'quotation',
    businessName: 'Apex Digital Solutions',
    clientName: 'Apex Logistics Ltd',
    invoiceNumber: 'QTE-2026-084',
    quoteNumber: 'QTE-2026-084',
    lineItems: [
      { description: 'Mobile App Architecture & Design', quantity: 1, unitPrice: 150000, total: 150000 },
      { description: 'Backend API Microservices Setup', quantity: 1, unitPrice: 120000, total: 120000 },
    ],
    subtotal: 270000,
    totalDue: 270000,
    issueDate: '2026-08-16',
    dueDate: '2026-09-15',
    subject: 'Mobile & Cloud Infrastructure Price Estimate',
    notesAndTerms: 'This quotation is valid for 30 days. Acceptance signature required.',
  },
  receipt: {
    documentType: 'receipt',
    businessName: 'DocCraft Services',
    clientName: 'Starlight Corp',
    invoiceNumber: 'REC-2026-992',
    receiptNumber: 'REC-2026-992',
    paymentMethod: 'Credit Card / Online',
    referenceNumber: 'TXN-9984102',
    lineItems: [
      { description: 'Annual Pro Subscription Service', quantity: 1, unitPrice: 48000, total: 48000 },
    ],
    subtotal: 48000,
    totalDue: 48000,
    issueDate: '2026-08-16',
  },
  purchase_order: {
    documentType: 'purchase_order',
    businessName: 'NextGen Hardware Inc',
    clientName: 'Precision Electronics Supplier',
    invoiceNumber: 'PO-2026-551',
    poNumber: 'PO-2026-551',
    lineItems: [
      { description: 'High-Performance Server Blade Racks', quantity: 4, unitPrice: 120000, total: 480000 },
      { description: 'Fiber Optic Network Cables (10m)', quantity: 20, unitPrice: 2500, total: 50000 },
    ],
    subtotal: 530000,
    totalDue: 530000,
    issueDate: '2026-08-16',
    dueDate: '2026-08-30',
    notesAndTerms: 'Please reference P.O. Number on all invoices and shipping labels.',
  },
};


// Pure helper — regenerates the base element list from data, then re-applies
// any manual edits (drag/resize/restyle) the user made, keyed by the
// elements' stable ids, plus any custom shapes/text they've added.
function computeCanvasElements(
  templateId: string | null,
  data: Record<string, unknown>,
  accent: string,
  overrides: Record<string, Partial<InvoiceElement>>,
  custom: InvoiceElement[],
  documentType?: string,
  mode: 'template'|'literal' = useDocumentStore.getState().canvasMode
): InvoiceElement[] | null {
  if (!templateId) return null;
  const docType = documentType || (data?.documentType as string);
  const dataWithDocType = docType ? { documentType: docType, ...data } : data;
  const base = mode==='literal'?[]:templateId.startsWith('upl_')?uploadedTemplateElements(templateId,dataWithDocType):getElementsForTemplate(templateId, dataWithDocType, accent || getTemplateAccent(templateId));
  if (!base) return null;
  const merged = base.map((el) => ({ ...el, ...(overrides[el.id] || {}) } as InvoiceElement));
  const content=[...merged,...custom];
  const assets=assetElements(useChatStore.getState().assets||[],content).map(el=>({...el,...(overrides[el.id]||{})}));
  return [...content,...assets];
}

function applyUploadedPreview(templateId:string,preview:{html:string;canvasDefinition?:EditableTemplateDefinition},data:Record<string,unknown>) {
  if(preview.canvasDefinition)registerUploadedDefinition(templateId,preview.canvasDefinition);
  const state=useDocumentStore.getState();
  return {previewHtml:preview.html,canvasElements:computeCanvasElements(templateId,data,state.accentColor,state.elementOverrides,state.customElements)};
}

interface DocumentState {
  documentId: string | null;
  generationStatus: string | null;
  pollGeneration: () => Promise<void>;
  previewHtml: string | null;
  layoutState: LayoutState | null;
  templates: Template[];
  selectedTemplate: string | null;
  accentColor: string;
  isGenerating: boolean;
  isExporting: boolean;
  isSidebarOpen: boolean;
  error: string | null;

  // Editable canvas (Figma-style) — populated only for templates that have
  // an element-model migration; null means "fall back to the HTML preview".
  canvasMode: 'template' | 'literal';
  canvasElements: InvoiceElement[] | null;
  elementOverrides: Record<string, Partial<InvoiceElement>>;
  customElements: InvoiceElement[];
  // selectedElementId is the "primary" selection (last one clicked) — kept
  // for the inspector panel and any single-selection call site. The real
  // source of truth for multi-select (Shift/Ctrl/Cmd+click) is the array.
  selectedElementId: string | null;
  selectedElementIds: string[];
  activeTool: CanvasTool;
  // The page itself as a selection target (double-click empty canvas) —
  // mutually exclusive with an element selection; the Design panel shows
  // page-level properties (background, grid, size) while this is true.
  pageSelected: boolean;
  pageWidth: number;
  pageHeight: number;
  pageBackgroundColor: string;
  showGrid: boolean;

  // Undo/redo history — snapshots of {elementOverrides, customElements}
  // (everything that makes up a user's edits on top of the base template).
  // Continuous gestures (drag/resize) checkpoint once at the start via
  // checkpointHistory(), not on every intermediate update, or one drag
  // would produce hundreds of undo steps.
  historyPast: Array<{ canvasMode?:'template'|'literal'; elementOverrides: Record<string, Partial<InvoiceElement>>; customElements: InvoiceElement[] }>;
  historyFuture: Array<{ canvasMode?:'template'|'literal'; elementOverrides: Record<string, Partial<InvoiceElement>>; customElements: InvoiceElement[] }>;

  // Session-scoped library of uploaded images / drawn or uploaded
  // signatures, shown as a thumbnail grid in the Uploads / Signature tabs.
  uploadedAssets: UploadedAsset[];
  addUploadedAsset: (asset: UploadedAsset) => void;
  removeUploadedAsset: (id: string) => void;

  hydrateConversation: (state: {sessionId?:string;templateId?:string;accentColor?:string;documentType:DocumentType;slots:Record<string,unknown>;canvasLayout?:ConversationSnapshot['canvasLayout'];layoutRevision?:number;editorContext?:ConversationSnapshot['editorContext']}) => void;
  fetchTemplates: (documentType: DocumentType) => Promise<void>;
  selectTemplate: (templateId: string) => void;
  applyCustomTemplateElements: (elements: InvoiceElement[], pageWidth?: number | null, pageHeight?: number | null, pageBackgroundColor?: string | null) => void;
  setAccentColor: (color: string) => void;
  generateDocument: (sessionId: string, documentType: DocumentType, data: Record<string, unknown>, operationId?:string, expectedRevision?:number) => Promise<void>;
  updateLayout: (section: string, controls: Record<string, unknown>) => Promise<void>;
  updateContent: (slot: string, value: unknown) => Promise<void>;
  exportPdf: () => Promise<void>;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  resetDocument: () => void;

  selectElement: (id: string | null, options?: { additive?: boolean }) => void;
  selectElements: (ids: string[]) => void;
  selectPage: () => void;
  setPageSize: (width: number, height: number) => void;
  setPageBackgroundColor: (color: string) => void;
  setShowGrid: (show: boolean) => void;
  updateElement: (id: string, patch: Partial<InvoiceElement>) => void;
  updateElements: (ids: string[], patch: Partial<InvoiceElement> | ((id: string) => Partial<InvoiceElement>)) => void;
  addElement: (el: InvoiceElement) => void;
  deleteElement: (id: string) => void;
  deleteElements: (ids: string[]) => void;
  setActiveTool: (tool: CanvasTool) => void;
  checkpointHistory: () => void;
  undo: (data: Record<string, unknown>) => void;
  redo: (data: Record<string, unknown>) => void;
  refreshCanvasElements: (data: Record<string, unknown>) => void;
  resetElementLayout: (data: Record<string, unknown>) => void;
}

let metadataWrites: Promise<void> = Promise.resolve();
function enqueueMetadataWrite(work: () => Promise<void>) {
  metadataWrites = metadataWrites.catch(() => { /* A failed prior write must not block a later choice. */ }).then(work);
  void metadataWrites.catch(() => { /* Each write reports its own scoped error. */ });
}

export const useDocumentStore = create<DocumentState>()(
  persist(
    (set, get) => ({
  documentId: null,
  generationStatus:null,
  previewHtml: null,
  layoutState: null,
  templates: [],
  selectedTemplate: null,
  accentColor: '',
  isGenerating: false,
  isExporting: false,
  isSidebarOpen: false,
  error: null,

  canvasMode: 'template',
  canvasElements: null,
  elementOverrides: {},
  customElements: [],
  selectedElementId: null,
  selectedElementIds: [],
  activeTool: 'select',
  pageSelected: false,
  pageWidth: PAGE_WIDTH,
  pageHeight: PAGE_HEIGHT,
  pageBackgroundColor: '#ffffff',
  showGrid: false,
  historyPast: [],
  historyFuture: [],
  uploadedAssets: [],

  addUploadedAsset: (asset: UploadedAsset) => {
    set((state) => ({ uploadedAssets: [asset, ...state.uploadedAssets] }));
  },

  removeUploadedAsset: (id: string) => {
    set((state) => ({ uploadedAssets: state.uploadedAssets.filter((a) => a.id !== id) }));
  },

  hydrateConversation: (state) => {
    restoringCanvas=true;
    get().resetDocument();
    set({templates:(DOCUMENT_TYPE_TEMPLATES[state.documentType]||DOCUMENT_TYPE_TEMPLATES.invoice) as Template[],selectedTemplate:state.templateId||DOCUMENT_TYPE_TEMPLATES[state.documentType]?.[0]?.template_id||null,accentColor:state.accentColor||''});
    if (state.canvasLayout) {
      const layout=canvasLayout(state.canvasLayout) as NonNullable<ConversationSnapshot['canvasLayout']>;
      set(layout);
    }
    set({selectedElementIds:state.editorContext?.selectedIds||[],selectedElementId:state.editorContext?.selectedIds?.at(-1)||null});
    get().refreshCanvasElements({documentType:state.documentType,...state.slots});
    canvasSession=state.sessionId || null;
    canvasRevision=state.layoutRevision || 0;
    restoringCanvas=false;
    if (!isDemoMode()) void get().fetchTemplates(state.documentType);
  },

  fetchTemplates: async (documentType: DocumentType) => {
    const epoch=documentGeneration;
    let list = (DOCUMENT_TYPE_TEMPLATES[documentType] || DOCUMENT_TYPE_TEMPLATES.invoice) as Template[];
    if(!isDemoMode()) {
      try {const response=await documentsApi.getAvailableTemplateIds(documentType);const allowed=new Set(response.templates.map(template=>template.id));list=[...list.filter(template=>allowed.has(template.template_id)),...response.templates.filter(template=>template.id.startsWith('upl_')).map(template=>({template_id:template.id,name:template.name,created_at:template.created_at,owner_id:template.owner_id,visibility:template.visibility,can_rename:template.can_rename,thumbnail_url:'',tier:template.premium?'pro' as const:'free' as const}))];}
      catch {if(epoch===documentGeneration)set({templates:[],error:'Template availability could not be loaded.'});return;}
    }
    if(epoch!==documentGeneration)return;
    set({
      templates: list,
      selectedTemplate: list.some(template=>template.template_id===get().selectedTemplate)?get().selectedTemplate:list[0]?.template_id||'tmpl_invoice_2023_01',
    });
  },

  selectTemplate: async (templateId: string) => {
    window.__selectedTemplateId = templateId;
    set({ selectedTemplate: templateId, canvasMode:'template', elementOverrides: {}, customElements: [], selectedElementId: null, selectedElementIds: [], historyPast: [], historyFuture: [] });
    const state = get();

    // Sync active session template ID in backend
    const epoch=documentGeneration;
    const chatState=useChatStore.getState();
    if (chatState.sessionId && !chatState.readOnly) enqueueMetadataWrite(async () => {
      if(epoch!==documentGeneration || chatState.sessionId!==useChatStore.getState().sessionId || get().selectedTemplate!==templateId)return;
      const api=await import('../api/ai');
      try {
        const result=await api.updateSessionTemplate(chatState.sessionId!,templateId);
        if(epoch===documentGeneration&&chatState.sessionId===useChatStore.getState().sessionId)useChatStore.getState().reconcileSnapshot(result.state);
      } catch {
        if(epoch===documentGeneration&&chatState.sessionId===useChatStore.getState().sessionId&&get().selectedTemplate===templateId) {
          set({error:'Template selection was not saved.'});
          try {const restored=await api.getSummary(chatState.sessionId!);if(epoch===documentGeneration&&chatState.sessionId===useChatStore.getState().sessionId){useChatStore.getState().reconcileSnapshot(restored.state);set({selectedTemplate:restored.state.templateId||null});get().refreshCanvasElements({documentType:restored.state.documentType,...restored.state.slots});}}catch { /* Keep the explicit unsaved error until restoration is possible. */ }
        }
      }
    });

    const docType = chatState.documentType || 'invoice';
    const hasUserSlots = Object.keys(chatState.collectedSlots || {}).length > 0;
    const dataToRender = hasUserSlots
      ? { documentType: docType, ...chatState.collectedSlots }
      : (chatState.collectedData || (isDemoMode()?SAMPLE_DOCUMENT_DATA[docType]:{documentType:docType}));

    if(state.canvasMode!=='literal'&&templateId.startsWith('upl_')) {
      const previewSequence=++uploadedPreviewSequence;
      set({canvasElements:null,previewHtml:null,error:null});
      try {const preview=await documentsApi.getUploadedPreview(templateId,dataToRender);if(epoch===documentGeneration&&previewSequence===uploadedPreviewSequence&&get().selectedTemplate===templateId)set(applyUploadedPreview(templateId,preview,dataToRender));}
      catch(error) {if(epoch===documentGeneration&&previewSequence===uploadedPreviewSequence&&get().selectedTemplate===templateId)set({error:error instanceof Error?error.message:'Uploaded template preview unavailable'});}
      return;
    }
    set({
      previewHtml: renderTemplate(
        templateId,
        dataToRender,
        state.layoutState,
        state.accentColor,
        docType
      ),
      canvasElements: computeCanvasElements(templateId, dataToRender, state.accentColor, {}, [], docType),
    });
  },

  // Loads a saved custom template's literal snapshot onto the canvas —
  // unlike selectTemplate, this doesn't re-derive elements from a
  // data-bound generator (custom templates aren't one), so it's just a
  // direct replace, same reset-selection/history pattern as switching
  // templates otherwise.
  applyCustomTemplateElements: (elements, pageWidth, pageHeight, pageBackgroundColor) => {
    let layout;
    try {
      layout=canvasLayout({canvasMode:'literal',customElements:elements.map((el,index)=>({...el,id:'custom_template_'+index})),
        pageWidth:pageWidth||get().pageWidth,pageHeight:pageHeight||get().pageHeight,
        pageBackgroundColor:pageBackgroundColor||get().pageBackgroundColor});
    } catch {
      set({error:'This saved template exceeds the supported canvas format or size. It was not applied.'});
      return;
    }
    set({
      ...layout,
      canvasElements: layout.customElements as InvoiceElement[],
      elementOverrides: {},
      customElements: layout.customElements as InvoiceElement[],
      selectedElementId: null,
      selectedElementIds: [],
      historyPast: [],
      historyFuture: [],
      ...(pageWidth ? { pageWidth } : {}),
      ...(pageHeight ? { pageHeight } : {}),
      ...(pageBackgroundColor ? { pageBackgroundColor } : {}),
    });
  },

  setAccentColor: (color: string) => {
    set({ accentColor: color });
    const state = get();

    const epoch=documentGeneration,chat=useChatStore.getState();
    if(chat.sessionId&&!chat.readOnly) enqueueMetadataWrite(async () => {
      if(epoch!==documentGeneration||chat.sessionId!==useChatStore.getState().sessionId||get().accentColor!==color)return;
      const api=await import('../api/ai');
      try {
        const result=await api.updateSessionAccentColor(chat.sessionId!,color);
        if(epoch===documentGeneration&&chat.sessionId===useChatStore.getState().sessionId)useChatStore.getState().reconcileSnapshot(result.state);
      } catch {
        if(epoch===documentGeneration&&chat.sessionId===useChatStore.getState().sessionId&&get().accentColor===color) {
          set({error:'Accent color was not saved.'});
          try {const restored=await api.getSummary(chat.sessionId!);if(epoch===documentGeneration&&chat.sessionId===useChatStore.getState().sessionId){useChatStore.getState().reconcileSnapshot(restored.state);set({accentColor:restored.state.accentColor||''});get().refreshCanvasElements({documentType:restored.state.documentType,...restored.state.slots});}}catch { /* Keep the explicit unsaved error until restoration is possible. */ }
        }
      }
    });

    if (state.documentId) {
      state.updateLayout('accent_color', { color });
    }
  },

  generateDocument: async (_sessionId, documentType, data, operationId, expectedRevision) => {
    const epoch=documentGeneration;
    const isCurrent=()=>epoch===documentGeneration&&useChatStore.getState().sessionId===_sessionId;
    const state = get();
    const docTemplates = (DOCUMENT_TYPE_TEMPLATES[documentType] || DOCUMENT_TYPE_TEMPLATES.invoice) as Template[];
    const templateId = state.selectedTemplate || docTemplates[0]?.template_id || 'tmpl_invoice_2023_01';
    if (!state.selectedTemplate) set({ selectedTemplate: templateId });

    const sampleData = SAMPLE_DOCUMENT_DATA[documentType] || SAMPLE_DOCUMENT_DATA.invoice;
    const validation = workflow(documentType, data, useChatStore.getState().fieldStates,templateSchema(documentType,templateId));
    if (!isDemoMode() && !validation.readyToGenerate) { set({error:'Complete the required document fields before generation.',isGenerating:false}); return; }
    if(!isDemoMode()&&!useChatStore.getState().canGenerate){set({error:'Review and confirm the document details before generation.',isGenerating:false});void useChatStore.getState().fetchSummary();return;}
    const fullData = isDemoMode() ? { ...sampleData, documentType, ...data } : {documentType,...documentData(data)};

    set({ isGenerating: true, error: null });

    let createdDocId: string | null = null;
    if (!isDemoMode()) {
      try {
        const res = await documentsApi.generateDocument({
          session_id: _sessionId,
          operation_id:operationId,
          expected_revision:expectedRevision??useChatStore.getState().revision,
          document_type: documentType,
          template_id: templateId,
          accent_color: state.accentColor || '#0097b2',
          data: fullData,
        });
        if(!isCurrent()) return;
        set({generationStatus:res.status||'queued'});
        if (res?.document_id) {
          createdDocId = res.document_id;
        }
      } catch {if(isCurrent())set({error:'Document generation failed. Saved information is still available.',isGenerating:false,generationStatus:'failed'});return;}
    }

    if(!isDemoMode()&&!isCurrent())return;
    const initialLayout: LayoutState = {
      headerAlignment: 'left',
      fontSize: 'medium',
      showLogo: false,
      showNotes: true,
      showHeader: true,
      showTotalDetails: true,
      logoUrl: '',
      sectionOrder: ['header', 'client_details', 'line_items', 'total', 'notes'],
    };
    const previewHtml = renderTemplate(
      templateId,
      fullData,
      initialLayout,
      state.accentColor,
      documentType
    );
    if(state.canvasMode==='literal') {
      set({documentId:createdDocId,isGenerating:false});
      return;
    }
    set({
      canvasMode:'template',
      documentId: createdDocId || (isDemoMode() ? `demo_doc_${Date.now()}` : null),
      previewHtml,
      layoutState: initialLayout,
      isGenerating: false,
      canvasElements: computeCanvasElements(templateId, fullData, state.accentColor, {}, [], documentType),
      elementOverrides: {},
      customElements: [],
      selectedElementId: null,
      selectedElementIds: [],
      pageSelected: false,
      historyPast: [],
      historyFuture: [],
    });
  },

  pollGeneration: async () => {
    const id=get().documentId,epoch=documentGeneration;if(!id)return;
    try {const result=await documentsApi.getDocumentStatus(id);if(epoch!==documentGeneration||get().documentId!==id)return;set({generationStatus:result.status==='success'?'completed':result.status,...(result.status==='failed'?{error:'Document generation failed. Saved information is still available.'}:{})});} catch {if(epoch===documentGeneration)set({error:'Could not retrieve generation status. Your document data is still saved.'});}
  },

  updateLayout: async (section, controls) => {
    const state = get();
    if (!state.documentId) return;

    const chatState=useChatStore.getState();
    const collectedData=chatState.collectedData||chatState.collectedSlots||{};

    const newLayoutState = { ...state.layoutState } as LayoutState;
    // `!== undefined` (not a truthy check) so passing an empty string resets
    // the override back to the template's own Figma accent color.
    if (controls.color !== undefined) set({ accentColor: controls.color as string });
    if (controls.alignment === 'left' || controls.alignment === 'center' || controls.alignment === 'right') {
      newLayoutState.headerAlignment = controls.alignment;
      newLayoutState[`${section}_alignment`] = controls.alignment;
    }
    if (controls.visible !== undefined) {
      if (section === 'logo') newLayoutState.showLogo = controls.visible as boolean;
      if (section === 'notes') newLayoutState.showNotes = controls.visible as boolean;
      if (section === 'header') newLayoutState.showHeader = controls.visible as boolean;
      if (section === 'totalDetails') newLayoutState.showTotalDetails = controls.visible as boolean;
    }
    if (controls.showQuantityColumn !== undefined) {
      newLayoutState.showQuantityColumn = controls.showQuantityColumn as boolean;
    }
    if (controls.logoUrl !== undefined) newLayoutState.logoUrl = controls.logoUrl as string;
    if (controls.signatureUrl !== undefined) newLayoutState.signatureUrl = controls.signatureUrl as string;
    if (controls.sectionOrder !== undefined) newLayoutState.sectionOrder = controls.sectionOrder as string[];

    if (controls.fontSize === 'small' || controls.fontSize === 'medium' || controls.fontSize === 'large') {
      newLayoutState.fontSize = controls.fontSize;
      newLayoutState[`${section}_fontSize`] = controls.fontSize;
    }
    if (controls.fontFamily !== undefined) newLayoutState.fontFamily = controls.fontFamily as string;
    if (controls.bold !== undefined) {
      newLayoutState.bold = controls.bold as boolean;
      newLayoutState[`${section}_bold`] = controls.bold;
    }

    // `!== undefined` here too — `controls.color` can legitimately be ''
    // (reset to the template's own accent), which is falsy but not "unset".
    const updatedAccent = controls.color !== undefined ? (controls.color as string) : state.accentColor;

    set({ layoutState: newLayoutState });

    if (state.selectedTemplate) {
      const previewHtml = renderTemplate(
        state.selectedTemplate!,
        collectedData,
        newLayoutState,
        updatedAccent,
        chatState.documentType || 'invoice'
      );
      const canvasElements = computeCanvasElements(
        state.selectedTemplate,
        collectedData,
        updatedAccent,
        state.elementOverrides,
        state.customElements
      );
      set({ previewHtml, canvasElements });
    }
  },

  updateContent: async (slot, value) => {
    await (await import('./chatStore')).useChatStore.getState().updateSemanticFields({[slot]:value});
  },

  exportPdf: async () => {
    if (get().isExporting) return;
    const { useAuthStore } = await import('./authStore');
    const auth = useAuthStore.getState();
    if (!auth.isAuthenticated || auth.isGuest || isGuestMode()) {
      (await import('./quotaStore')).useQuotaStore.getState().setShowGuestDownloadModal(true);
      return;
    }
    const chat = useChatStore.getState(), epoch = documentGeneration;
    const isCurrent = () => epoch === documentGeneration && useChatStore.getState().sessionId === chat.sessionId;
    set({ isExporting: true, error: null });

    try {
      if (chat.isLoading) throw new Error('Wait for your current changes to finish saving, then click Download.');
      await flushCanvasLayout();
      if (!isDemoMode()) {
        if (!chat.sessionId) throw new Error('Open a saved document before downloading.');
        const api = await import('../api/ai');
        await metadataWrites;
        await preparePdfDownload({
          sessionId: chat.sessionId,
          fingerprint: chat.finalization?.fingerprint,
          isCurrent,
          read: async () => (await api.getSummary(chat.sessionId!)).state,
          confirm: async (state) => (await api.confirmDocument(state.sessionId, state.finalization!.fingerprint, state.revision)).state,
          reconcile: (state) => {
            if (state.revision < useChatStore.getState().revision) throw new Error('Your document changed. Click Download again to confirm the latest details.');
            useChatStore.getState().reconcileSnapshot(state);
            get().refreshCanvasElements({ documentType: state.documentType, ...state.slots });
          },
        });
      }
      if(get().selectedTemplate?.startsWith('upl_')&&!get().canvasElements)throw new Error('Wait for your uploaded template to finish loading, then download again.');
      // Let React paint the committed snapshot before capturing the page.
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      if (!isCurrent()) return;
      const state = get();
      const capturedRevision = useChatStore.getState().revision;
      const assertSavedVersion = () => {
        if (!isCurrent() || capturedRevision !== useChatStore.getState().revision) throw new Error('Your document changed while exporting. Click Download again for the latest version.');
      };
      const { default: jsPDF } = await import('jspdf');
      const { default: html2canvas } = await import('html2canvas');

      // 1. Try live interactive canvas container / page cards
      const pageCards = Array.from(document.querySelectorAll('[id^="canvas-page-card-"]'));
      if (pageCards.length > 0) {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
        });

        for (let i = 0; i < pageCards.length; i++) {
          const cardEl = pageCards[i];
          const canvasInner = (cardEl.querySelector('#invoice-canvas') || cardEl.querySelector('.shadow-2xl') || cardEl) as HTMLElement;
          const pageClone = canvasInner.cloneNode(true) as HTMLElement;

          pageClone.style.transform = 'none';
          pageClone.style.boxShadow = 'none';
          pageClone.style.margin = '0';
          pageClone.style.padding = '0';
          pageClone.style.width = '595px';
          pageClone.style.height = '842px';
          pageClone.style.position = 'fixed';
          pageClone.style.left = '-9999px';
          pageClone.style.top = '-9999px';
          pageClone.style.background = '#ffffff';

          // Strip UI selection overlays, badges, sticky buttons, outlines, and rings
          pageClone.querySelectorAll<HTMLElement | SVGElement>('*').forEach((el) => {
            const textContent = (el.textContent || '').trim();
            if (
              el.classList?.contains('border-brand-500') ||
              el.classList?.contains('bg-brand-500') ||
              el.classList?.contains('sticky') ||
              el.tagName === 'BUTTON' ||
              (textContent.startsWith('Page ') && el.classList?.contains('rounded-full')) ||
              (textContent.startsWith('PAGES') && el.classList?.contains('rounded-full'))
            ) {
              el.remove();
              return;
            }
            if (el.style) {
              el.style.outline = 'none';
              el.style.boxShadow = 'none';
              if (el.style.borderColor?.includes('brand') || el.style.border?.includes('brand')) {
                el.style.border = 'none';
              }
            }
          });

          document.body.appendChild(pageClone);

          // Google Fonts (Inter/Poppins) load per-weight on first use, so a
          // weight/style combo the live canvas hasn't rendered yet may still
          // be mid-fetch here — html2canvas would then rasterize with
          // fallback-font metrics, which run wider and can wrap a label
          // that fits on one line with the real font, pushing it into the
          // divider line positioned just below it. Wait for every requested
          // weight to finish loading before capturing.
          await document.fonts.ready;

          let canvas: HTMLCanvasElement;
          try { await Promise.all(Array.from(pageClone.querySelectorAll('img')).map(img=>img.decode())); canvas = await withExportFontMetrics(() => html2canvas(pageClone, {
            scale: 2.5,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            width: 595,
            height: 842,
          })); } finally { pageClone.remove(); }

          const imgData = canvas.toDataURL('image/jpeg', 0.98);

          if (i > 0) {
            pdf.addPage('a4', 'portrait');
          }

          // Exact 100% full-bleed A4 fill: 210mm x 297mm from top-left (0,0)
          pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        }

        assertSavedVersion();
        pdf.save(`DocCraft-${chat.documentType || 'Document'}-${Date.now().toString().slice(-4)}.pdf`);
        set({ isExporting: false });
        return;
      }

      // Single canvas fallback
      const canvasEl = document.getElementById('invoice-canvas');
      if (canvasEl) {
        const pageClone = canvasEl.cloneNode(true) as HTMLElement;
        pageClone.style.transform = 'none';
        pageClone.style.boxShadow = 'none';
        pageClone.style.margin = '0';
        pageClone.style.padding = '0';
        pageClone.style.width = '595px';
        pageClone.style.height = '842px';
        pageClone.style.position = 'fixed';
        pageClone.style.left = '-9999px';
        pageClone.style.top = '-9999px';
        pageClone.style.background = '#ffffff';

        pageClone.querySelectorAll<HTMLElement | SVGElement>('*').forEach((el) => {
          if (el.classList && (el.classList.contains('border-brand-500') || el.classList.contains('bg-brand-500'))) {
            el.remove();
          } else if (el.style) {
            el.style.outline = 'none';
            el.style.boxShadow = 'none';
          }
        });

        document.body.appendChild(pageClone);

        await document.fonts.ready;

        let canvas: HTMLCanvasElement;
        try { await Promise.all(Array.from(pageClone.querySelectorAll('img')).map(img=>img.decode())); canvas = await withExportFontMetrics(() => html2canvas(pageClone, {
          scale: 2.5,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
          width: 595,
          height: 842,
        })); } finally { pageClone.remove(); }

        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4',
          compress: true,
        });

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
        assertSavedVersion();
        pdf.save(`DocCraft-${chat.documentType || 'Document'}-${Date.now().toString().slice(-4)}.pdf`);
        set({ isExporting: false });
        return;
      }

      // 2. Fallback to previewHtml
      if (state.previewHtml) {
        const html2pdfModule = await import('html2pdf.js');
        const html2pdf = html2pdfModule.default;

        const container = document.createElement('div');
        container.innerHTML = state.previewHtml;
        container.style.width = state.pageWidth + 'px';
        container.style.background = 'white';
        document.body.appendChild(container);

        const opt = {
          margin: 0,
          filename: `DocCraft-Document-${Date.now().toString().slice(-4)}.pdf`,
          image: { type: 'jpeg' as const, quality: 0.98 },
          html2canvas: { scale: 2.5, useCORS: true, logging: false, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const }
        };

        try {
          const pdf = await withExportFontMetrics(() => html2pdf().set(opt).from(container).toPdf().get('pdf'));
          assertSavedVersion();
          pdf.save(opt.filename);
        } finally { container.remove(); }
        set({ isExporting: false });
        return;
      }

      // 3. Fallback to backend API if documentId exists
      if (state.documentId) {
        const blob = await documentsApi.exportPdf(state.documentId);
        assertSavedVersion();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'DocCraft-Document.pdf';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      if (!state.documentId) throw new Error('There is no document preview to download yet.');
    } catch (err: unknown) {
      if (isCurrent()) set({ error: err instanceof Error ? err.message : 'Failed to export PDF. Please retry Download.' });
    } finally {
      if (isCurrent()) set({ isExporting: false });
    }
  },

  toggleSidebar: () => {
    set((state) => ({ isSidebarOpen: !state.isSidebarOpen }));
  },

  setSidebarOpen: (open: boolean) => {
    set({ isSidebarOpen: open });
  },

  resetDocument: () => {
    clearUploadedDefinitions();
    canvasSession=null; canvasDirty=false;
    if(canvasTimer) clearTimeout(canvasTimer);
    documentGeneration++;
    set({
      documentId: null,
      generationStatus:null,
      previewHtml: null,
      layoutState: null,
      templates: [],
      selectedTemplate: null,
      accentColor: '',
      isGenerating: false,
      isExporting: false,
      isSidebarOpen: false,
      error: null,
      canvasMode: 'template',
  canvasElements: null,
      elementOverrides: {},
      customElements: [],
      selectedElementId: null,
      selectedElementIds: [],
      activeTool: 'select',
      pageSelected: false,
      historyPast: [],
      historyFuture: [],
    });
  },

  // Shift+click, Ctrl+click (Windows/Linux) and Cmd+click (Mac) all pass
  // `additive: true` from the canvas — toggles that element in/out of the
  // current selection instead of replacing it, matching Figma/Canva.
  selectElement: (id: string | null, options?: { additive?: boolean }) => {
    if (id === null) {
      set({ selectedElementId: null, selectedElementIds: [] });
      return;
    }
    if (!options?.additive) {
      set({ selectedElementId: id, selectedElementIds: [id], pageSelected: false });
      return;
    }
    set((state) => {
      const already = state.selectedElementIds.includes(id);
      const nextIds = already ? state.selectedElementIds.filter((x) => x !== id) : [...state.selectedElementIds, id];
      return { selectedElementIds: nextIds, selectedElementId: nextIds.length ? nextIds[nextIds.length - 1] : null, pageSelected: false };
    });
  },

  // Replaces the whole selection outright — used by marquee/rubber-band
  // select (drag a box over empty canvas) and by Select All.
  selectElements: (ids: string[]) => {
    set({ selectedElementIds: ids, selectedElementId: ids.length ? ids[ids.length - 1] : null, pageSelected: false });
  },

  // Double-clicking empty canvas — the page itself becomes the "selection"
  // (mutually exclusive with any element), so the Design panel can show
  // page-level properties (background, grid, size) instead of an element's.
  selectPage: () => {
    set({ pageSelected: true, selectedElementId: null, selectedElementIds: [] });
  },

  setPageSize: (width: number, height: number) => {
    set({ pageWidth: width, pageHeight: height });
  },

  setPageBackgroundColor: (color: string) => {
    set({ pageBackgroundColor: color });
  },

  setShowGrid: (show: boolean) => {
    set({ showGrid: show });
  },

  updateElement: (id: string, patch: Partial<InvoiceElement>) => {
    if ('text' in patch && typeof patch.text === 'string') {
      const text = patch.text;
      void Promise.resolve().then(() => {
        try {const element=get().canvasElements?.find(el=>el.id===id);const field=element?.type==='text'?element.semanticField:undefined;const semantic = field?{[field]:text}:semanticCanvasPatch(id,text,useChatStore.getState().collectedSlots);if(semantic) return useChatStore.getState().updateSemanticFields(semantic);} catch {set({error:'Invalid document value. The edit was not saved.'});}
      });
    }
    set((state) => {
      const isCustom = state.customElements.some((el) => el.id === id);
      const canvasElements = state.canvasElements
        ? state.canvasElements.map((el) => (el.id === id ? ({ ...el, ...patch } as InvoiceElement) : el))
        : null;
      if (isCustom) {
        return {
          canvasElements,
          customElements: state.customElements.map((el) => (el.id === id ? ({ ...el, ...patch } as InvoiceElement) : el)),
        };
      }
      return {
        canvasElements,
        elementOverrides: { ...state.elementOverrides, [id]: { ...state.elementOverrides[id], ...patch } },
      };
    });
  },

  // Same as updateElement but applied to every id in one batch (e.g.
  // dragging a multi-selection as a group) — one set() instead of N.
  updateElements: (ids: string[], patch: Partial<InvoiceElement> | ((id: string) => Partial<InvoiceElement>)) => {
    void Promise.resolve().then(() => {
      const fields: Record<string,unknown> = {};
      for(const id of ids) {const p=typeof patch==='function'?patch(id):patch;if('text' in p && typeof p.text==='string'){const element=get().canvasElements?.find(el=>el.id===id);const field=element?.type==='text'?element.semanticField:undefined;Object.assign(fields,field?{[field]:p.text}:semanticCanvasPatch(id,p.text,{...useChatStore.getState().collectedSlots,...fields})||{});}}
      if(Object.keys(fields).length)return useChatStore.getState().updateSemanticFields(fields);
    }).catch(() => set({error:'Document edit was not saved.'}));
    set((state) => {
      const patchFor = (id: string) => (typeof patch === 'function' ? patch(id) : patch);
      const idSet = new Set(ids);
      const canvasElements = state.canvasElements
        ? state.canvasElements.map((el) => (idSet.has(el.id) ? ({ ...el, ...patchFor(el.id) } as InvoiceElement) : el))
        : null;
      const customIds = new Set(state.customElements.map((el) => el.id));
      const customElements = state.customElements.map((el) => (idSet.has(el.id) ? ({ ...el, ...patchFor(el.id) } as InvoiceElement) : el));
      const elementOverrides = { ...state.elementOverrides };
      for (const id of ids) {
        if (!customIds.has(id)) elementOverrides[id] = { ...elementOverrides[id], ...patchFor(id) };
      }
      return { canvasElements, customElements, elementOverrides };
    });
  },

  addElement: (el: InvoiceElement) => {
    set((state) => ({
      historyPast: [...state.historyPast, { canvasMode:state.canvasMode, elementOverrides: state.elementOverrides, customElements: state.customElements }].slice(-50),
      historyFuture: [],
      customElements: [...state.customElements, el],
      canvasElements: state.canvasElements ? [...state.canvasElements, el] : [el],
      selectedElementId: el.id,
      selectedElementIds: [el.id],
      activeTool: 'select',
    }));


  },

  deleteElement: (id: string) => {
    const chat=useChatStore.getState();
    if(chat.assets?.some(asset=>asset.id===id)) {
      const epoch=documentGeneration;
      void chat.removeDocumentAssets([id]).catch(err=>{if(epoch===documentGeneration)set({error:err instanceof Error?err.message:'The image was not removed. Please retry.'});});
      return;
    }
    set((state) => ({
      historyPast: [...state.historyPast, { canvasMode:state.canvasMode, elementOverrides: state.elementOverrides, customElements: state.customElements }].slice(-50),
      historyFuture: [],
      customElements: state.customElements.filter((el) => el.id !== id),
      canvasElements: state.canvasElements ? state.canvasElements.filter((el) => el.id !== id) : null,
      selectedElementId: state.selectedElementId === id ? null : state.selectedElementId,
      selectedElementIds: state.selectedElementIds.filter((x) => x !== id),
    }));
  },

  deleteElements: (ids: string[]) => {
    const chat=useChatStore.getState(),assetIds=ids.filter(id=>chat.assets?.some(asset=>asset.id===id));
    if(assetIds.length) {
      const epoch=documentGeneration;
      void chat.removeDocumentAssets(assetIds).catch(err=>{if(epoch===documentGeneration)set({error:err instanceof Error?err.message:'The images were not removed. Please retry.'});});
      ids=ids.filter(id=>!assetIds.includes(id));
      if(!ids.length)return;
    }
    set((state) => {
      const idSet = new Set(ids);
      return {
        historyPast: [...state.historyPast, { canvasMode:state.canvasMode, elementOverrides: state.elementOverrides, customElements: state.customElements }].slice(-50),
        historyFuture: [],
        customElements: state.customElements.filter((el) => !idSet.has(el.id)),
        canvasElements: state.canvasElements ? state.canvasElements.filter((el) => !idSet.has(el.id)) : null,
        selectedElementId: state.selectedElementId && idSet.has(state.selectedElementId) ? null : state.selectedElementId,
        selectedElementIds: state.selectedElementIds.filter((x) => !idSet.has(x)),
      };
    });
  },

  setActiveTool: (tool: CanvasTool) => {
    set({ activeTool: tool });
  },

  // Called once at the START of a continuous gesture (drag, resize) or
  // before a discrete style/keyboard edit — NOT on every intermediate
  // update, or a single drag would produce hundreds of undo steps.
  checkpointHistory: () => {
    set((state) => ({
      historyPast: [...state.historyPast, { canvasMode:state.canvasMode, elementOverrides: state.elementOverrides, customElements: state.customElements }].slice(-50),
      historyFuture: [],
    }));
  },

  undo: (data: Record<string, unknown>) => {
    if(!isDemoMode()&&useChatStore.getState().sessionId){void flushCanvasLayout().then(()=>useChatStore.getState().sendMessage('Undo that.')).catch(()=>set({error:'Save the current canvas before undoing.'}));return;}
    const state = get();
    if (state.historyPast.length === 0) return;
    const previous = state.historyPast[state.historyPast.length - 1];
    const currentSnapshot = { canvasMode:state.canvasMode, elementOverrides: state.elementOverrides, customElements: state.customElements };
    set({
      historyPast: state.historyPast.slice(0, -1),
      historyFuture: [currentSnapshot, ...state.historyFuture],
      canvasMode: previous.canvasMode||'template',
      elementOverrides: previous.elementOverrides,
      customElements: previous.customElements,
      canvasElements: computeCanvasElements(state.selectedTemplate, data, state.accentColor, previous.elementOverrides, previous.customElements,undefined,previous.canvasMode||'template'),
      selectedElementId: null,
      selectedElementIds: [],
    });
  },

  redo: (data: Record<string, unknown>) => {
    if(!isDemoMode()&&useChatStore.getState().sessionId){void flushCanvasLayout().then(()=>useChatStore.getState().sendMessage('Redo that.')).catch(()=>set({error:'Save the current canvas before redoing.'}));return;}
    const state = get();
    if (state.historyFuture.length === 0) return;
    const next = state.historyFuture[0];
    const currentSnapshot = { canvasMode:state.canvasMode, elementOverrides: state.elementOverrides, customElements: state.customElements };
    set({
      historyFuture: state.historyFuture.slice(1),
      historyPast: [...state.historyPast, currentSnapshot],
      canvasMode: next.canvasMode||'template',
      elementOverrides: next.elementOverrides,
      customElements: next.customElements,
      canvasElements: computeCanvasElements(state.selectedTemplate, data, state.accentColor, next.elementOverrides, next.customElements,undefined,next.canvasMode||'template'),
      selectedElementId: null,
      selectedElementIds: [],
    });
  },

  refreshCanvasElements: (data: Record<string, unknown>) => {
    const state = get();
    const docType = (data.documentType as DocumentType) || 'invoice';
    const templateId = state.selectedTemplate || 'tmpl_invoice_2023_01';
    const merged = { documentType: docType, ...data };
    if(state.canvasMode!=='literal'&&templateId.startsWith('upl_')) {
      const cleanOverrides={...state.elementOverrides};
      for(const id of Object.keys(cleanOverrides))if(id.startsWith('upl_field_')||id.startsWith('item_')){
        const {text:ignored,...presentation}=cleanOverrides[id] as Partial<InvoiceElement>&{text?:string};
        void ignored;
        cleanOverrides[id]=presentation as Partial<InvoiceElement>;
      }
      if(uploadedDefinition(templateId)) {
        uploadedPreviewSequence++; // A cached field update supersedes older in-flight previews.
        set({elementOverrides:cleanOverrides,error:null,canvasElements:computeCanvasElements(templateId,merged,state.accentColor,cleanOverrides,state.customElements)});
        return;
      }
      const epoch=documentGeneration,previewSequence=++uploadedPreviewSequence;
      set({canvasElements:null,error:null,elementOverrides:cleanOverrides});
      void documentsApi.getUploadedPreview(templateId,merged).then(preview=>{if(epoch===documentGeneration&&previewSequence===uploadedPreviewSequence&&get().selectedTemplate===templateId)set(applyUploadedPreview(templateId,preview,merged));}).catch(error=>{if(epoch===documentGeneration&&previewSequence===uploadedPreviewSequence&&get().selectedTemplate===templateId)set({error:error instanceof Error?error.message:'Uploaded template preview unavailable'});});
      return;
    }

    // Strip text overrides from data-driven elements so fresh AI slot updates aren't shadowed by old clicks
    const cleanOverrides = { ...state.elementOverrides };
    for (const id of Object.keys(cleanOverrides)) {
      if(id==='header_title'||id.startsWith('lbl_')||id.endsWith('_label'))continue;
      if (id.startsWith('totals_') || id.startsWith('item_') || id.startsWith('meta_') || id.startsWith('client_') || id.startsWith('sender_') || id.startsWith('header_')) {
        const itemOverride = cleanOverrides[id];
        if (itemOverride && 'text' in itemOverride && itemOverride.text !== undefined) {
          const rest = { ...itemOverride };
          delete rest.text;
          if (Object.keys(rest).length === 0) delete cleanOverrides[id];
          else cleanOverrides[id] = rest;
        }
      }
    }

    set({
      elementOverrides: cleanOverrides,
      canvasElements: computeCanvasElements(templateId, merged, state.accentColor, cleanOverrides, state.customElements, docType),
      previewHtml: renderTemplate(templateId, merged, state.layoutState, state.accentColor, docType),
    });
  },

  // "Shift to default layout" — discards every manual move/resize/restyle
  // and added shape/text, restoring the template's original Figma layout.
  resetElementLayout: (data: Record<string, unknown>) => {
    const state = get();
    set({
      // "Default layout" is itself undo-able — checkpoint rather than wipe.
      historyPast: [...state.historyPast, { canvasMode:state.canvasMode, elementOverrides: state.elementOverrides, customElements: state.customElements }].slice(-50),
      historyFuture: [],
      canvasMode: 'template',
      elementOverrides: {},
      customElements: [],
      selectedElementId: null,
      selectedElementIds: [],
      pageSelected: false,
      canvasElements: computeCanvasElements(state.selectedTemplate, data, state.accentColor, {}, [], undefined, 'template'),
    });
  },
}),
{
  name: 'doccraft-document-storage',
  // Template definitions live in code (utils/templateRenderer.ts) and change
  // as that file changes — never persist them, or a stale localStorage
  // snapshot from a previous session permanently shadows new templates.
  partialize: (state) => {
    // canvasElements/elementOverrides/customElements are all derived or
    // session-scoped editing state — never persist them, or a stale drag
    // from an earlier session survives a reload and "Reset to default
    // layout" would have nothing real to reset back to. Same reasoning as
    // excluding `templates`.
    const excluded = new Set(['canvasMode', 'templates', 'canvasElements', 'elementOverrides', 'customElements', 'selectedElementId', 'selectedElementIds', 'historyPast', 'historyFuture', 'uploadedAssets', 'pageSelected']);
    const rest = Object.fromEntries(Object.entries(state).filter(([key]) => !excluded.has(key)));
    return rest;
  },
  // Zustand's default merge lets any of these keys survive from an *older*
  // localStorage snapshot (written before the exclusions above existed) by
  // overlaying persistedState onto the fresh initial state. Strip them
  // explicitly so a stale drag can never come back from a previous session.
  merge: (persistedState, currentState) => {
    const persisted = { ...(persistedState as Partial<DocumentState>) };
    delete persisted.canvasMode;
    delete persisted.canvasElements;
    delete persisted.elementOverrides;
    delete persisted.customElements;
    delete persisted.selectedElementId;
    delete persisted.selectedElementIds;
    delete persisted.pageSelected;
    delete persisted.historyPast;
    delete persisted.historyFuture;
    delete persisted.templates;
    delete persisted.uploadedAssets;
    return { ...currentState, ...persisted };
  },
}
));

// Save presentation changes per authenticated session. Definitions and other
// accounts' editing state never come from a global localStorage snapshot.
useDocumentStore.subscribe((state,previous)=>{
  if(restoringCanvas || !canvasSession || useChatStore.getState().sessionId!==canvasSession || isDemoMode() || useChatStore.getState().readOnly) return;
  if(state.canvasMode===previous.canvasMode && state.elementOverrides===previous.elementOverrides && state.customElements===previous.customElements && state.pageWidth===previous.pageWidth && state.pageHeight===previous.pageHeight && state.pageBackgroundColor===previous.pageBackgroundColor&&state.selectedElementIds===previous.selectedElementIds) return;
  // Rebuilding the canvas from a saved snapshot creates fresh objects. Do not
  // turn an identical presentation into an endless save/reconcile/render loop.
  if(state.canvasMode===previous.canvasMode && state.pageWidth===previous.pageWidth && state.pageHeight===previous.pageHeight && state.pageBackgroundColor===previous.pageBackgroundColor && JSON.stringify(state.elementOverrides)===JSON.stringify(previous.elementOverrides) && JSON.stringify(state.customElements)===JSON.stringify(previous.customElements)&&JSON.stringify(state.selectedElementIds)===JSON.stringify(previous.selectedElementIds)) return;
  canvasDirty=true;
  if(canvasTimer) clearTimeout(canvasTimer);
  canvasTimer=setTimeout(()=>{void flushCanvasLayout().catch(()=>{});},700);
});
