import type { DocumentType } from './document.types';

export type ChatStatus = 'ok' | 'spell_correction_pending' | 'validation_error' | 'complete';

export interface ChatMessage {
  role: 'assistant' | 'user';
  content: string;
}

export interface SpellCorrection {
  original: string;
  suggested: string;
  field: string;
  confidence: number;
}

export interface ValidationError {
  field: string;
  field_label: string;
  expected_type: string;
  received_value: string;
  hint: string;
}

export interface SchemaSummary {
  total_fields: number;
  required_fields: number;
  optional_fields: number;
  computed_fields: string[];
  required_keys: string[];
}

export interface SessionStartRequest {
  document_type: DocumentType;
}

export interface SessionStartResponse {
  session_id: string;
  document_type: DocumentType;
  opening_message: string;
  schema_summary: SchemaSummary;
  collected_slots: Record<string, unknown>;
  pending_required: string[];
  pending_optional: string[];
}

export interface ChatRequest {
  session_id: string;
  document_type: DocumentType;
  current_field: string;
  message: string;
  conversation_history: ChatMessage[];
}

export interface ChatResponse {
  session_id: string;
  current_field: string | null;
  status: ChatStatus;
  ai_message: string;
  spell_corrections?: SpellCorrection[];
  validation_error?: ValidationError | null;
  collected_slots: Record<string, unknown>;
  pending_required: string[];
  pending_optional?: string[];
  ready_to_generate: boolean;
}

export interface CorrectionConfirmRequest {
  session_id: string;
  field: string;
  original_value: string;
  suggested_value: string;
  accept: boolean;
}

export interface CorrectionConfirmResponse {
  session_id: string;
  field: string;
  saved_value: string;
  accepted_correction: boolean;
  next_field: string;
  ai_message: string;
  collected_slots: Record<string, unknown>;
  pending_required: string[];
}

export interface MissingFieldsRequest {
  session_id: string;
  document_type: DocumentType;
}

export interface MissingField {
  key: string;
  label: string;
  type: string;
  example?: string;
}

export interface MissingFieldsResponse {
  session_id: string;
  document_type: DocumentType;
  collected_count: number;
  total_required: number;
  completion_percent: number;
  missing_required: MissingField[];
  missing_optional: MissingField[];
  ready_to_generate: boolean;
}

export interface AISummaryResponse {
  session_id: string;
  summary: string;
  collected_data: Record<string, unknown>;
  missing_optional: string[];
  ready_to_generate: boolean;
}
