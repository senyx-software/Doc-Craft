import { documentData, validField } from '../../../shared/document-contract.mjs';
import {formatDate,formatMoney} from '../../../shared/field-processing.mjs';

export function escapeDocumentText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Legacy templates transform their labels after interpolation. Bind text to opaque tokens
// until that transformation finishes so literal company names, addresses and service text
// cannot be rewritten as labels or interpreted as template HTML.
export function bindDocumentText(input: Record<string, unknown>) {
  const canonical=documentData(input);
  const normalized: Record<string, unknown> = { ...input, ...canonical,currencySymbol:canonical.currencySymbol||'' };
  for (const field of ['currency', 'issueDate', 'dueDate']) {
    if (normalized[field] !== undefined && !validField(field, normalized[field])) normalized[field] = '';
  }
  for(const field of ['issueDate','dueDate'])if(typeof normalized[field]==='string')normalized[field]=formatDate(normalized[field] as string,normalized.dateFormat as string);
  if(canonical.paymentTerms)normalized.notesAndTerms=[normalized.notesAndTerms,`Payment terms: ${canonical.paymentTerms}`].filter(Boolean).join('\n');
  if(Array.isArray(canonical.lineItems))normalized.lineItems=canonical.lineItems.map((item: { description: string; discountRate?: number })=>({...item,description:item.description+((item.discountRate ?? 0)>0?` (${item.discountRate}% discount)`:'')}));
  if(canonical.discountAmount>0)normalized.notesAndTerms=[normalized.notesAndTerms,`Discount${canonical.discountFixedAmount!==undefined?' (fixed)':` (${canonical.discountRate}%)`}: ${canonical.currency||''} ${formatMoney(canonical.discountAmount,canonical.currency,canonical.locale)}.`].filter(Boolean).join('\n');
  let prefix = '__DOCCRAFT_VALUE_';
  const original = JSON.stringify(normalized);
  while (original.includes(prefix)) prefix += '_';
  const values = new Map<string, string>();
  const visit = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string' && !['documentType', 'currency', 'currencySymbol', 'issueDate', 'dueDate','locale','dateFormat'].includes(key)) {
      if (!value) return '';
      const token = prefix + values.size + '__';
      values.set(token, value);
      return token;
    }
    if (Array.isArray(value)) return value.map(entry => visit(entry));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v, k)]));
    return value;
  };
  return {
    data: visit(normalized) as Record<string, unknown>,
    restore: (text: string, html = false) => {
      for (const [token, value] of values) text = text.split(token).join(html ? escapeDocumentText(value).replace(/\n/g, '<br/>') : value);
      return text;
    },
  };
}
