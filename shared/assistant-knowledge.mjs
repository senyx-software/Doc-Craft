const KNOWLEDGE_BASE = [
  {
    patterns: [/\bwhat is doccraft\b/i, /\babout doccraft\b/i],
    answer: "DocCraft is an intelligent document creation and management platform for invoices, quotes, receipts, and business documents."
  },
  {
    patterns: [/\bhow (?:do|can) I export (?:to )?pdf\b/i, /\bdownload pdf\b/i],
    answer: "You can export your document as a PDF using the 'Download PDF' or 'Export' button in the document preview panel."
  },
  {
    patterns: [/\bhow (?:do|can) I (?:add|upload) (?:a )?logo\b/i],
    answer: "You can upload a logo PNG directly via the image upload tool in the editor, or paste an image into the document canvas."
  },
  {
    patterns: [/\bwhat document types (?:are supported|can I create)\b/i],
    answer: "DocCraft supports Invoices, Quotations, Receipts, Purchase Orders, and Delivery Notes."
  }
];

export function localKnowledge(message) {
  if (typeof message !== 'string') return null;
  const trimmed = message.trim();
  for (const item of KNOWLEDGE_BASE) {
    if (item.patterns.some(pattern => pattern.test(trimmed))) {
      return item.answer;
    }
  }
  return null;
}
