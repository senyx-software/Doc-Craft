export type DocumentType = 'invoice' | 'quotation' | 'proposal' | 'receipt' | 'purchase_order';
export type DocumentStatus = 'draft' | 'exported';
export type TemplateTier = 'free' | 'pro';

export type Alignment = 'left' | 'center' | 'right';
export type FontSize = 'small' | 'medium' | 'large';

export interface LineItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface LayoutState {
  headerAlignment: Alignment;
  fontSize: FontSize;
  fontFamily?: string;
  showLogo: boolean;
  showNotes: boolean;
  bold?: boolean;
  logoUrl?: string;
  sectionOrder?: string[];
  [key: string]: unknown;
}

export interface GenerateDocumentRequest {
  session_id: string;
  document_type: DocumentType;
  template_id: string;
  accent_color: string;
  data: Record<string, unknown>;
}

export interface GenerateDocumentResponse {
  document_id: string;
  preview_html: string;
  layout_state: LayoutState;
}

export interface LayoutUpdateRequest {
  section: string;
  controls: Record<string, unknown>;
}

export interface LayoutUpdateResponse {
  document_id: string;
  updated_preview_html: string;
  layout_state: LayoutState;
}

export interface ContentUpdateRequest {
  slot: string;
  value: unknown;
}

export interface ContentUpdateResponse {
  document_id: string;
  updated_slot: string;
  updated_preview_html: string;
}

export interface Template {
  template_id: string;
  name: string;
  thumbnail_url: string;
  tier: TemplateTier;
}

export interface TemplatesResponse {
  templates: Template[];
}

export interface DocumentTypeInfo {
  type: DocumentType;
  label: string;
  description: string;
  icon: string;
}
