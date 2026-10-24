export interface EditorElement {
  id: string;
  type: string;
  label?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  fontSize?: number;
  fontWeight?: number;
  [key: string]: unknown;
}

export interface EditorContext {
  selectedIds: string[];
  elements: EditorElement[];
}

export interface EditorOperation {
  targetId?: string;
  action: 'style' | 'move' | 'resize' | 'remove' | 'add';
  patch?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface EditorResolution {
  operations: EditorOperation[];
  clarification?: string | null;
  pending?: unknown;
  remaining: string;
  effectiveMessage?: string;
}

export function editorContext(input: unknown): EditorContext;
export function historySnapshot(session: any): any;
export function recordHistory(meta: any, session: any, turnId: string): void;
export const editorToolSchema: Record<string, unknown>;
export function applyEditorOperations(
  canvasLayout: any,
  editorContext: any,
  operations: any[],
  message: string,
  turnId: string
): { layout: any; context: any; response: string };
export function resolveEditorCommand(message: string, state: any): EditorResolution;
