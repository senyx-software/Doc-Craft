import { metadata } from './conversation-state.mjs';

export function editorContext(input) {
  if (!input || typeof input !== 'object') {
    return { selectedIds: [], elements: [] };
  }
  const raw = input;
  const selectedIds = Array.isArray(raw.selectedIds)
    ? raw.selectedIds.filter(id => typeof id === 'string')
    : [];
  const elements = Array.isArray(raw.elements)
    ? raw.elements.filter(el => el && typeof el === 'object' && typeof el.id === 'string' && typeof el.type === 'string')
    : [];
  return { selectedIds, elements };
}

export function historySnapshot(session) {
  const meta = metadata(session?.slots);
  return {
    slots: structuredClone(session?.slots || {}),
    templateId: session?.templateId,
    accentColor: session?.accentColor,
    meta: structuredClone(meta || {})
  };
}

export function recordHistory(meta, session, turnId) {
  if (!meta.documentHistory) {
    meta.documentHistory = { past: [], future: [] };
  }
  meta.documentHistory.past = meta.documentHistory.past || [];
  meta.documentHistory.past.push({ turnId, state: historySnapshot(session) });
  if (meta.documentHistory.past.length > 50) {
    meta.documentHistory.past.shift();
  }
  meta.documentHistory.future = [];
}

export const editorToolSchema = {
  type: 'object',
  properties: {
    operations: {
      type: 'array',
      description: 'Canvas styling and layout operations',
      items: {
        type: 'object',
        properties: {
          targetId: { type: 'string' },
          action: { type: 'string', enum: ['style', 'move', 'resize', 'remove', 'add'] },
          patch: { type: 'object' }
        },
        required: ['action']
      }
    }
  },
  required: ['operations'],
  additionalProperties: false
};

export function applyEditorOperations(canvasLayout, editorContext, operations, message, turnId) {
  const layout = canvasLayout ? structuredClone(canvasLayout) : {
    canvasMode: 'template',
    elementOverrides: {},
    customElements: [],
    pageWidth: 794,
    pageHeight: 1123,
    pageBackgroundColor: '#ffffff'
  };
  layout.elementOverrides = layout.elementOverrides || {};
  layout.customElements = Array.isArray(layout.customElements) ? layout.customElements : [];

  if (Array.isArray(operations)) {
    for (const op of operations) {
      if (!op || typeof op !== 'object') continue;
      const targetId = op.targetId || (editorContext?.selectedIds?.length === 1 ? editorContext.selectedIds[0] : null);
      if (op.action === 'style' && targetId) {
        layout.elementOverrides[targetId] = { ...(layout.elementOverrides[targetId] || {}), ...(op.patch || {}) };
      } else if (op.action === 'move' && targetId && op.patch) {
        layout.elementOverrides[targetId] = { ...(layout.elementOverrides[targetId] || {}), x: op.patch.x, y: op.patch.y };
      } else if (op.action === 'resize' && targetId && op.patch) {
        layout.elementOverrides[targetId] = { ...(layout.elementOverrides[targetId] || {}), w: op.patch.w, h: op.patch.h };
      } else if (op.action === 'remove' && targetId) {
        layout.customElements = layout.customElements.filter(el => el.id !== targetId);
        layout.elementOverrides[targetId] = { ...(layout.elementOverrides[targetId] || {}), hidden: true };
      } else if (op.action === 'add' && op.patch) {
        layout.customElements.push(op.patch);
      }
      if (op.elementOverrides) {
        Object.assign(layout.elementOverrides, op.elementOverrides);
      }
      if (Array.isArray(op.customElements)) {
        layout.customElements = op.customElements;
      }
    }
  }

  return {
    layout,
    context: editorContext || { selectedIds: [], elements: [] },
    response: 'Updated canvas styling.'
  };
}

export function resolveEditorCommand(message, state) {
  if (typeof message !== 'string') {
    return { operations: [], clarification: null, remaining: '', pending: null, effectiveMessage: '' };
  }
  const text = message.trim();
  const selectedIds = state?.editorContext?.selectedIds || [];
  const isHeading = /\b(?:heading|title)\b/i.test(text);

  let targetId = null;
  if (isHeading) {
    targetId = 'header_title';
  } else if (selectedIds.length === 1) {
    targetId = selectedIds[0];
  } else if (selectedIds.length > 1 && /\b(?:make|change|set|style|color|colour|bold|italic|font)\b/i.test(text)) {
    return {
      operations: [],
      clarification: 'Multiple elements are selected. Please select one element to modify.',
      pending: { message: text },
      remaining: text,
      effectiveMessage: text
    };
  }

  if (targetId) {
    const isBold = /\b(?:bold|bolder|strong)\b/i.test(text) && /\b(?:make|set|change)\b/i.test(text);
    const isItalic = /\b(?:italic|italics|slanted)\b/i.test(text) && /\b(?:make|set|change)\b/i.test(text);
    if (isBold) {
      return {
        operations: [{ targetId, action: 'style', patch: { fontWeight: 700 } }],
        clarification: null,
        remaining: '',
        effectiveMessage: text
      };
    }
    if (isItalic) {
      return {
        operations: [{ targetId, action: 'style', patch: { fontStyle: 'italic' } }],
        clarification: null,
        remaining: '',
        effectiveMessage: text
      };
    }
  }

  return {
    operations: [],
    clarification: null,
    remaining: text,
    pending: null,
    effectiveMessage: text
  };
}
