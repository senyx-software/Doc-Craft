/**
 * Document Generation API endpoints
 * Maps to: POST /documents/generate, PATCH /documents/{id}/layout,
 *          PATCH /documents/{id}/content, GET /templates, POST /documents/{id}/export/pdf
 */

import { post, patch, get, apiRequest } from './client';
import type {EditableTemplateDefinition} from '../utils/uploadedTemplateElements';
import type {
  GenerateDocumentRequest,
  GenerateDocumentResponse,
  LayoutUpdateRequest,
  LayoutUpdateResponse,
  ContentUpdateRequest,
  ContentUpdateResponse,
  TemplatesResponse,
  DocumentType,
  AISummaryResponse,
} from '../types';

/** POST /document/preview — Render live HTML preview */
export function generateDocument(data: GenerateDocumentRequest): Promise<GenerateDocumentResponse> {
  return post<{documentId:string;jobId:string;status:string}>('/documents/generate', {
    operationId:data.operation_id,expectedRevision:data.expected_revision,sessionId:data.session_id,documentType:data.document_type,templateId:data.template_id,slots:data.data,
  }).then(response => ({document_id:response.documentId,job_id:response.jobId,status:response.status}));
}

/** PATCH /documents/{id}/layout — Update layout/formatting */
export function updateLayout(documentId: string, data: LayoutUpdateRequest): Promise<LayoutUpdateResponse> {
  return patch<LayoutUpdateResponse>(`/documents/${documentId}/layout`, data);
}

/** PATCH /documents/{id}/content — Update data content fields */
export function updateContent(documentId: string, data: ContentUpdateRequest): Promise<ContentUpdateResponse> {
  return patch<ContentUpdateResponse>(`/documents/${documentId}/content`, data);
}

/** GET /document/templates?document_type=... — Get available templates */
export function getTemplates(documentType: DocumentType): Promise<TemplatesResponse> {
  return get<TemplatesResponse>(`/document/templates?type=${documentType}`).catch(() => {
    return get<TemplatesResponse>(`/templates?document_type=${documentType}`);
  });
}

export function getAvailableTemplateIds(documentType: DocumentType): Promise<{templates:Array<{id:string;name:string;premium?:boolean;available?:boolean;created_at?:string;owner_id?:string;visibility?:'private'|'public';can_rename?:boolean}>}> {
  return get(`/document/templates?type=${encodeURIComponent(documentType)}`);
}

/** GET /chat/sessions — Get document history from database */
export interface UserDocumentSession {
  id: string; title: string; documentTypeId: string; createdAt: string;
  status: string; slots: Record<string, unknown>;
}
export function getUserDocuments(): Promise<{ sessions: UserDocumentSession[] }> {
  return get<{ sessions: UserDocumentSession[] }>('/chat/sessions');
}

/** GET /chat/session/:sessionId/messages — Get session & slot details from database */
export function getSessionDetails(sessionId: string): Promise<AISummaryResponse> {
  return get<AISummaryResponse>(`/chat/session/${sessionId}/messages`);
}

export interface CustomTemplateSummary {
  id: string;
  name: string;
  documentType: string;
  pageWidth: number | null;
  pageHeight: number | null;
  pageBackgroundColor: string | null;
  createdAt: string;
}

export interface CustomTemplateDetail extends CustomTemplateSummary {
  canvasElements: unknown[];
}

/** POST /document/templates/custom — Save the current Builder canvas as a reusable template */
export function saveCustomTemplate(payload: {
  name: string;
  documentType: string;
  canvasElements: unknown[];
  pageWidth?: number;
  pageHeight?: number;
  pageBackgroundColor?: string;
}): Promise<CustomTemplateDetail> {
  return post<CustomTemplateDetail>('/document/templates/custom', payload);
}

/** GET /document/templates/custom?type=... — List the current user's saved templates */
export function getCustomTemplates(documentType: string): Promise<{ templates: CustomTemplateSummary[] }> {
  return get<{ templates: CustomTemplateSummary[] }>(`/document/templates/custom?type=${documentType}`);
}

/** GET /document/templates/custom/{id} — Fetch a saved template's full canvasElements */
export function getCustomTemplateDetail(id: string): Promise<CustomTemplateDetail> {
  return get<CustomTemplateDetail>(`/document/templates/custom/${id}`);
}

/** DELETE /document/templates/custom/{id} */
export function deleteCustomTemplate(id: string): Promise<{ success: boolean }> {
  return apiRequest<{ success: boolean }>(`/document/templates/custom/${id}`, { method: 'DELETE' });
}

export function renameCustomTemplate(id:string,name:string):Promise<{id:string;name:string}> {
  return patch(`/document/templates/custom/${encodeURIComponent(id)}`,{name});
}

export function renameUploadedTemplate(id:string,name:string):Promise<{id:string;name:string}> {
  return patch(`/document/templates/uploads/${encodeURIComponent(id)}`,{name});
}

/** POST /document/generate — Generate and download PDF */
export function exportPdf(documentId: string): Promise<Blob> {
  return apiRequest<Blob>(`/document/${encodeURIComponent(documentId)}/download`,{responseType:'blob'});
}

export function getDocumentStatus(id: string): Promise<{status:string;errorMessage?:string}> {return get('/documents/'+encodeURIComponent(id));}

export function getUploadedPreview(templateId:string,slots:Record<string,unknown>):Promise<{html:string;canvasDefinition:EditableTemplateDefinition}> {
  return post('/document/template-preview',{templateId,slots});
}
export function uploadPrivateTemplate(payload:Record<string,unknown>):Promise<{id:string}> {
  return post('/document/templates/uploads',payload);
}
