export const languageToolSchema = {
  type: 'object',
  properties: {
    suggested: { type: 'string', description: 'The corrected text with spelling and grammar fixed.' },
    field: { type: ['string', 'null'], description: 'The target field name (notesAndTerms, subject) or null if unassigned.' },
    original: { type: 'string', description: 'The original uncorrected text snippet.' },
    explanation: { type: 'string', description: 'Brief explanation of the correction.' }
  },
  required: ['suggested'],
  additionalProperties: false
};

export function validateLanguageCorrection(input, state, message, mode = 'suggest') {
  if (!input || typeof input !== 'object') {
    throw Object.assign(new Error('Invalid language correction proposal'), { code: 'TOOL_SCHEMA_INVALID', statusCode: 422 });
  }
  const raw = input;
  const suggested = typeof raw.suggested === 'string' ? raw.suggested.trim() : '';
  if (!suggested) {
    throw Object.assign(new Error('Suggested text is required'), { code: 'TOOL_SCHEMA_INVALID', statusCode: 422 });
  }
  const field = (raw.field === 'notesAndTerms' || raw.field === 'subject') ? raw.field : null;
  const previousValue = field && state?.slots ? state.slots[field] : undefined;
  const question = `Would you like to use this corrected wording: "${suggested}"?`;
  return {
    suggested,
    field,
    previousValue,
    question,
    automatic: mode === 'auto',
    editingSaved: !!(field && previousValue !== undefined)
  };
}

export function commonLanguageProposal(message, state) {
  if (typeof message !== 'string') return null;
  const text = message.trim();
  const match = text.match(/(?:fix|correct|proofread|improve|rewrite)\s+(?:the\s+)?(?:grammar|spelling|text|wording)\s*(?:in|for|:)?\s*(.*)/i);
  if (match && match[1]?.trim()) {
    const suggested = match[1].trim();
    const field = /\bnotes?\b/i.test(text) ? 'notesAndTerms' : /\bsubject\b/i.test(text) ? 'subject' : null;
    return { suggested, field };
  }
  return null;
}
