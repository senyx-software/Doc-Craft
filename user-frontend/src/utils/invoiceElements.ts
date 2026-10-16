import { formatMoney } from '../../../shared/field-processing.mjs';
import { bindDocumentText } from './documentValues';
import { documentData,validField,formatDocumentMoney } from '../../../shared/document-contract.mjs';
import type { InvoiceElement, ShapeElement, TextElement } from '../types/canvasElement';
import { transformDocTypeText } from './templateRenderer';

/* ============================================
   Element-model migrations — real Figma-measured layouts expressed as
   InvoiceElement[] instead of an HTML string, so the canvas can select,
   drag, resize and restyle each piece individually.

   Element ids are stable, human-readable keys (not counters) so that a
   user's manual move/resize/restyle survives a data refresh — the store
   re-runs this on every keystroke but re-applies saved overrides by id.

   Only templates listed in ELEMENT_MODEL_TEMPLATE_IDS have a migration;
   everything else still renders through templateRenderer's HTML path
   until it's migrated too — see BuilderPage for the fallback logic.
   ============================================ */

interface InvoiceData {
  businessName?: string;
  senderEmail?: string;
  senderAddress?: string;
  senderPhone?: string;
  clientName?: string;
  clientEmail?: string;
  clientAddress?: string;
  clientPhone?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  subject?: string;
  referenceNumber?: string;
  taxRate?: number;
  taxAmount?: number;
  subtotal?: number;
  totalDue?: number;
  notesAndTerms?: string;
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  currency?: string; currencySymbol?: string; locale?: string; documentType?: string;
  [key: string]: unknown;
}

export function normalizeInvoiceData(data: Record<string, unknown>): Record<string, unknown> {
  const normalized={...data,...documentData(data)};
  return normalized;
}

function computeTotals(data: InvoiceData) {
  const normalized=documentData(data);
  const lineItems: NonNullable<InvoiceData['lineItems']> = validField('lineItems',normalized.lineItems)?normalized.lineItems:[];
  const subtotal=normalized.subtotal??0,taxRate=normalized.taxRate??0,taxAmount=normalized.taxAmount??0,totalDue=normalized.totalDue??0;
  return {lineItems,subtotal,taxRate,taxAmount,totalDue};
}

export function autoFontSize(textStr: string, baseSize = 12): number {
  if (!textStr) return baseSize;
  const len = String(textStr).length;
  if (len > 24) return Math.max(7, baseSize - 7);
  if (len > 20) return Math.max(8, baseSize - 6);
  if (len > 16) return Math.max(8, baseSize - 4);
  if (len > 13) return Math.max(9, baseSize - 3);
  if (len > 11) return Math.max(9, baseSize - 2);
  return baseSize;
}

export function stripMarkdownText(text: string): string {
  if (!text) return '';
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^(#+\s*|-\s*)/gm, '');
}

export function getCurrencySymbol(data: InvoiceData): string {
  if (data?.currencySymbol) return String(data.currencySymbol);
  if (data?.currency) {
    const c = String(data.currency).trim().toLowerCase();
    if (/^(lkr|sri\s*lankan\s*rupees?|rs\.?|rupees?)$/i.test(c)) return 'Rs. ';
    if (/^(usd|dollar|dollars|\$)$/i.test(c)) return '$';
    if (/^(eur|euro|euros|€)$/i.test(c)) return '€';
    if (/^(gbp|pound|pounds|£)$/i.test(c)) return '£';
    if (/^(inr|indian\s*rupees?|₹)$/i.test(c)) return '₹';
    if (/^(aud|cad|nzd)\$?$/i.test(c)) return '$';
    if (/^(yen|jpy|cny|rmb|¥)$/i.test(c)) return '¥';
    return String(data.currency).trim() + ' ';
  }
  return '';
}

export function getCurrencyCode(data: InvoiceData): string {
  if (data?.currency) {
    const c = String(data.currency).trim().toUpperCase();
    if (/^(RS|RUPEES|RS\.|LKR)$/i.test(c)) return 'LKR';
    return c;
  }
  return '';
}

function money(n: number, symbolOrData?: string | InvoiceData): string {
  let sym = '';
  if (typeof symbolOrData === 'string') {
    sym = symbolOrData;
  } else if (symbolOrData && typeof symbolOrData === 'object') {
    sym = getCurrencySymbol(symbolOrData);
  }
  if(typeof symbolOrData==='object'&&(!validField('lineItems',symbolOrData.lineItems)||!validField('currency',symbolOrData.currency)))return '';
  const num = typeof n === 'number' && !isNaN(n) ? n : 0;
  return `${sym}${formatMoney(num,typeof symbolOrData==='object'?symbolOrData.currency:undefined,typeof symbolOrData==='object'?symbolOrData.locale:undefined)}`;
}

function text(id: string, partial: Omit<TextElement, 'id' | 'type'>): InvoiceElement {
  return { id, type: 'text', ...partial };
}

function line(id: string, partial: Omit<ShapeElement, 'id' | 'type'>): InvoiceElement {
  return { id, type: 'line', ...partial };
}

function rect(id: string, partial: Omit<ShapeElement, 'id' | 'type'>): InvoiceElement {
  return { id, type: 'rect', ...partial };
}

/**
 * Prevents a layout section block from starting in the bottom page margin (collision zone) of an A4 page.
 * If a block extends past pageHeight - bottomMargin (e.g. 750px), it moves cleanly to the top of the next page card.
 */
export function fitBlockY(y: number, blockHeight = 40, pageHeight = 842, bottomMargin = 130, topMargin = 40): number {
  const yInPage = y % pageHeight;
  if (yInPage + blockHeight > pageHeight - bottomMargin) {
    const pageNum = Math.floor(y / pageHeight);
    return (pageNum + 1) * pageHeight + topMargin;
  }
  return y;
}

/**
 * Calculates dynamic footer Y position so it ALWAYS stays below all document content (items, totals, notes)
 * and pins cleanly to the bottom of the last page.
 */
export function calculateFooterY(lastContentY: number, pageHeight = 842, defaultFooterY = 780): number {
  const lastY = lastContentY + 36;
  const pageIndex = Math.floor(lastY / pageHeight);
  const minPageBottom = pageIndex * pageHeight + defaultFooterY;
  return Math.max(minPageBottom, lastY + 16);
}

// ── Invoice 1 (2023) — orange accent, real Figma coordinates ──
export function getInvoice2023_01Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 42;

  const els: InvoiceElement[] = [
    // x:32 flush-left, matching the static HTML fallback — this used to be
    // offset to x:100 to clear a logo mark that rendered by default, but the
    // canvas no longer auto-inserts a logo placeholder (only an uploaded one
    // shows), so the offset was stale and drifted the header right of where
    // the static preview (and the other 13 templates) place it.
    text('header_name', { x: 32, y: 24, w: 280, h: 26, fontSize: 18, fontWeight: 600, color: accent, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_website', { x: 32, y: 48, w: 250, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderEmail ? '' : '', section: 'header', zIndex: 1 }),
    text('header_email', { x: 32, y: 64, w: 250, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderEmail || '', section: 'header', zIndex: 1, semanticField: 'senderEmail' }),
    text('header_phone', { x: 32, y: 80, w: 250, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderPhone || '', section: 'header', zIndex: 1, semanticField: 'senderPhone' }),
    text('header_address', { x: 379, y: 50, w: 184, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 435, y: 80, w: 128, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: '', section: 'header', zIndex: 1 }),

    text('client_label', { x: 32, y: 138, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Billed to', section: 'client', zIndex: 1 }),
    text('client_name', { x: 32, y: 156, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 32, y: 172, w: 180, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('client_phone', { x: 32, y: 202, w: 180, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: String(data.clientPhone || ''), section: 'client', zIndex: 1, semanticField: 'clientPhone' }),

    text('meta_invnum_label', { x: 260, y: 138, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Invoice number', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 260, y: 156, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `#${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_ref_label', { x: 260, y: 194, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Reference', section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 260, y: 212, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.referenceNumber || '', section: 'meta', zIndex: 1, semanticField: 'referenceNumber' }),

    text('totals_headline_label', { x: 380, y: 138, w: 183, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: `Invoice of (${data.currency || ''})`, section: 'totals', zIndex: 1 }),
    text('totals_headline_value', { x: 340, y: 154, w: 223, h: 28, fontSize: m(totalDue).length > 13 ? 16 : (m(totalDue).length > 10 ? 18 : 20), fontWeight: 700, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    text('meta_subject_label', { x: 32, y: 250, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Subject', section: 'meta', zIndex: 1 }),
    text('meta_subject_value', { x: 32, y: 268, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),
    text('meta_invdate_label', { x: 260, y: 250, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Invoice date', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 260, y: 268, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_duedate_label', { x: 435, y: 250, w: 128, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Due date', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 435, y: 268, w: 128, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),

    line('divider_meta', { x: 32, y: 306, w: 531, h: 1, fill: '#e5e7eb', section: 'items', zIndex: 1 }),

    text('items_head_detail', { x: 32, y: 314, w: 200, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: 'ITEM DETAIL', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 300, y: 314, w: 30, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: 'QTY', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 335, y: 314, w: 110, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'right', text: 'RATE', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 455, y: 314, w: 108, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    const y = 346 + i * rowH;
    els.push(
      text(`item_${i}_name`, { x: 32, y, w: 250, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_desc`, { x: 32, y: y + 16, w: 250, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Item description', section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 300, y, w: 30, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 335, y, w: 110, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
    );
  });

  const lastItemY = 346 + (items.length - 1) * rowH;
  const subtotalY = fitBlockY(lastItemY + rowH + 12, 30);
  const taxY = fitBlockY(subtotalY + 26, 20);
  const totalY = fitBlockY(taxY + (taxRate > 0 ? 38 : 26), 30);
  const totalPages = Math.floor(totalY / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const footerY = Math.max(lastPageOffset + 795, totalY + 40);

  els.push(
    text('totals_subtotal_label', { x: 323, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: subtotalY, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 500, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
  );
  if (taxRate > 0) {
    els.push(
      text('totals_tax_label', { x: 323, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 }),
      text('totals_tax_value', { x: 388, y: taxY, w: 175, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 500, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    );
  }
  els.push(
    line('divider_total', { x: 323, y: totalY - 6, w: 240, h: 1, fill: '#e5e7eb', section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 323, y: totalY, w: 100, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: 'Total', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalY, w: 175, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 700, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    text('footer_thanks', { x: 32, y: footerY - 50, w: 300, h: 16, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Thanks for the business.', section: 'notes', zIndex: 1 }),
    text('footer_terms_label', { x: 32, y: footerY, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Terms & Conditions', section: 'notes', zIndex: 1 }),
    text('footer_terms_value', { x: 32, y: footerY + 18, w: 400, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),
  );

  return els;
}

// ── Invoice 2 (2023) — blue accent, right-side highlighted totals panel ──
export function getInvoice2023_02Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const soft = '#eaf4fe';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;
  const lastRawY = 338 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const subtotalY = lastItemY + rowH + 16;
  const taxY = subtotalY + 24;
  const totalRowY = (taxRate > 0 ? taxY : subtotalY) + 24;
  const barY = totalRowY + 30;
  const totalPages = Math.floor(barY / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const footerY = Math.max(lastPageOffset + 795, barY + 60);

  const els: InvoiceElement[] = [
    text('header_address', { x: 379, y: 28, w: 184, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 379, y: 58, w: 184, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: '', section: 'header', zIndex: 1 }),
    text('header_name', { x: 32, y: 84, w: 220, h: 18, fontSize: 12, fontWeight: 700, color: accent, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),

    text('client_label', { x: 32, y: 132, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Billed to', section: 'client', zIndex: 1 }),
    text('client_name', { x: 32, y: 150, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 32, y: 166, w: 180, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('client_phone', { x: 32, y: 196, w: 180, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: String(data.clientPhone || ''), section: 'client', zIndex: 1, semanticField: 'clientPhone' }),

    text('meta_duedate_label', { x: 32, y: 252, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Due date', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 32, y: 270, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),
    text('meta_invdate_label', { x: 160, y: 252, w: 120, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Invoice date', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 160, y: 270, w: 120, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),

    rect('panel_meta_bg', { x: 297, y: 242, w: 282, h: 52, fill: soft, section: 'meta', zIndex: 0 }),
    text('meta_invnum_label', { x: 313, y: 252, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Invoice number', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 313, y: 270, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `#${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_ref_label', { x: 465, y: 252, w: 98, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Reference', section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 465, y: 270, w: 98, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.referenceNumber || '', section: 'meta', zIndex: 1, semanticField: 'referenceNumber' }),

    text('items_head_detail', { x: 32, y: 304, w: 200, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Item description', section: 'items', zIndex: 1 }),
    rect('panel_items_bg', { x: 297, y: 294, w: 282, h: Math.max(100, barY + 40 - 294), fill: soft, section: 'items', zIndex: 0 }),
    text('items_head_qty', { x: 313, y: 304, w: 40, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 360, y: 304, w: 90, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 455, y: 304, w: 108, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Amount', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    let y = 338 + i * rowH;
    if (y > 700) {
      const overflowIdx = Math.floor((y - 700) / rowH);
      y = 940 + overflowIdx * rowH;
    }
    els.push(
      text(`item_${i}_name`, { x: 32, y, w: 260, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 313, y, w: 40, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 360, y, w: 90, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
    );
  });

  els.push(
    text('totals_subtotal_label', { x: 313, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: subtotalY, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 500, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
  );
  if (taxRate > 0) {
    els.push(
      text('totals_tax_label', { x: 313, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 }),
      text('totals_tax_value', { x: 388, y: taxY, w: 175, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 500, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    );
  }
  els.push(
    text('totals_total_label', { x: 313, y: totalRowY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Total', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalRowY, w: 175, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 500, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),
    rect('totals_bar_bg', { x: 297, y: barY, w: 282, h: 40, fill: accent, section: 'totals', zIndex: 2 }),
    text('totals_due_label', { x: 313, y: barY + 13, w: 100, h: 16, fontSize: 12, fontWeight: 700, color: '#ffffff', align: 'left', text: 'Total due', section: 'totals', zIndex: 3 }),
    text('totals_due_value', { x: 388, y: barY + 13, w: 175, h: 16, fontSize: autoFontSize(m(totalDue), 12), fontWeight: 800, color: '#ffffff', align: 'right', text: m(totalDue), section: 'totals', zIndex: 3 }),
    text('totals_words', { x: 313, y: barY + 46, w: 250, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: `${getCurrencyCode(data)} ${Math.round(totalDue).toLocaleString('en-US')} Only.`, section: 'totals', zIndex: 1 }),

    text('footer_thanks', { x: 32, y: footerY, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Thank you for the business!', section: 'notes', zIndex: 1 }),
    text('footer_phone', { x: 361, y: footerY, w: 88, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('footer_email', { x: 481, y: footerY, w: 82, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
  );

  return els;
}

// ── Invoice 3 (2023) — indigo accent, plain "Invoice" title + vertical meta ──
export function getInvoice2023_03Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const band = '#f9fafc';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 26;

  const els: InvoiceElement[] = [
    rect('band_top', { x: 0, y: 0, w: 595, h: 148, fill: band, section: 'header', zIndex: 0 }),
    text('header_title', { x: 32, y: 28, w: 200, h: 32, fontSize: 28, fontWeight: 600, color: dark, align: 'left', text: 'Invoice', section: 'header', zIndex: 1 }),
    text('client_label', { x: 32, y: 84, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Billed to', section: 'client', zIndex: 1 }),
    text('client_name', { x: 32, y: 102, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 32, y: 118, w: 200, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('header_name', { x: 400, y: 84, w: 163, h: 18, fontSize: 12, fontWeight: 700, color: accent, align: 'right', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 400, y: 102, w: 163, h: 32, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: (data.senderAddress || '') + '\n', section: 'header', zIndex: 1 }),

    text('meta_invnum_label', { x: 32, y: 212, w: 124, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Invoice #', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 32, y: 228, w: 124, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.invoiceNumber || '', section: 'meta', zIndex: 1, semanticField: 'invoiceNumber' }),
    text('meta_invdate_label', { x: 32, y: 253, w: 124, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Invoice date', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 32, y: 269, w: 124, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_ref_label', { x: 32, y: 353, w: 124, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Reference', section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 32, y: 369, w: 124, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.referenceNumber || '', section: 'meta', zIndex: 1, semanticField: 'referenceNumber' }),
    text('meta_duedate_label', { x: 32, y: 424, w: 124, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Due date', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 32, y: 440, w: 124, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),

    text('items_head_services', { x: 188, y: 212, w: 120, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Services', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 348, y: 212, w: 40, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 360, y: 212, w: 90, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_total', { x: 455, y: 212, w: 108, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Line total', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    const y = 246 + i * rowH;
    els.push(
      text(`item_${i}_name`, { x: 188, y, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 348, y, w: 40, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
    );
  });

  const lastRawY = 246 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const subtotalY = lastItemY + rowH;
  const taxY = subtotalY + rowH;
  const totalY = (taxRate > 0 ? taxY : subtotalY) + rowH;
  const notesY = totalY + 30;
  const totalPages = Math.floor(notesY / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const footerY = Math.max(lastPageOffset + 795, notesY + 50);
  const bandY = footerY - 15;

  els.push(
    text('totals_subtotal_label', { x: 188, y: subtotalY, w: 120, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: subtotalY, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 400, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
  );
  if (taxRate > 0) {
    els.push(
      text('totals_tax_label', { x: 188, y: taxY, w: 120, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 }),
      text('totals_tax_value', { x: 388, y: taxY, w: 175, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 400, color: muted, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    );
  }
  els.push(
    rect('totals_bg', { x: 188, y: totalY - 4, w: 375, h: 22, fill: band, section: 'totals', zIndex: 0 }),
    text('totals_total_label', { x: 188, y: totalY, w: 120, h: 14, fontSize: 10, fontWeight: 700, color: accent, align: 'left', text: 'Total due', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalY, w: 175, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 700, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),
    text('notes_terms', { x: 188, y: notesY, w: 355, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    rect('band_bottom', { x: 0, y: bandY, w: 595, h: 62, fill: band, section: 'notes', zIndex: 0 }),
    text('footer_website', { x: 32, y: footerY, w: 150, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress ? '' : '', section: 'notes', zIndex: 1 }),
    text('footer_phone', { x: 240, y: footerY, w: 120, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('footer_email', { x: 388, y: footerY, w: 175, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
  );

  return els;
}

// ── Invoice 5.2 (2023, "Digital") — pink accent, card-grid layout ──
export function getInvoice2023_52Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const card = '#f2f4f7';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;
  const lastRawY = 282 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const subtotalY = lastItemY + rowH + 16;
  const taxY = subtotalY + 20;
  const dueRowY = (taxRate > 0 ? taxY : subtotalY) + 20;
  const itemsCardH = dueRowY + 30 - 236;
  const notesCardY = Math.max(687, dueRowY + 30);
  const totalPages = Math.floor(dueRowY / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const contactCardY = Math.max(lastPageOffset + 786, notesCardY + 95);

  const els: InvoiceElement[] = [
    rect('card_header_bg', { x: 16, y: 16, w: 563, h: 40, fill: card, section: 'meta', zIndex: 0 }),
    text('meta_invnum', { x: 32, y: 28, w: 220, h: 16, fontSize: 12, fontWeight: 600, color: dark, align: 'left', text: `Invoice #${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_date', { x: 380, y: 28, w: 183, h: 16, fontSize: 12, fontWeight: 600, color: dark, align: 'right', text: `Date ${data.issueDate || ''}`, section: 'meta', zIndex: 1 }),

    rect('card_to_bg', { x: 16, y: 68, w: 275, h: 104, fill: card, section: 'client', zIndex: 0 }),
    text('to_label', { x: 32, y: 80, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'To', section: 'client', zIndex: 1 }),
    text('to_name', { x: 32, y: 100, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('to_address', { x: 32, y: 116, w: 240, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('to_phone', { x: 32, y: 146, w: 240, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientPhone || '', section: 'client', zIndex: 1, semanticField: 'clientPhone' }),

    rect('card_from_bg', { x: 304, y: 68, w: 275, h: 104, fill: card, section: 'header', zIndex: 0 }),
    text('from_label', { x: 319, y: 80, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'From', section: 'header', zIndex: 1 }),
    text('header_name', { x: 319, y: 100, w: 244, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 319, y: 116, w: 244, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 319, y: 146, w: 244, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: '', section: 'header', zIndex: 1 }),

    rect('card_dues_bg', { x: 16, y: 184, w: 563, h: 40, fill: card, section: 'totals', zIndex: 0 }),
    text('dues_amount', { x: 32, y: 196, w: 175, h: 16, fontSize: autoFontSize(m(totalDue), 14), fontWeight: 700, color: accent, align: 'left', text: m(totalDue), section: 'totals', zIndex: 1 }),
    text('dues_label', { x: 215, y: 197, w: 200, h: 16, fontSize: 14, fontWeight: 500, color: muted, align: 'left', text: `dues on ${data.dueDate || ''}`, section: 'totals', zIndex: 1 }),

    rect('card_items_bg', { x: 16, y: 236, w: 563, h: itemsCardH, fill: card, section: 'items', zIndex: 0 }),
    text('items_head_service', { x: 32, y: 248, w: 200, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Service', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 344, y: 248, w: 40, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 345, y: 248, w: 100, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_total', { x: 455, y: 248, w: 108, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Line total', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    let y = 282 + i * rowH;
    if (y > 700) {
      const overflowIdx = Math.floor((y - 700) / rowH);
      y = 940 + overflowIdx * rowH;
    }
    els.push(
      text(`item_${i}_name`, { x: 32, y, w: 260, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 344, y, w: 40, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
    );
  });

  els.push(
    line('totals_divider', { x: 32, y: subtotalY - 12, w: 531, h: 1, fill: '#d8dce3', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_label', { x: 344, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 462, y: subtotalY, w: 101, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 400, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
  );
  if (taxRate > 0) {
    els.push(
      text('totals_tax_label', { x: 344, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 }),
      text('totals_tax_value', { x: 462, y: taxY, w: 101, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 400, color: muted, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    );
  }
  els.push(
    text('totals_due_label', { x: 344, y: dueRowY, w: 100, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: 'Amount due', section: 'totals', zIndex: 1 }),
    text('totals_due_value', { x: 462, y: dueRowY, w: 101, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 700, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    rect('card_thanks_bg', { x: 16, y: notesCardY, w: 276, h: 87, fill: card, section: 'notes', zIndex: 0 }),
    text('footer_thanks', { x: 32, y: notesCardY + 12, w: 244, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Thank you for the business!', section: 'notes', zIndex: 1 }),
    text('footer_notes', { x: 32, y: notesCardY + 32, w: 244, h: 32, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    rect('card_bank_bg', { x: 304, y: notesCardY, w: 275, h: 87, fill: card, section: 'notes', zIndex: 0 }),
    text('bank_name', { x: 320, y: notesCardY + 12, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),
    text('bank_ifs', { x: 320, y: notesCardY + 28, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),
    text('bank_swift', { x: 320, y: notesCardY + 44, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),
    text('bank_acct', { x: 320, y: notesCardY + 60, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),

    rect('card_contact_bg', { x: 16, y: contactCardY, w: 563, h: 40, fill: card, section: 'notes', zIndex: 0 }),
    text('contact_name', { x: 32, y: contactCardY + 12, w: 180, h: 16, fontSize: 12, fontWeight: 700, color: accent, align: 'left', text: data.businessName || '', section: 'notes', zIndex: 1, semanticField: 'businessName' }),
    text('contact_phone', { x: 250, y: contactCardY + 12, w: 120, h: 16, fontSize: 12, fontWeight: 500, color: muted, align: 'center', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('contact_email', { x: 465, y: contactCardY + 12, w: 98, h: 16, fontSize: 12, fontWeight: 500, color: muted, align: 'right', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
  );

  return els;
}

// ── Invoice 1 (2018 Legacy) — lavender header band, purple grand total ──
export function getInvoice2018_01Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const band = '#ebebf5';
  const divider = '#bcb0c4';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 26;

  const els: InvoiceElement[] = [
    rect('band_top', { x: 0, y: 0, w: 595, h: 90, fill: band, section: 'header', zIndex: 0 }),
    rect('band_top', { x: 0, y: 0, w: 595, h: 90, fill: band, section: 'header', zIndex: 0 }),
    text('header_contact', { x: 30, y: 22, w: 200, h: 48, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: (data.businessName || '') + '\n' + (data.senderPhone || '') + '\n' + (data.senderEmail || '') + '\n' + (data.senderAddress ? '' : ''), section: 'header', zIndex: 1 }),
    text('header_address', { x: 363, y: 22, w: 200, h: 48, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),

    text('client_label', { x: 30, y: 108, w: 150, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Billed to,', section: 'client', zIndex: 1 }),
    text('client_name', { x: 30, y: 124, w: 200, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 30, y: 142, w: 200, h: 28, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    text('meta_invnum_label', { x: 250, y: 108, w: 150, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Invoice number', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 250, y: 124, w: 150, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: `#${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_ref_label', { x: 250, y: 144, w: 150, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Reference', section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 250, y: 160, w: 150, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: data.referenceNumber || '', section: 'meta', zIndex: 1, semanticField: 'referenceNumber' }),

    text('totals_headline_label', { x: 388, y: 108, w: 175, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: `Invoice of (${data.currency || ''})`, section: 'totals', zIndex: 1 }),
    text('totals_headline_value', { x: 388, y: 124, w: 175, h: 22, fontSize: autoFontSize(m(totalDue), 16), fontWeight: 800, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    line('divider_1', { x: 30, y: 238, w: 535, h: 2, fill: divider, section: 'meta', zIndex: 1 }),
    text('meta_subject', { x: 30, y: 200, w: 200, h: 18, fontSize: 13, fontWeight: 700, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),
    text('meta_invdate_label', { x: 240, y: 200, w: 130, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Invoice Date', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 240, y: 216, w: 130, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_duedate_label', { x: 418, y: 200, w: 145, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: 'Due Date', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 418, y: 216, w: 145, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),

    text('items_head_details', { x: 30, y: 254, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: 'ITEM DETAILS', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 300, y: 254, w: 30, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: 'QTY', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 335, y: 254, w: 110, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'right', text: 'RATE', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 455, y: 254, w: 108, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      let y = 280 + i * rowH;
      if (y > 700) {
        const overflowIdx = Math.floor((y - 700) / rowH);
        y = 940 + overflowIdx * rowH;
      }
      return [
        line(`item_${i}_divider`, { x: 30, y: y - 6, w: 535, h: 1, fill: divider, section: 'items', zIndex: 1 }),
        text(`item_${i}_name`, { x: 30, y, w: 260, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 300, y, w: 30, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(item.quantity).padStart(2, '0'), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 335, y, w: 110, h: 14, fontSize: autoFontSize(m(item.unitPrice), 10), fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: autoFontSize(m(item.total), 10), fontWeight: 500, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),
  ];

  const lastRawY = 280 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const notesY = lastItemY + 40;
  const totalPages = Math.floor((notesY + 80) / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const footerTermsY = Math.max(lastPageOffset + 782, notesY + 90);

  els.push(
    text('notes_label', { x: 30, y: notesY, w: 200, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'left', text: 'Notes', section: 'notes', zIndex: 1 }),
    text('notes_value', { x: 30, y: notesY + 20, w: 280, h: 40, fontSize: 14, fontWeight: 400, color: dark, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    text('totals_subtotal_label', { x: 375, y: notesY, w: 90, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'left', text: 'Sub Total', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: notesY, w: 175, h: 16, fontSize: autoFontSize(m(subtotal), 14), fontWeight: 500, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 375, y: notesY + 22, w: 90, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'left', text: `GST(${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 388, y: notesY + 22, w: 175, h: 16, fontSize: 14, fontWeight: 500, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    line('totals_divider', { x: 375, y: notesY + (taxRate > 0 ? 48 : 26), w: 190, h: 1, fill: divider, section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 375, y: notesY + (taxRate > 0 ? 58 : 36), w: 90, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'left', text: 'Total', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: notesY + (taxRate > 0 ? 58 : 36), w: 175, h: 18, fontSize: autoFontSize(m(totalDue), 16), fontWeight: 600, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    text('footer_terms_label', { x: 30, y: footerTermsY, w: 200, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'left', text: 'Terms & Conditions', section: 'notes', zIndex: 1 }),
    text('footer_terms_value', { x: 30, y: footerTermsY + 18, w: 400, h: 14, fontSize: 12, fontWeight: 400, color: dark, align: 'left', text: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit', section: 'notes', zIndex: 1 }),
  );

  return els;
}

// ── Invoice 2 (2018 Legacy) — purple brand, yellow highlight, navy total bar ──
export function getInvoice2018_02Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const highlight = '#fff9b9';
  const navy = '#222234';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 24;
  const lastRawY = 310 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const panelTop = lastItemY + 30;
  const panelH = taxRate > 0 ? 90 : 66;
  const barY = panelTop + panelH - 42;
  const totalPages = Math.floor(barY / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const footerNotesY = Math.max(lastPageOffset + 700, barY + 110);

  return [
    text('header_name', { x: 32, y: 32, w: 300, h: 24, fontSize: 20, fontWeight: 700, color: accent, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 350, y: 32, w: 213, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_contact', { x: 350, y: 64, w: 213, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: (data.senderPhone || '') + '\n' + (data.senderEmail || ''), section: 'header', zIndex: 1 }),

    text('client_label', { x: 200, y: 100, w: 363, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: 'Billed to,', section: 'client', zIndex: 1 }),
    text('client_name', { x: 200, y: 116, w: 363, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 200, y: 132, w: 363, h: 24, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    line('divider_meta', { x: 32, y: 168, w: 531, h: 1, fill: '#bcb0c4', section: 'meta', zIndex: 1 }),
    text('meta_subject_label', { x: 32, y: 180, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Subject', section: 'meta', zIndex: 1 }),
    text('meta_subject_value', { x: 32, y: 196, w: 250, h: 20, fontSize: 14, fontWeight: 600, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),
    text('meta_invdate_label', { x: 350, y: 180, w: 213, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: 'Invoice Date', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 350, y: 196, w: 213, h: 16, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),

    rect('highlight_bar', { x: 0, y: 228, w: 595, h: 44, fill: highlight, section: 'totals', zIndex: 0 }),
    text('totals_headline_label', { x: 52, y: 238, w: 130, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `Invoice of (${data.currency || ''})`, section: 'totals', zIndex: 1 }),
    text('totals_headline_value', { x: 52, y: 254, w: 160, h: 16, fontSize: autoFontSize(m(totalDue), 13), fontWeight: 800, color: dark, align: 'left', text: m(totalDue), section: 'totals', zIndex: 1 }),
    text('meta_invnum_label', { x: 232, y: 238, w: 150, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Invoice number', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 232, y: 254, w: 150, h: 16, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `#${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_ref_label', { x: 415, y: 238, w: 148, h: 12, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: 'Reference', section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 415, y: 254, w: 148, h: 16, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.referenceNumber || '', section: 'meta', zIndex: 1, semanticField: 'referenceNumber' }),

    text('items_head_desc', { x: 52, y: 290, w: 200, h: 12, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: 'ITEM DESCRIPTION', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 290, y: 290, w: 30, h: 12, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: 'QTY', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 330, y: 290, w: 110, h: 12, fontSize: 10, fontWeight: 600, color: muted, align: 'right', text: 'RATE', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 450, y: 290, w: 113, h: 12, fontSize: 10, fontWeight: 600, color: muted, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      let y = 310 + i * rowH;
      if (y > 700) {
        const overflowIdx = Math.floor((y - 700) / rowH);
        y = 940 + overflowIdx * rowH;
      }
      return [
        text(`item_${i}_name`, { x: 52, y, w: 230, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 290, y, w: 30, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(item.quantity).padStart(2, '0'), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 330, y, w: 110, h: 14, fontSize: autoFontSize(m(item.unitPrice), 10), fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 450, y, w: 113, h: 14, fontSize: autoFontSize(m(item.total), 10), fontWeight: 500, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    text('payment_label', { x: 32, y: panelTop + 8, w: 230, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Payment Details', section: 'notes', zIndex: 1 }),
    text('payment_paypal', { x: 32, y: panelTop + 26, w: 230, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: data.senderEmail ? `Paypal: ${data.senderEmail}` : '', section: 'notes', zIndex: 1 }),
    text('payment_upi', { x: 32, y: panelTop + 44, w: 230, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),

    rect('panel_totals_bg', { x: 311, y: panelTop, w: 252, h: panelH - 42, fill: highlight, section: 'totals', zIndex: 0 }),
    text('totals_subtotal_label', { x: 327, y: panelTop + 10, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Sub Total', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: panelTop + 10, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 700, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 327, y: panelTop + 32, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: `GST(${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 427, y: panelTop + 32, w: 120, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 700, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    rect('total_bar', { x: 311, y: barY, w: 252, h: 42, fill: navy, section: 'totals', zIndex: 2 }),
    text('totals_total_label', { x: 327, y: barY + 13, w: 90, h: 16, fontSize: 10, fontWeight: 600, color: '#ffffff', align: 'left', text: 'Total', section: 'totals', zIndex: 3 }),
    text('totals_total_value', { x: 380, y: barY + 11, w: 173, h: 20, fontSize: autoFontSize(m(totalDue), 12), fontWeight: 800, color: '#ffffff', align: 'right', text: m(totalDue), section: 'totals', zIndex: 3 }),

    text('totals_words_label', { x: 350, y: barY + 50, w: 213, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: 'In words', section: 'totals', zIndex: 1 }),
    text('totals_words_value', { x: 350, y: barY + 66, w: 213, h: 16, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: data.amountInWords as string || `${getCurrencyCode(data)} ${Math.round(totalDue).toLocaleString('en-US')} Only.`, section: 'totals', zIndex: 1 }),

    line('footer_divider', { x: 32, y: footerNotesY, w: 531, h: 1, fill: '#e5e7eb', section: 'notes', zIndex: 1 }),
    text('footer_note_label', { x: 32, y: footerNotesY + 12, w: 250, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Note', section: 'notes', zIndex: 1 }),
    text('footer_note_value', { x: 32, y: footerNotesY + 32, w: 250, h: 20, fontSize: 13, fontWeight: 600, color: dark, align: 'left', text: 'Thanks for the business.', section: 'notes', zIndex: 1 }),
    text('footer_terms_label', { x: 313, y: footerNotesY + 12, w: 250, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Terms & Conditions', section: 'notes', zIndex: 1 }),
    text('footer_terms_value', { x: 313, y: footerNotesY + 32, w: 250, h: 32, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),
  ];
}

// ── Invoice 4 (2023) — magenta accent, serif "Invoice" title ──
export function getInvoice2023_04Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 26;
  const lastRawY = 286 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const subtotalY = lastItemY + 34;
  const taxY = subtotalY + 26;
  const totalY = (taxRate > 0 ? taxY : subtotalY) + 34;

  return [
    text('header_title', { x: 32, y: 32, w: 150, h: 40, fontSize: 32, fontWeight: 600, color: dark, align: 'left', text: 'Invoice', section: 'header', zIndex: 1 }),
    text('meta_invnum_value', { x: 400, y: 32, w: 163, h: 24, fontSize: 20, fontWeight: 700, color: muted, align: 'right', text: data.invoiceNumber || '', section: 'header', zIndex: 1, semanticField: 'invoiceNumber' }),

    text('totals_headline_value', { x: 32, y: 88, w: 130, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `Payable ${m(totalDue)}`, section: 'totals', zIndex: 1 }),
    text('meta_duedate_value', { x: 32, y: 108, w: 130, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `Dues ${data.dueDate || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 32, y: 124, w: 130, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `Issued ${data.issueDate || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 32, y: 140, w: 130, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `Ref. #${data.referenceNumber || ''}`, section: 'meta', zIndex: 1 }),

    text('client_label', { x: 176, y: 88, w: 178, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Billed to', section: 'client', zIndex: 1 }),
    text('client_name', { x: 176, y: 108, w: 178, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 176, y: 124, w: 178, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('client_phone', { x: 176, y: 154, w: 178, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: String(data.clientPhone || ''), section: 'client', zIndex: 1, semanticField: 'clientPhone' }),

    text('from_label', { x: 386, y: 88, w: 178, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'From', section: 'header', zIndex: 1 }),
    text('header_name', { x: 386, y: 108, w: 178, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 386, y: 124, w: 178, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 386, y: 154, w: 178, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: '', section: 'header', zIndex: 1 }),

    text('meta_subject_value', { x: 176, y: 232, w: 200, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),

    text('items_head_desc', { x: 176, y: 262, w: 169, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: 'ITEM DESCRIPTION', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 369, y: 262, w: 18, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: 'QTY', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 345, y: 262, w: 100, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'right', text: 'RATE', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 455, y: 262, w: 108, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      const y = 286 + i * rowH;
      return [
        text(`item_${i}_name`, { x: 176, y, w: 180, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 369, y, w: 18, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    text('totals_subtotal_label', { x: 176, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: subtotalY, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 500, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 176, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 463, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    line('totals_divider', { x: 176, y: totalY - 8, w: 387, h: 1, fill: '#e5e7eb', section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 176, y: totalY, w: 130, h: 16, fontSize: 12, fontWeight: 700, color: dark, align: 'left', text: `Total (${data.currency || ''})`, section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalY, w: 175, h: 16, fontSize: autoFontSize(m(totalDue), 12), fontWeight: 700, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    text('payment_label', { x: 176, y: 714, w: 180, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Payment details', section: 'notes', zIndex: 1 }),
    text('payment_notes', { x: 176, y: 730, w: 180, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),
    text('bank_name', { x: 369, y: 714, w: 194, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),
    text('bank_ifs', { x: 369, y: 730, w: 194, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),
    text('bank_swift', { x: 369, y: 746, w: 194, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),
    text('bank_acct', { x: 369, y: 762, w: 194, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Account #: 3747489 2300011', section: 'notes', zIndex: 1 }),

    line('footer_divider', { x: 176, y: 792, w: 387, h: 1, fill: '#e5e7eb', section: 'notes', zIndex: 1 }),
    text('footer_thanks', { x: 176, y: 800, w: 120, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Thanks for the business.', section: 'notes', zIndex: 1 }),
    text('footer_email', { x: 369, y: 800, w: 82, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
    text('footer_phone', { x: 475, y: 800, w: 88, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'center', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
  ];
}

// ── Invoice 6 (2023) — violet accent, plain off-white page ──
export function getInvoice2023_06Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 26;
  const lastItemY = 298 + (items.length - 1) * rowH;
  const subtotalY = lastItemY + 26;
  const taxY = subtotalY + 26;
  const totalY = (taxRate > 0 ? taxY : subtotalY) + 26;
  const dueY = totalY + 26;

  return [
    rect('page_bg', { x: 0, y: 0, w: 595, h: 842, fill: '#f9fafc', section: 'header', zIndex: -1 }),
    text('header_title', { x: 40, y: 32, w: 200, h: 32, fontSize: 28, fontWeight: 600, color: dark, align: 'left', text: 'Invoice', section: 'header', zIndex: 1 }),
    text('meta_invnum_value', { x: 40, y: 64, w: 150, h: 14, fontSize: 11, fontWeight: 500, color: muted, align: 'left', text: `#${data.invoiceNumber || ''}`, section: 'header', zIndex: 1 }),

    text('meta_issued_label', { x: 40, y: 126, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Issued', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 40, y: 146, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_due_label', { x: 40, y: 176, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Due', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 40, y: 196, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),

    text('client_label', { x: 222, y: 126, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Billed to', section: 'client', zIndex: 1 }),
    text('client_name', { x: 222, y: 146, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 222, y: 162, w: 150, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('client_phone', { x: 222, y: 192, w: 150, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: String(data.clientPhone || ''), section: 'client', zIndex: 1, semanticField: 'clientPhone' }),

    text('from_label', { x: 404, y: 126, w: 151, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'From', section: 'header', zIndex: 1 }),
    text('header_name', { x: 404, y: 146, w: 151, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 404, y: 162, w: 151, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 404, y: 192, w: 151, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: '', section: 'header', zIndex: 1 }),

    text('items_head_service', { x: 40, y: 264, w: 200, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Service', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 352, y: 264, w: 40, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 345, y: 264, w: 100, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_total', { x: 455, y: 264, w: 108, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Line total', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      const y = 298 + i * rowH;
      return [
        text(`item_${i}_name`, { x: 40, y, w: 260, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 352, y, w: 40, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    text('totals_subtotal_label', { x: 352, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: subtotalY, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 500, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 352, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 460, y: taxY, w: 95, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    text('totals_total_label', { x: 352, y: totalY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Total', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalY, w: 175, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 500, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),
    text('totals_due_label', { x: 352, y: dueY, w: 100, h: 14, fontSize: 10, fontWeight: 700, color: accent, align: 'left', text: 'Amount due', section: 'totals', zIndex: 1 }),
    text('totals_due_value', { x: 388, y: dueY, w: 175, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 700, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    text('footer_thanks', { x: 40, y: 722, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Thank you for the business!', section: 'notes', zIndex: 1 }),
    text('footer_notes', { x: 56, y: 740, w: 280, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),
    text('footer_role', { x: 40, y: 796, w: 297, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Digital Product Designer, IN', section: 'notes', zIndex: 1 }),
    text('footer_phone', { x: 353, y: 796, w: 88, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('footer_email', { x: 473, y: 796, w: 82, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
  ];
}

// ── Invoice 3.1 (2023, "Full height") — indigo, meta spread down the page ──
export function getInvoice2023_03_1Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;
  const lastRawY = 246 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const subtotalY = lastItemY + rowH + 16;
  const taxY = subtotalY + 24;
  const totalY = (taxRate > 0 ? taxY : subtotalY) + 24;
  const totalPages = Math.floor(totalY / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const footerY = Math.max(lastPageOffset + 795, totalY + 40);

  return [
    text('header_title', { x: 32, y: 28, w: 200, h: 32, fontSize: 28, fontWeight: 600, color: dark, align: 'left', text: 'Invoice', section: 'header', zIndex: 1 }),
    text('client_label', { x: 32, y: 84, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Billed to', section: 'client', zIndex: 1 }),
    text('client_name', { x: 32, y: 102, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 32, y: 118, w: 200, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('header_name', { x: 402, y: 84, w: 161, h: 18, fontSize: 12, fontWeight: 700, color: accent, align: 'right', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 331, y: 102, w: 232, h: 16, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 435, y: 132, w: 128, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: '', section: 'header', zIndex: 1 }),

    text('meta_invnum_label', { x: 32, y: 212, w: 80, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Invoice #', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 32, y: 228, w: 80, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.invoiceNumber || '', section: 'meta', zIndex: 1, semanticField: 'invoiceNumber' }),
    text('meta_invdate_label', { x: 32, y: 367, w: 80, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Invoice date', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 32, y: 383, w: 80, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_ref_label', { x: 32, y: 523, w: 80, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Reference', section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 32, y: 539, w: 80, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.referenceNumber || '', section: 'meta', zIndex: 1, semanticField: 'referenceNumber' }),
    text('meta_duedate_label', { x: 32, y: 678, w: 80, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Due date', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 32, y: 694, w: 80, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),

    text('items_head_services', { x: 156, y: 212, w: 180, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Services', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 340, y: 212, w: 30, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 345, y: 212, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_total', { x: 455, y: 212, w: 108, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Line total', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      let y = 246 + i * rowH;
      if (y > 700) {
        const overflowIdx = Math.floor((y - 700) / rowH);
        y = 940 + overflowIdx * rowH;
      }
      return [
        text(`item_${i}_name`, { x: 156, y, w: 180, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 340, y, w: 30, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    text('totals_subtotal_label', { x: 156, y: subtotalY, w: 120, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: subtotalY, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 400, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 156, y: taxY, w: 120, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 388, y: taxY, w: 175, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 400, color: muted, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    text('totals_total_label', { x: 156, y: totalY, w: 120, h: 14, fontSize: 10, fontWeight: 700, color: accent, align: 'left', text: 'Total due', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalY, w: 175, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 700, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    text('footer_website', { x: 32, y: footerY, w: 150, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress ? '' : '', section: 'notes', zIndex: 1 }),
    text('footer_phone', { x: 240, y: footerY, w: 120, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('footer_email', { x: 388, y: footerY, w: 175, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
  ];
}

// ── Invoice 2.1 (2023, "With Payment details") — blue, tall highlighted panel ──
export function getInvoice2023_02_1Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const soft = '#eaf4fe';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;
  const lastRawY = 338 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const subtotalY = lastItemY + rowH + 16;
  const taxY = subtotalY + 24;
  const totalRowY = (taxRate > 0 ? taxY : subtotalY) + 24;
  const barY = totalRowY + 30;
  const wordsY = barY + 46;
  const paymentY = wordsY + 30;

  return [
    text('header_address', { x: 379, y: 28, w: 184, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 379, y: 58, w: 184, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: '', section: 'header', zIndex: 1 }),
    text('header_name', { x: 32, y: 84, w: 220, h: 18, fontSize: 12, fontWeight: 700, color: accent, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),

    text('client_label', { x: 32, y: 132, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Billed to', section: 'client', zIndex: 1 }),
    text('client_name', { x: 32, y: 150, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 32, y: 166, w: 200, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('client_phone', { x: 32, y: 196, w: 200, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientPhone || '', section: 'client', zIndex: 1, semanticField: 'clientPhone' }),

    text('meta_duedate_label', { x: 32, y: 252, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Due date', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 32, y: 270, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),
    text('meta_invdate_label', { x: 160, y: 252, w: 120, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Invoice date', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 160, y: 270, w: 120, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_invnum_label', { x: 313, y: 252, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Invoice number', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 313, y: 270, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `#${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_ref_label', { x: 465, y: 252, w: 98, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Reference', section: 'meta', zIndex: 1 }),
    text('meta_ref_value', { x: 465, y: 270, w: 98, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: data.referenceNumber || '', section: 'meta', zIndex: 1, semanticField: 'referenceNumber' }),

    text('items_head_desc', { x: 32, y: 304, w: 200, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Item description', section: 'items', zIndex: 1 }),
    rect('panel_bg', { x: 297, y: 294, w: 282, h: paymentY + 84 - 294, fill: soft, section: 'items', zIndex: 0 }),
    text('items_head_qty', { x: 313, y: 304, w: 40, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 345, y: 304, w: 100, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 455, y: 304, w: 108, h: 12, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: 'Amount', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      const y = 338 + i * rowH;
      return [
        text(`item_${i}_name`, { x: 32, y, w: 260, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 313, y, w: 40, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(item.quantity).padStart(2, '0'), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    text('totals_subtotal_label', { x: 313, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 388, y: subtotalY, w: 175, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 500, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 313, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 463, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    text('totals_total_label', { x: 313, y: totalRowY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Total', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalRowY, w: 175, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 500, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),
    rect('total_bar', { x: 297, y: barY, w: 282, h: 40, fill: accent, section: 'totals', zIndex: 2 }),
    text('totals_due_label', { x: 313, y: barY + 13, w: 100, h: 16, fontSize: 12, fontWeight: 700, color: '#ffffff', align: 'left', text: 'Total due', section: 'totals', zIndex: 3 }),
    text('totals_due_value', { x: 388, y: barY + 13, w: 175, h: 16, fontSize: autoFontSize(m(totalDue), 12), fontWeight: 800, color: '#ffffff', align: 'right', text: m(totalDue), section: 'totals', zIndex: 3 }),
    text('totals_words', { x: 313, y: wordsY, w: 250, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.amountInWords as string || `${getCurrencyCode(data)} ${Math.round(totalDue).toLocaleString('en-US')} Only.`, section: 'totals', zIndex: 1 }),

    text('payment_label', { x: 313, y: paymentY, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Payment details', section: 'notes', zIndex: 1 }),
    text('payment_bank', { x: 313, y: paymentY + 18, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),
    text('payment_swift', { x: 313, y: paymentY + 34, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: '', section: 'notes', zIndex: 1 }),
    text('payment_acct', { x: 313, y: paymentY + 50, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: '', section: 'notes', zIndex: 1 }),

    text('footer_thanks', { x: 32, y: paymentY, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Thank you for the business!', section: 'notes', zIndex: 1 }),
    text('footer_notes', { x: 32, y: paymentY + 18, w: 240, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),
    text('footer_phone', { x: 32, y: paymentY + 70, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('footer_email', { x: 200, y: paymentY + 70, w: 150, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
  ];
}

// ── Invoice 5.1 (2023, "Digital") — rose accent, card-grid, pink-tinted dues banner ──
export function getInvoice2023_05_1Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const card = '#f2f5fa';
  const duesBand = '#faf2f5';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;
  const lastRawY = 282 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const subtotalY = lastItemY + rowH + 16;
  const taxY = subtotalY + 20;
  const dueRowY = (taxRate > 0 ? taxY : subtotalY) + 20;
  const itemsCardH = dueRowY + 30 - 236;
  const notesCardY = Math.max(687, dueRowY + 30);

  return [
    rect('card_header_bg', { x: 16, y: 16, w: 563, h: 40, fill: card, section: 'meta', zIndex: 0 }),
    text('meta_invnum', { x: 32, y: 28, w: 220, h: 16, fontSize: 12, fontWeight: 600, color: dark, align: 'left', text: `Invoice #${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_date', { x: 380, y: 28, w: 183, h: 16, fontSize: 12, fontWeight: 600, color: dark, align: 'right', text: `Date ${data.issueDate || ''}`, section: 'meta', zIndex: 1 }),

    rect('card_to_bg', { x: 16, y: 68, w: 275, h: 104, fill: card, section: 'client', zIndex: 0 }),
    text('to_label', { x: 32, y: 80, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'To', section: 'client', zIndex: 1 }),
    text('to_name', { x: 32, y: 100, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('to_address', { x: 32, y: 116, w: 240, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('to_phone', { x: 32, y: 146, w: 240, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientPhone || '', section: 'client', zIndex: 1, semanticField: 'clientPhone' }),

    rect('card_from_bg', { x: 304, y: 68, w: 275, h: 104, fill: card, section: 'header', zIndex: 0 }),
    text('from_label', { x: 319, y: 80, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'From', section: 'header', zIndex: 1 }),
    text('header_name', { x: 319, y: 100, w: 244, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 319, y: 116, w: 244, h: 28, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_taxid', { x: 319, y: 146, w: 244, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: '', section: 'header', zIndex: 1 }),

    rect('card_dues_bg', { x: 16, y: 184, w: 563, h: 40, fill: duesBand, section: 'totals', zIndex: 0 }),
    text('dues_amount', { x: 32, y: 196, w: 175, h: 16, fontSize: autoFontSize(m(totalDue), 14), fontWeight: 700, color: accent, align: 'left', text: m(totalDue), section: 'totals', zIndex: 1 }),
    text('dues_label', { x: 215, y: 197, w: 200, h: 16, fontSize: 14, fontWeight: 500, color: muted, align: 'left', text: `dues on ${data.dueDate || ''}`, section: 'totals', zIndex: 1 }),

    rect('card_items_bg', { x: 16, y: 236, w: 563, h: itemsCardH, fill: card, section: 'items', zIndex: 0 }),
    text('items_head_service', { x: 32, y: 248, w: 200, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Service', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 344, y: 248, w: 40, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 345, y: 248, w: 100, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_total', { x: 455, y: 248, w: 108, h: 12, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: 'Line total', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      let y = 282 + i * rowH;
      if (y > 700) {
        const overflowIdx = Math.floor((y - 700) / rowH);
        y = 940 + overflowIdx * rowH;
      }
      return [
        text(`item_${i}_name`, { x: 32, y, w: 260, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 344, y, w: 40, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: String(item.quantity), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    line('totals_divider', { x: 32, y: subtotalY - 12, w: 531, h: 1, fill: '#dfe4ea', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_label', { x: 344, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 462, y: subtotalY, w: 101, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 400, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 344, y: taxY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 462, y: taxY, w: 101, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    text('totals_due_label', { x: 344, y: dueRowY, w: 100, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: 'Amount due', section: 'totals', zIndex: 1 }),
    text('totals_due_value', { x: 462, y: dueRowY, w: 101, h: 14, fontSize: autoFontSize(m(totalDue), 10), fontWeight: 700, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    rect('card_thanks_bg', { x: 16, y: notesCardY, w: 276, h: 87, fill: card, section: 'notes', zIndex: 0 }),
    text('footer_thanks', { x: 32, y: notesCardY + 12, w: 244, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: 'Thank you for the business!', section: 'notes', zIndex: 1 }),
    text('footer_notes', { x: 32, y: notesCardY + 32, w: 244, h: 32, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    rect('card_bank_bg', { x: 304, y: notesCardY, w: 275, h: 87, fill: card, section: 'notes', zIndex: 0 }),
    text('bank_name', { x: 320, y: notesCardY + 12, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),
    text('bank_ifs', { x: 320, y: notesCardY + 28, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),
    text('bank_swift', { x: 320, y: notesCardY + 44, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),
    text('bank_acct', { x: 320, y: notesCardY + 60, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: '', section: 'notes', zIndex: 1 }),

    rect('card_contact_bg', { x: 16, y: 786, w: 563, h: 40, fill: card, section: 'notes', zIndex: 0 }),
    text('contact_name', { x: 32, y: 798, w: 180, h: 16, fontSize: 12, fontWeight: 700, color: accent, align: 'left', text: data.businessName || '', section: 'notes', zIndex: 1, semanticField: 'businessName' }),
    text('contact_phone', { x: 250, y: 798, w: 120, h: 16, fontSize: 12, fontWeight: 500, color: muted, align: 'center', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('contact_email', { x: 465, y: 798, w: 98, h: 16, fontSize: 12, fontWeight: 500, color: muted, align: 'right', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
  ];
}

// ── Invoice 7 (2023) — ghost "Invoice" wordmark, lime highlight behind total ──
export function getInvoice2023_07Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 48;

  return [
    rect('page_bg', { x: 0, y: 0, w: 595, h: 842, fill: '#f9fafc', section: 'header', zIndex: -1 }),
    text('header_name', { x: 108, y: 32, w: 200, h: 22, fontSize: 18, fontWeight: 700, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_email', { x: 108, y: 58, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: data.senderEmail || '', section: 'header', zIndex: 1, semanticField: 'senderEmail' }),
    text('header_phone', { x: 108, y: 74, w: 200, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: data.senderPhone || '', section: 'header', zIndex: 1, semanticField: 'senderPhone' }),
    text('header_title', { x: 380, y: 30, w: 183, h: 40, fontSize: 34, fontWeight: 600, color: '#b2b7c2', align: 'right', text: 'Invoice', section: 'header', zIndex: 1 }),
    text('meta_invnum_value', { x: 380, y: 63, w: 183, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'right', text: `#${data.invoiceNumber || ''}`, section: 'header', zIndex: 1 }),

    text('client_label', { x: 40, y: 136, w: 100, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: 'BILLED TO', section: 'client', zIndex: 1 }),
    text('client_name', { x: 40, y: 152, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),

    text('meta_invdate_label', { x: 246, y: 136, w: 90, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'center', text: 'INVOICE DATE', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 246, y: 150, w: 90, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'center', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_duedate_label', { x: 246, y: 184, w: 90, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'center', text: 'DUE DATE', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 246, y: 198, w: 90, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'center', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),

    text('totals_headline_label', { x: 448, y: 136, w: 115, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'right', text: 'AMOUNT DUE', section: 'totals', zIndex: 1 }),
    rect('lime_bg', { x: 448, y: 154, w: 115, h: 30, fill: '#e3fa7d', section: 'totals', zIndex: 1 }),
    text('totals_headline_value', { x: 448, y: 162, w: 115, h: 16, fontSize: autoFontSize(m(totalDue), 14), fontWeight: 700, color: accent, align: 'center', text: m(totalDue), section: 'totals', zIndex: 2 }),

    text('meta_subject_value', { x: 40, y: 260, w: 300, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),
    text('items_head_num', { x: 40, y: 290, w: 20, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: '#', section: 'items', zIndex: 1 }),
    text('items_head_desc', { x: 60, y: 290, w: 200, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: 'TITLE / DESCRIPTION', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 510, y: 290, w: 45, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      const y = 318 + i * rowH;
      return [
        text(`item_${i}_num`, { x: 40, y, w: 20, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: String(i + 1), section: 'items', zIndex: 1 }),
        text(`item_${i}_name`, { x: 60, y, w: 300, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    line('totals_divider', { x: 40, y: 420, w: 515, h: 2, fill: dark, section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 40, y: 428, w: 200, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: 'Total', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 494, y: 428, w: 61, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 700, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),

    text('footer_thanks', { x: 40, y: 724, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: 'Thank you for the business!', section: 'notes', zIndex: 1 }),
    text('payment_label', { x: 40, y: 762, w: 100, h: 12, fontSize: 8, fontWeight: 600, color: muted, align: 'left', text: 'PAYMENT INFO', section: 'notes', zIndex: 1 }),
    text('payment_details', { x: 40, y: 786, w: 515, h: 30, fontSize: 8, fontWeight: 500, color: muted, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),
  ];
}

// ── Invoice 3 (2018 Legacy) — ghost "Invoice" wordmark, thin dividers ──
export function getInvoice2018_03Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const divider = '#bcb0c4';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 26;
  const itemsHeadY = 428;
  const itemsStartY = itemsHeadY + 30;
  const lastItemY = itemsStartY + (items.length - 1) * rowH;
  const notesY = lastItemY + 40;

  return [
    text('header_address', { x: 30, y: 30, w: 200, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_title', { x: 427, y: 30, w: 136, h: 40, fontSize: 36, fontWeight: 600, color: '#b0b0c2', align: 'right', text: 'Invoice', section: 'header', zIndex: 1 }),
    text('client_label', { x: 350, y: 89, w: 213, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'right', text: 'Billed to,', section: 'client', zIndex: 1 }),
    text('client_name', { x: 350, y: 111, w: 213, h: 16, fontSize: 14, fontWeight: 600, color: dark, align: 'right', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 350, y: 133, w: 213, h: 20, fontSize: 14, fontWeight: 400, color: dark, align: 'right', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    text('meta_invdate_value', { x: 30, y: 187, w: 200, h: 16, fontSize: 14, fontWeight: 600, color: dark, align: 'left', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('meta_subject_label', { x: 30, y: 250, w: 100, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: 'Subject', section: 'meta', zIndex: 1 }),
    text('meta_subject_value', { x: 30, y: 270, w: 250, h: 20, fontSize: 16, fontWeight: 600, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),
    text('meta_invnum_label', { x: 30, y: 320, w: 150, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: 'Invoice number', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 30, y: 342, w: 150, h: 16, fontSize: 14, fontWeight: 600, color: dark, align: 'left', text: `#${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_duedate_label', { x: 230, y: 320, w: 150, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: 'Due Date', section: 'meta', zIndex: 1 }),
    text('meta_duedate_value', { x: 230, y: 342, w: 150, h: 16, fontSize: 14, fontWeight: 600, color: dark, align: 'left', text: data.dueDate || '', section: 'meta', zIndex: 1, semanticField: 'dueDate' }),

    text('items_head_qty', { x: 179, y: itemsHeadY, w: 27, h: 12, fontSize: 12, fontWeight: 600, color: muted, align: 'right', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_desc', { x: 226, y: itemsHeadY, w: 123, h: 12, fontSize: 12, fontWeight: 600, color: muted, align: 'left', text: 'Item description', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 375, y: itemsHeadY, w: 100, h: 12, fontSize: 12, fontWeight: 600, color: muted, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 475, y: itemsHeadY, w: 80, h: 12, fontSize: 12, fontWeight: 600, color: muted, align: 'right', text: 'Amount', section: 'items', zIndex: 1 }),
    line('items_divider', { x: 169, y: itemsHeadY + 25, w: 396, h: 2, fill: divider, section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      const y = itemsStartY + i * rowH;
      return [
        text(`item_${i}_qty`, { x: 179, y, w: 14, h: 14, fontSize: 12, fontWeight: 500, color: dark, align: 'left', text: '01', section: 'items', zIndex: 1 }),
        text(`item_${i}_name`, { x: 226, y, w: 130, h: 14, fontSize: 12, fontWeight: 400, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 375, y, w: 100, h: 14, fontSize: 12, fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 475, y, w: 80, h: 14, fontSize: 12, fontWeight: 500, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    text('footer_terms_label', { x: 169, y: notesY, w: 180, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: 'Terms & Conditions', section: 'notes', zIndex: 1 }),
    text('footer_terms_value', { x: 169, y: notesY + 20, w: 180, h: 42, fontSize: 12, fontWeight: 400, color: dark, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    text('totals_subtotal_label', { x: 366, y: notesY, w: 105, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'right', text: 'Sub Total', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 489, y: notesY + 2, w: 74, h: 14, fontSize: autoFontSize(m(subtotal), 14), fontWeight: 500, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 366, y: notesY + 26, w: 63, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'left', text: `GST(${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 449, y: notesY + 30, w: 116, h: 14, fontSize: 14, fontWeight: 500, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    line('totals_divider', { x: 366, y: notesY + (taxRate > 0 ? 58 : 28), w: 199, h: 1, fill: divider, section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 366, y: notesY + (taxRate > 0 ? 72 : 42), w: 32, h: 14, fontSize: 12, fontWeight: 600, color: muted, align: 'right', text: 'Total', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: notesY + (taxRate > 0 ? 68 : 38), w: 175, h: 20, fontSize: autoFontSize(m(totalDue), 20), fontWeight: 800, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    text('payment_label', { x: 30, y: notesY + 120, w: 200, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: 'Payment Details', section: 'notes', zIndex: 1 }),
    text('payment_paypal', { x: 30, y: notesY + 140, w: 250, h: 14, fontSize: 14, fontWeight: 400, color: dark, align: 'left', text: data.senderEmail ? `Paypal: ${data.senderEmail}` : '', section: 'notes', zIndex: 1 }),
    text('payment_upi', { x: 30, y: notesY + 162, w: 200, h: 14, fontSize: 14, fontWeight: 400, color: dark, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),

    line('footer_divider', { x: 30, y: 764, w: 535, h: 1, fill: divider, section: 'notes', zIndex: 1 }),
    text('footer_website', { x: 30, y: 795, w: 124, h: 14, fontSize: 14, fontWeight: 400, color: accent, align: 'left', text: data.senderAddress ? '' : '', section: 'notes', zIndex: 1 }),
    text('footer_email', { x: 252, y: 795, w: 116, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
    text('footer_phone', { x: 466, y: 795, w: 100, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
  ];
}

// ── Invoice 4 (2018 Legacy) — top purple bar, TO:/FROM:/INFO: 3-column header ──
export function getInvoice2018_04Elements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const noteBg = '#f5f5fa';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 26;
  const lastItemY = 353 + (items.length - 1) * rowH;
  const totalsY = lastItemY + 50;

  return [
    rect('top_bar', { x: 0, y: 0, w: 595, h: 10, fill: accent, section: 'header', zIndex: 1 }),
    text('header_title', { x: 30, y: 40, w: 200, h: 40, fontSize: 36, fontWeight: 400, color: dark, align: 'left', text: 'Invoice', section: 'header', zIndex: 1 }),
    text('meta_invnum_value', { x: 529, y: 47, w: 34, h: 30, fontSize: 24, fontWeight: 400, color: dark, align: 'right', text: data.invoiceNumber || '', section: 'header', zIndex: 1 }),

    text('to_label', { x: 30, y: 125, w: 100, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: 'TO:', section: 'client', zIndex: 1 }),
    text('client_name', { x: 30, y: 147, w: 130, h: 16, fontSize: 14, fontWeight: 600, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 30, y: 169, w: 130, h: 40, fontSize: 12, fontWeight: 400, color: dark, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    text('from_label', { x: 176, y: 125, w: 100, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: 'FROM:', section: 'header', zIndex: 1 }),
    text('header_name', { x: 176, y: 147, w: 244, h: 16, fontSize: 14, fontWeight: 600, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 176, y: 169, w: 244, h: 40, fontSize: 12, fontWeight: 400, color: dark, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),

    text('info_label', { x: 436, y: 125, w: 100, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: 'INFO:', section: 'meta', zIndex: 1 }),
    text('info_amount', { x: 436, y: 147, w: 130, h: 16, fontSize: 11, fontWeight: 600, color: dark, align: 'left', text: `Amount: ${m(totalDue)}`, section: 'meta', zIndex: 1 }),
    text('info_date', { x: 436, y: 169, w: 130, h: 14, fontSize: 14, fontWeight: 400, color: dark, align: 'left', text: `Date: ${data.issueDate || ''}`, section: 'meta', zIndex: 1 }),
    text('info_ref', { x: 436, y: 191, w: 130, h: 14, fontSize: 14, fontWeight: 400, color: dark, align: 'left', text: `Ref: ${data.referenceNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('info_dues', { x: 436, y: 213, w: 130, h: 14, fontSize: 14, fontWeight: 400, color: dark, align: 'left', text: `Dues: ${data.dueDate || ''}`, section: 'meta', zIndex: 1 }),

    text('meta_subject_label', { x: 176, y: 281, w: 105, h: 14, fontSize: 12, fontWeight: 400, color: muted, align: 'left', text: 'Subject:', section: 'meta', zIndex: 1 }),
    text('meta_subject_value', { x: 232, y: 279, w: 183, h: 20, fontSize: 16, fontWeight: 600, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),

    text('items_head_desc', { x: 176, y: 318, w: 122, h: 12, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: 'Item description', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 359, y: 318, w: 27, h: 12, fontSize: 12, fontWeight: 500, color: muted, align: 'right', text: 'Qty', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 345, y: 318, w: 100, h: 12, fontSize: 12, fontWeight: 500, color: muted, align: 'right', text: 'Rate', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 483, y: 318, w: 80, h: 12, fontSize: 12, fontWeight: 500, color: muted, align: 'right', text: 'Amount', section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      const y = 353 + i * rowH;
      return [
        text(`item_${i}_name`, { x: 176, y, w: 180, h: 14, fontSize: 12, fontWeight: 400, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 359, y, w: 27, h: 14, fontSize: 12, fontWeight: 600, color: dark, align: 'right', text: String(item.quantity).padStart(2, '0'), section: 'items', zIndex: 1 }),
        text(`item_${i}_rate`, { x: 345, y, w: 100, h: 14, fontSize: 12, fontWeight: 600, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 483, y, w: 80, h: 14, fontSize: 12, fontWeight: 600, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      ];
    }),

    line('totals_divider_1', { x: 176, y: totalsY - 10, w: 389, h: 2, fill: muted, section: 'totals', zIndex: 1 }),
    text('totals_subtotal_label', { x: 176, y: totalsY, w: 62, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: 'Sub Total', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 497, y: totalsY, w: 66, h: 14, fontSize: autoFontSize(m(subtotal), 12), fontWeight: 700, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    ...(taxRate > 0 ? [
      text('totals_tax_label', { x: 176, y: totalsY + 25, w: 62, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: `GST(${taxRate}%)`, section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
      text('totals_tax_value', { x: 513, y: totalsY + 25, w: 52, h: 14, fontSize: 12, fontWeight: 700, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 } as Omit<TextElement, 'id' | 'type'>),
    ] : []),
    text('totals_total_label', { x: 176, y: totalsY + 61, w: 110, h: 14, fontSize: 12, fontWeight: 600, color: dark, align: 'left', text: `Total (${data.currency || ''})`, section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 388, y: totalsY + 56, w: 175, h: 20, fontSize: autoFontSize(m(totalDue), 20), fontWeight: 800, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    rect('note_bg', { x: 162, y: totalsY + 116, w: 433, h: 55, fill: noteBg, section: 'notes', zIndex: 0 }),
    text('footer_note_label', { x: 176, y: totalsY + 121, w: 200, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: 'Note', section: 'notes', zIndex: 1 }),
    text('footer_note_value', { x: 176, y: totalsY + 141, w: 200, h: 20, fontSize: 16, fontWeight: 600, color: dark, align: 'left', text: 'Thanks for the business.', section: 'notes', zIndex: 1 }),
    text('payment_label', { x: 176, y: totalsY + 190, w: 200, h: 14, fontSize: 12, fontWeight: 500, color: muted, align: 'left', text: 'Payment Details', section: 'notes', zIndex: 1 }),
    text('payment_value', { x: 176, y: totalsY + 210, w: 380, h: 14, fontSize: 12, fontWeight: 400, color: dark, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),

    text('footer_website', { x: 100, y: 805, w: 124, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress ? '' : '', section: 'notes', zIndex: 1 }),
    text('footer_email', { x: 287, y: 805, w: 116, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
    text('footer_phone', { x: 465, y: 805, w: 100, h: 14, fontSize: 14, fontWeight: 400, color: muted, align: 'left', text: data.senderPhone || '', section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
  ];
}

// ── Quotation Modern Canvas Elements ──
export function getQuotationModernElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const band = '#f0fdf4';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;

  const els: InvoiceElement[] = [
    text('header_name', { x: 32, y: 32, w: 280, h: 22, fontSize: 18, fontWeight: 700, color: accent, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 32, y: 56, w: 280, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_contact', { x: 32, y: 72, w: 280, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `${data.senderEmail || ''} • ${data.senderPhone || ''}`, section: 'header', zIndex: 1 }),

    text('title_quote', { x: 350, y: 32, w: 213, h: 30, fontSize: 24, fontWeight: 800, color: dark, align: 'right', text: 'QUOTATION', section: 'header', zIndex: 1 }),
    text('meta_number', { x: 350, y: 64, w: 213, h: 14, fontSize: 10, fontWeight: 600, color: accent, align: 'right', text: `#${data.invoiceNumber || data.quoteNumber || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_date', { x: 350, y: 80, w: 213, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: `Date: ${data.issueDate || ''}`, section: 'meta', zIndex: 1 }),

    rect('panel_client_bg', { x: 32, y: 110, w: 531, h: 60, fill: band, radius: 8, section: 'client', zIndex: 0 }),
    text('client_label', { x: 48, y: 120, w: 200, h: 12, fontSize: 9, fontWeight: 700, color: accent, align: 'left', text: 'PREPARED FOR', section: 'client', zIndex: 1 }),
    text('client_name', { x: 48, y: 134, w: 220, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 48, y: 150, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    text('validity_label', { x: 320, y: 120, w: 227, h: 12, fontSize: 9, fontWeight: 700, color: accent, align: 'right', text: 'QUOTE VALIDITY', section: 'meta', zIndex: 1 }),
    text('validity_date', { x: 320, y: 134, w: 227, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: `Valid Until: ${data.dueDate || ''}`, section: 'meta', zIndex: 1 }),
    text('validity_ref', { x: 320, y: 150, w: 227, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: `Ref: ${data.referenceNumber || ''}`, section: 'meta', zIndex: 1 }),

    text('scope_label', { x: 32, y: 190, w: 200, h: 12, fontSize: 10, fontWeight: 700, color: muted, align: 'left', text: 'SUBJECT / PROJECT SCOPE', section: 'meta', zIndex: 1 }),
    text('scope_value', { x: 32, y: 206, w: 531, h: 16, fontSize: 12, fontWeight: 600, color: dark, align: 'left', text: data.subject || '', section: 'meta', zIndex: 1, semanticField: 'subject' }),

    line('divider_items', { x: 32, y: 235, w: 531, h: 2, fill: accent, section: 'items', zIndex: 1 }),
    text('items_head_desc', { x: 32, y: 243, w: 240, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'ITEM & DESCRIPTION', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 295, y: 243, w: 30, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: 'QTY', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 335, y: 243, w: 110, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'RATE', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 455, y: 243, w: 108, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'ESTIMATED AMOUNT', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    let y = 265 + i * rowH;
    if (y > 700) {
      const overflowIdx = Math.floor((y - 700) / rowH);
      y = 940 + overflowIdx * rowH;
    }
    els.push(
      text(`item_${i}_name`, { x: 32, y, w: 240, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 295, y, w: 30, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'center', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 335, y, w: 110, h: 14, fontSize: autoFontSize(m(item.unitPrice), 10), fontWeight: 500, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 455, y, w: 108, h: 14, fontSize: autoFontSize(m(item.total), 10), fontWeight: 600, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      line(`item_${i}_line`, { x: 32, y: y + 24, w: 531, h: 1, fill: '#e5e7eb', section: 'items', zIndex: 1 }),
    );
  });

  const lastRawY = 265 + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  const totalsY = lastItemY + 36;
  const totalPages = Math.floor((totalsY + 90) / 842) + 1;
  const lastPageOffset = (totalPages - 1) * 842;
  const footerY = Math.max(lastPageOffset + 760, totalsY + 100);

  els.push(
    rect('panel_totals_bg', { x: 333, y: totalsY, w: 230, h: 80, fill: '#fafafa', radius: 8, section: 'totals', zIndex: 0 }),
    text('totals_subtotal_label', { x: 349, y: totalsY + 10, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 449, y: totalsY + 10, w: 98, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 500, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
  );
  if (taxRate > 0) {
    els.push(
      text('totals_tax_label', { x: 349, y: totalsY + 28, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: dark, align: 'left', text: `Tax (${taxRate}%)`, section: 'totals', zIndex: 1 }),
      text('totals_tax_value', { x: 449, y: totalsY + 28, w: 98, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 500, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    );
  }
  els.push(
    line('totals_divider', { x: 349, y: totalsY + 48, w: 198, h: 1, fill: '#e5e7eb', section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 349, y: totalsY + 54, w: 100, h: 16, fontSize: 12, fontWeight: 800, color: accent, align: 'left', text: 'Total Estimate', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 449, y: totalsY + 54, w: 98, h: 16, fontSize: autoFontSize(m(totalDue), 12), fontWeight: 800, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    line('footer_divider', { x: 32, y: footerY, w: 531, h: 1, fill: '#e5e7eb', section: 'notes', zIndex: 1 }),
    text('terms_label', { x: 32, y: footerY + 10, w: 300, h: 12, fontSize: 9, fontWeight: 700, color: muted, align: 'left', text: 'TERMS & CONDITIONS', section: 'notes', zIndex: 1 }),
    text('terms_value', { x: 32, y: footerY + 26, w: 330, h: 28, fontSize: 9, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    line('signature_line', { x: 383, y: footerY + 40, w: 180, h: 1, fill: dark, section: 'notes', zIndex: 1 }),
    text('signature_label', { x: 383, y: footerY + 46, w: 180, h: 12, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: 'Client Acceptance Signature', section: 'notes', zIndex: 1 }),
  );

  return els;
}

// ── Proposal Corporate Canvas Elements ──
export function getProposalCorporateElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1e1b4b';
  const muted = '#475569';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;

  const els: InvoiceElement[] = [
    rect('badge_proposal', { x: 36, y: 34, w: 140, h: 22, fill: '#ffe4e6', radius: 999, section: 'header', zIndex: 0 }),
    text('badge_text', { x: 36, y: 38, w: 140, h: 14, fontSize: 9, fontWeight: 800, color: accent, align: 'center', text: 'PROJECT PROPOSAL', section: 'header', zIndex: 1 }),
    text('header_subject', { x: 36, y: 64, w: 340, h: 24, fontSize: 15, fontWeight: 800, color: dark, align: 'left', text: data.subject || '', section: 'header', zIndex: 1, semanticField: 'subject' }),
    text('header_id', { x: 36, y: 92, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `Proposal ID: #${data.invoiceNumber || data.proposalId || ''}`, section: 'header', zIndex: 1 }),

    text('header_org', { x: 380, y: 36, w: 179, h: 16, fontSize: 11, fontWeight: 700, color: accent, align: 'right', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_email', { x: 380, y: 54, w: 179, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderEmail || '', section: 'header', zIndex: 1, semanticField: 'senderEmail' }),

    line('div_meta_top', { x: 36, y: 120, w: 523, h: 1, fill: '#e2e8f0', section: 'meta', zIndex: 1 }),
    text('prep_for_label', { x: 36, y: 130, w: 150, h: 12, fontSize: 9, fontWeight: 700, color: muted, align: 'left', text: 'PREPARED FOR', section: 'client', zIndex: 1 }),
    text('prep_for_val', { x: 36, y: 144, w: 180, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),

    text('prep_by_label', { x: 230, y: 130, w: 150, h: 12, fontSize: 9, fontWeight: 700, color: muted, align: 'left', text: 'PREPARED BY', section: 'header', zIndex: 1 }),
    text('prep_by_val', { x: 230, y: 144, w: 180, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),

    text('date_label', { x: 420, y: 130, w: 139, h: 12, fontSize: 9, fontWeight: 700, color: muted, align: 'right', text: 'PROPOSAL DATE', section: 'meta', zIndex: 1 }),
    text('date_val', { x: 420, y: 144, w: 139, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    line('div_meta_bot', { x: 36, y: 168, w: 523, h: 1, fill: '#e2e8f0', section: 'meta', zIndex: 1 }),

    rect('card_summary', { x: 36, y: 184, w: 523, h: 64, fill: '#faf5ff', stroke: accent, strokeWidth: 1, radius: 4, section: 'notes', zIndex: 0 }),
    text('summary_title', { x: 50, y: 194, w: 450, h: 12, fontSize: 9, fontWeight: 800, color: accent, align: 'left', text: 'EXECUTIVE SUMMARY & OVERVIEW', section: 'notes', zIndex: 1 }),
    text('summary_body', { x: 50, y: 210, w: 495, h: 30, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    text('deliverables_head', { x: 36, y: 268, w: 300, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: 'SCOPE OF DELIVERABLES & PRICING', section: 'items', zIndex: 1 }),
    rect('table_head_bg', { x: 36, y: 288, w: 523, h: 24, fill: '#f1f5f9', radius: 4, section: 'items', zIndex: 0 }),
    text('th_task', { x: 48, y: 294, w: 220, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'DELIVERABLE / TASK', section: 'items', zIndex: 1 }),
    text('th_qty', { x: 310, y: 294, w: 40, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: 'QTY', section: 'items', zIndex: 1 }),
    text('th_rate', { x: 380, y: 294, w: 70, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'RATE', section: 'items', zIndex: 1 }),
    text('th_amount', { x: 470, y: 294, w: 77, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'INVESTMENT', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    const y = 320 + i * rowH;
    els.push(
      text(`item_${i}_name`, { x: 48, y, w: 250, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 310, y, w: 40, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'center', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 380, y, w: 70, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 470, y, w: 77, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      line(`item_${i}_line`, { x: 36, y: y + 24, w: 523, h: 1, fill: '#f1f5f9', section: 'items', zIndex: 1 }),
    );
  });

  const lastItemY = 320 + (items.length - 1) * rowH;
  const totalsY = lastItemY + 36;

  els.push(
    text('totals_subtotal_label', { x: 330, y: totalsY, w: 120, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Subtotal Investment', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_val', { x: 460, y: totalsY, w: 99, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    line('totals_div', { x: 330, y: totalsY + 20, w: 229, h: 2, fill: dark, section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 330, y: totalsY + 28, w: 120, h: 16, fontSize: 12, fontWeight: 800, color: accent, align: 'left', text: 'Total Investment', section: 'totals', zIndex: 1 }),
    text('totals_total_val', { x: 460, y: totalsY + 28, w: 99, h: 16, fontSize: 12, fontWeight: 800, color: accent, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    line('sig_div', { x: 36, y: 770, w: 523, h: 1, fill: '#e2e8f0', section: 'notes', zIndex: 1 }),
    line('sig_provider_line', { x: 36, y: 810, w: 200, h: 1, fill: dark, section: 'notes', zIndex: 1 }),
    text('sig_provider_text', { x: 36, y: 816, w: 200, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: 'Authorized Provider Signature', section: 'notes', zIndex: 1 }),

    line('sig_client_line', { x: 359, y: 810, w: 200, h: 1, fill: dark, section: 'notes', zIndex: 1 }),
    text('sig_client_text', { x: 359, y: 816, w: 200, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: 'Client Approval Signature', section: 'notes', zIndex: 1 }),
  );

  return els;
}

// ── Receipt Official Canvas Elements ──
export function getReceiptOfficialElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#064e3b';
  const muted = '#475569';
  const greenBadge = '#10b981';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;

  const els: InvoiceElement[] = [
    rect('badge_paid', { x: 36, y: 32, w: 120, h: 22, fill: '#ecfdf5', stroke: '#a7f3d0', strokeWidth: 1, radius: 999, section: 'header', zIndex: 0 }),
    text('badge_paid_text', { x: 36, y: 36, w: 120, h: 14, fontSize: 10, fontWeight: 800, color: greenBadge, align: 'center', text: '✓ PAID IN FULL', section: 'header', zIndex: 1 }),

    text('title_receipt', { x: 36, y: 62, w: 250, h: 28, fontSize: 24, fontWeight: 800, color: dark, align: 'left', text: 'PAYMENT RECEIPT', section: 'header', zIndex: 1 }),
    text('meta_receipt_num', { x: 36, y: 92, w: 200, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: `Receipt #${data.invoiceNumber || data.receiptNumber || ''}`, section: 'meta', zIndex: 1 }),

    text('header_org', { x: 360, y: 32, w: 199, h: 18, fontSize: 16, fontWeight: 700, color: accent, align: 'right', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 360, y: 52, w: 199, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_email', { x: 360, y: 68, w: 199, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderEmail || '', section: 'header', zIndex: 1, semanticField: 'senderEmail' }),

    rect('panel_meta_bg', { x: 36, y: 120, w: 523, h: 64, fill: '#f8fafc', radius: 8, section: 'meta', zIndex: 0 }),
    text('rec_from_label', { x: 52, y: 130, w: 150, h: 12, fontSize: 9, fontWeight: 700, color: muted, align: 'left', text: 'RECEIVED FROM', section: 'client', zIndex: 1 }),
    text('rec_from_name', { x: 52, y: 144, w: 200, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('rec_from_address', { x: 52, y: 160, w: 200, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    text('meta_details_label', { x: 320, y: 130, w: 223, h: 12, fontSize: 9, fontWeight: 700, color: muted, align: 'right', text: 'PAYMENT DETAILS', section: 'meta', zIndex: 1 }),
    text('meta_date_val', { x: 320, y: 144, w: 223, h: 12, fontSize: 10, fontWeight: 400, color: dark, align: 'right', text: `Date Paid: ${data.issueDate || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_method_val', { x: 320, y: 158, w: 223, h: 12, fontSize: 10, fontWeight: 400, color: dark, align: 'right', text: `Payment Method: ${data.paymentMethod || ''}`, section: 'meta', zIndex: 1 }),

    line('divider_items', { x: 36, y: 204, w: 523, h: 2, fill: greenBadge, section: 'items', zIndex: 1 }),
    text('th_desc', { x: 36, y: 212, w: 300, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'DESCRIPTION OF PAID ITEMS / SERVICES', section: 'items', zIndex: 1 }),
    text('th_qty', { x: 380, y: 212, w: 40, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: 'QTY', section: 'items', zIndex: 1 }),
    text('th_amount', { x: 450, y: 212, w: 109, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'AMOUNT PAID', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    const y = 234 + i * rowH;
    els.push(
      text(`item_${i}_name`, { x: 36, y, w: 320, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 380, y, w: 40, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'center', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 450, y, w: 109, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      line(`item_${i}_line`, { x: 36, y: y + 24, w: 523, h: 1, fill: '#e2e8f0', section: 'items', zIndex: 1 }),
    );
  });

  const lastItemY = 234 + (items.length - 1) * rowH;
  const totalsY = lastItemY + 36;

  els.push(
    rect('totals_panel', { x: 329, y: totalsY, w: 230, h: 84, fill: '#ecfdf5', stroke: '#a7f3d0', strokeWidth: 1, radius: 8, section: 'totals', zIndex: 0 }),
    text('tot_sub', { x: 345, y: totalsY + 10, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('tot_sub_val', { x: 445, y: totalsY + 10, w: 98, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    line('tot_div', { x: 345, y: totalsY + 30, w: 198, h: 1, fill: '#a7f3d0', section: 'totals', zIndex: 1 }),
    text('tot_rec_label', { x: 345, y: totalsY + 36, w: 100, h: 16, fontSize: 12, fontWeight: 800, color: greenBadge, align: 'left', text: 'Total Received', section: 'totals', zIndex: 1 }),
    text('tot_rec_val', { x: 445, y: totalsY + 36, w: 98, h: 16, fontSize: 12, fontWeight: 800, color: greenBadge, align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),
    text('tot_bal_label', { x: 345, y: totalsY + 58, w: 100, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: 'Balance Due', section: 'totals', zIndex: 1 }),
    text('tot_bal_val', { x: 445, y: totalsY + 58, w: 98, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: (data.currencySymbol || '') + '0.00', section: 'totals', zIndex: 1 }),

    line('footer_div', { x: 36, y: 770, w: 523, h: 1, fill: '#e2e8f0', section: 'notes', zIndex: 1 }),
    text('thanks_title', { x: 36, y: 780, w: 300, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: 'Thank you for your business!', section: 'notes', zIndex: 1 }),
    text('thanks_sub', { x: 36, y: 796, w: 300, h: 12, fontSize: 9, fontWeight: 400, color: muted, align: 'left', text: 'This is an official receipt of payment received.', section: 'notes', zIndex: 1 }),

    line('sig_line', { x: 399, y: 810, w: 160, h: 1, fill: dark, section: 'notes', zIndex: 1 }),
    text('sig_text', { x: 399, y: 816, w: 160, h: 12, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: 'Authorized Signature', section: 'notes', zIndex: 1 }),
  );

  return els;
}

// ── Purchase Order Standard Canvas Elements ──
export function getPurchaseOrderStandardElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#0c4a6e';
  const muted = '#475569';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 34;

  const els: InvoiceElement[] = [
    text('title_po', { x: 32, y: 32, w: 250, h: 28, fontSize: 24, fontWeight: 800, color: accent, align: 'left', text: 'PURCHASE ORDER', section: 'header', zIndex: 1 }),
    text('po_number', { x: 32, y: 62, w: 200, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: `P.O. Number: #${data.invoiceNumber || data.poNumber || ''}`, section: 'meta', zIndex: 1 }),

    text('header_org', { x: 350, y: 32, w: 213, h: 16, fontSize: 14, fontWeight: 700, color: dark, align: 'right', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_address', { x: 350, y: 50, w: 213, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_email', { x: 350, y: 66, w: 213, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderEmail || '', section: 'header', zIndex: 1, semanticField: 'senderEmail' }),

    rect('card_vendor_bg', { x: 32, y: 96, w: 255, h: 64, fill: '#f0f9ff', stroke: '#bae6fd', strokeWidth: 1, radius: 6, section: 'client', zIndex: 0 }),
    text('vendor_label', { x: 46, y: 106, w: 200, h: 12, fontSize: 9, fontWeight: 700, color: accent, align: 'left', text: 'VENDOR / SUPPLIER', section: 'client', zIndex: 1 }),
    text('vendor_name', { x: 46, y: 120, w: 225, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('vendor_address', { x: 46, y: 136, w: 225, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    rect('card_shipto_bg', { x: 308, y: 96, w: 255, h: 64, fill: '#f0f9ff', stroke: '#bae6fd', strokeWidth: 1, radius: 6, section: 'header', zIndex: 0 }),
    text('shipto_label', { x: 322, y: 106, w: 200, h: 12, fontSize: 9, fontWeight: 700, color: accent, align: 'left', text: 'SHIP TO / DELIVER TO', section: 'header', zIndex: 1 }),
    text('shipto_name', { x: 322, y: 120, w: 225, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('shipto_address', { x: 322, y: 136, w: 225, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),

    line('meta_div_top', { x: 32, y: 176, w: 531, h: 1, fill: '#e2e8f0', section: 'meta', zIndex: 1 }),
    text('meta_order_date', { x: 32, y: 184, w: 120, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: `Order Date: ${data.issueDate || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_deliv_date', { x: 165, y: 184, w: 140, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: `Expected: ${data.dueDate || ''}`, section: 'meta', zIndex: 1 }),
    text('meta_ship_method', { x: 320, y: 184, w: 130, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: 'Freight: Standard', section: 'meta', zIndex: 1 }),
    text('meta_terms', { x: 460, y: 184, w: 103, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'right', text: 'Terms: Net 30', section: 'meta', zIndex: 1 }),
    line('meta_div_bot', { x: 32, y: 206, w: 531, h: 1, fill: '#e2e8f0', section: 'meta', zIndex: 1 }),

    rect('th_bg', { x: 32, y: 218, w: 531, h: 24, fill: '#e0f2fe', radius: 4, section: 'items', zIndex: 0 }),
    text('th_desc', { x: 44, y: 224, w: 250, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'ITEM DESCRIPTION', section: 'items', zIndex: 1 }),
    text('th_qty', { x: 320, y: 224, w: 105, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: 'QTY ORDERED', section: 'items', zIndex: 1 }),
    text('th_price', { x: 395, y: 224, w: 70, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'UNIT PRICE', section: 'items', zIndex: 1 }),
    text('th_total', { x: 475, y: 224, w: 76, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'EXTENDED TOTAL', section: 'items', zIndex: 1 }),
  ];

  items.forEach((item, i) => {
    const y = 250 + i * rowH;
    els.push(
      text(`item_${i}_name`, { x: 44, y, w: 260, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 320, y, w: 105, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'center', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 345, y, w: 70, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 475, y, w: 76, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      line(`item_${i}_line`, { x: 32, y: y + 24, w: 531, h: 1, fill: '#f1f5f9', section: 'items', zIndex: 1 }),
    );
  });

  const lastItemY = 250 + (items.length - 1) * rowH;
  const totalsY = lastItemY + 36;

  els.push(
    text('tot_sub_label', { x: 343, y: totalsY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('tot_sub_val', { x: 451, y: totalsY, w: 100, h: 14, fontSize: 10, fontWeight: 500, color: muted, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),

    rect('bar_total_bg', { x: 343, y: totalsY + 22, w: 220, h: 32, fill: accent, radius: 6, section: 'totals', zIndex: 0 }),
    text('tot_po_label', { x: 355, y: totalsY + 30, w: 100, h: 16, fontSize: 11, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Total P.O. Amount', section: 'totals', zIndex: 1 }),
    text('tot_po_val', { x: 455, y: totalsY + 30, w: 96, h: 16, fontSize: 11, fontWeight: 800, color: '#ffffff', align: 'right', text: m(totalDue), section: 'totals', zIndex: 1 }),

    line('footer_div', { x: 32, y: 770, w: 531, h: 1, fill: '#e2e8f0', section: 'notes', zIndex: 1 }),
    text('instr_label', { x: 32, y: 780, w: 300, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'INSTRUCTIONS & CONDITIONS', section: 'notes', zIndex: 1 }),
    text('instr_val', { x: 32, y: 796, w: 320, h: 28, fontSize: 9, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    line('sig_line', { x: 383, y: 810, w: 180, h: 1, fill: dark, section: 'notes', zIndex: 1 }),
    text('sig_text', { x: 383, y: 816, w: 180, h: 12, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: 'Authorized Purchaser Signature', section: 'notes', zIndex: 1 }),
  );

  return els;
}

// ── Invoice 8 (2023, Grid Bordered) — warm off-white, dark grid borders, boxed digits, black total banner ──
export const getInvoice2023_08Elements: (data: InvoiceData, _accent: string) => InvoiceElement[] = (data) => {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1a1a';
  const muted = '#555555';
  const borderCol = '#2d2d2d';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 36;
  const itemsStartY = 188;
  const lastRawY = itemsStartY + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  // The source design (see renderInvoice2023_08 in templateRenderer.ts)
  // pins SUBTOTAL/TAX/TOTAL/terms to the BOTTOM of the bordered box via a
  // CSS flex spacer — not immediately below the last item row. With few
  // line items that leaves a large gap right after the items instead of
  // right before the totals, the opposite of the intended layout. Anchor
  // to the bottom of whichever page the last item lands on, falling back
  // to "right after the items" only once there's not enough room to do
  // that (many items filling the page) — matching the flex spacer
  // collapsing to its own min-height in the same situation.
  const minSubtotalY = lastItemY + rowH;
  const lastItemPageIndex = Math.floor(lastItemY / 842);
  const pageBottomY = lastItemPageIndex * 842 + 822;
  const anchoredSubtotalY = pageBottomY - 154; // 154 = totals+terms block's own height
  const subtotalY = Math.max(minSubtotalY, anchoredSubtotalY);
  const taxY = subtotalY + 30;
  const totalY = taxY + 30;
  const termsY = totalY + 44;

  const rawNum = data.invoiceNumber || '';
  const digits = [rawNum];

  return [
    ...Array.from({ length: Math.max(1, Math.ceil((termsY + 44) / 842)) }, (_, pIdx) => [
      rect(`outer_border_${pIdx}`, { x: 20, y: pIdx * 842 + 20, w: 555, h: 802, fill: '#f7f6f0', stroke: borderCol, strokeWidth: 2, section: 'header', zIndex: 0 }),
      line(`col_divider_${pIdx}`, { x: 235, y: pIdx * 842 + 20, w: 2, h: 802, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
      ...(pIdx > 0 ? [
        text(`page_${pIdx}_cont_title`, { x: 32, y: pIdx * 842 + 32, w: 190, h: 20, fontSize: 12, fontWeight: 800, color: dark, align: 'left', text: 'INVOICE (CONT.)', section: 'header', zIndex: 1 }),
        text(`page_${pIdx}_cont_num`, { x: 32, y: pIdx * 842 + 54, w: 190, h: 14, fontSize: 8.5, fontWeight: 600, color: muted, align: 'left', text: `Invoice #${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
        line(`page_${pIdx}_cont_div`, { x: 20, y: pIdx * 842 + 74, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
      ] : []),
    ]).flat(),

    // Left Column
    text('header_title', { x: 32, y: 32, w: 190, h: 40, fontSize: 32, fontWeight: 900, color: dark, align: 'left', text: 'INVOICE', section: 'header', zIndex: 1 }),
    line('div_1', { x: 20, y: 84, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
    text('meta_issued_label', { x: 32, y: 94, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'ISSUED ON', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 32, y: 108, w: 190, h: 16, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    line('div_2', { x: 20, y: 132, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
    text('payable_label', { x: 32, y: 142, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'PAYABLE TO', section: 'header', zIndex: 1 }),
    text('header_name', { x: 32, y: 156, w: 190, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_entity', { x: 32, y: 172, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Entity Name', section: 'header', zIndex: 1 }),
    text('header_address', { x: 32, y: 186, w: 190, h: 32, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_email', { x: 32, y: 222, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: data.senderEmail || '', section: 'header', zIndex: 1, semanticField: 'senderEmail' }),
    line('div_3', { x: 20, y: 242, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'client', zIndex: 1 }),
    text('billed_label', { x: 32, y: 252, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'BILLED TO', section: 'client', zIndex: 1 }),
    text('client_name', { x: 32, y: 266, w: 190, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_entity', { x: 32, y: 282, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Entity Name', section: 'client', zIndex: 1 }),
    text('client_website', { x: 32, y: 296, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: 'website.com', section: 'client', zIndex: 1 }),
    text('client_address', { x: 32, y: 310, w: 190, h: 32, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('client_email', { x: 32, y: 346, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: String(data.clientEmail || ''), section: 'client', zIndex: 1, semanticField: 'clientEmail' }),
    line('div_4', { x: 20, y: 366, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'notes', zIndex: 1 }),
    text('payment_label', { x: 32, y: 376, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'PAYMENT INFORMATION', section: 'notes', zIndex: 1 }),
    text('payment_bank', { x: 32, y: 394, w: 190, h: 48, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: String(data.accountDetails || ''), section: 'notes', zIndex: 1 }),
    text('payment_paypal', { x: 32, y: 448, w: 190, h: 24, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: String(data.accountDetails || ''), section: 'notes', zIndex: 1 }),
    text('payment_upi', { x: 32, y: 478, w: 190, h: 24, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: String(data.accountDetails || ''), semanticField: 'accountDetails', section: 'notes', zIndex: 1 }),
    rect('upi_qr_bg', { x: 32, y: 508, w: 48, h: 48, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'notes', zIndex: 1 }),
    text('upi_scan_text', { x: 32, y: 562, w: 190, h: 12, fontSize: 7, fontWeight: 400, color: muted, align: 'left', text: 'Scan to pay with any UPI app', section: 'notes', zIndex: 1 }),
    line('div_5', { x: 20, y: 580, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'notes', zIndex: 1 }),
    text('questions_title', { x: 32, y: 592, w: 190, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: 'GOT ANY QUESTIONS?', section: 'notes', zIndex: 1 }),
    text('contact_label', { x: 32, y: 610, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'CONTACT DETAILS', section: 'notes', zIndex: 1 }),
    text('contact_name', { x: 32, y: 624, w: 190, h: 13, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: data.businessName || '', section: 'notes', zIndex: 1, semanticField: 'businessName' }),
    text('contact_entity', { x: 32, y: 639, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Entity Name', section: 'notes', zIndex: 1 }),
    text('contact_website', { x: 32, y: 652, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: dark, align: 'left', underline: true, text: 'website.com', section: 'notes', zIndex: 1 }),
    text('contact_email', { x: 32, y: 665, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
    text('contact_phone', { x: 32, y: 678, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: String(data.senderPhone || ''), section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('contact_social', { x: 32, y: 696, w: 190, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: '📷   𝕏   in', section: 'notes', zIndex: 1 }),

    // Right Column
    text('to_header_label', { x: 248, y: 32, w: 150, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'INVOICE TO', section: 'client', zIndex: 1 }),
    text('client_name_right', { x: 248, y: 46, w: 160, h: 18, fontSize: 13, fontWeight: 800, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('num_header_label', { x: 418, y: 32, w: 144, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'right', text: 'INVOICE NUMBER', section: 'meta', zIndex: 1 }),
    ...digits.flatMap((d, i) => [
      rect(`digit_box_${i}`, { x: 466 + i * 16, y: 46, w: 14, h: 16, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'meta', zIndex: 1 }),
      text(`digit_txt_${i}`, { x: 466 + i * 16, y: 47, w: 14, h: 16, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: d, section: 'meta', zIndex: 2 }),
    ]),
    line('div_right_1', { x: 235, y: 84, w: 340, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
    text('proj_desc_title', { x: 248, y: 94, w: 314, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: 'PROJECT DESCRIPTION', section: 'meta', zIndex: 1 }),
    text('proj_desc_text', { x: 248, y: 112, w: 314, h: 36, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || data.subject || '', section: 'meta', zIndex: 1 }),

    // Table Header
    rect('tbl_head_bg', { x: 235, y: 156, w: 340, h: 32, fill: '#dcdbd6', stroke: borderCol, strokeWidth: 2, section: 'items', zIndex: 1 }),
    line('tbl_col_div1', { x: 435, y: 156, w: 2, h: 32, fill: borderCol, strokeWidth: 2, section: 'items', zIndex: 2 }),
    line('tbl_col_div2', { x: 480, y: 156, w: 2, h: 32, fill: borderCol, strokeWidth: 2, section: 'items', zIndex: 2 }),
    text('items_head_desc', { x: 248, y: 166, w: 180, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'left', text: 'BILLABLE ITEMS', section: 'items', zIndex: 2 }),
    text('items_head_qty', { x: 437, y: 166, w: 41, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'center', text: 'QTY.', section: 'items', zIndex: 2 }),
    text('items_head_amount', { x: 482, y: 166, w: 80, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 2 }),

    // Table Rows
    ...items.flatMap((item, i) => {
      let y = itemsStartY + i * rowH;
      if (y > 700) {
        const overflowIdx = Math.floor((y - 700) / rowH);
        y = 940 + overflowIdx * rowH;
      }
      return [
        text(`item_${i}_desc`, { x: 248, y: y + 6, w: 180, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 437, y: y + 6, w: 41, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: String(item.quantity).padStart(2, '0'), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 482, y: y + 6, w: 80, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
        line(`item_row_div_${i}`, { x: 235, y: y + rowH, w: 340, h: 1, fill: borderCol, strokeWidth: 1, section: 'items', zIndex: 1 }),
      ];
    }),

    // Totals Section
    line('div_subtotal_top', { x: 235, y: subtotalY - 8, w: 340, h: 2, fill: borderCol, strokeWidth: 2, section: 'totals', zIndex: 1 }),
    text('totals_subtotal_label', { x: 248, y: subtotalY, w: 150, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'left', text: 'SUBTOTAL', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 380, y: subtotalY, w: 183, h: 12, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 800, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    // The gap to this divider is text-box-bottom + a few px only — PDF
    // export rasterizes via html2canvas, which measures/paints text with
    // slightly different metrics than the live browser and can land the
    // divider stroke across the label glyphs at a tight gap even though
    // the live canvas (and the cloned DOM geometry itself) look correct.
    // Give it more clearance than the design strictly needs so that slop
    // never reaches the text.
    line('div_subtotal_bot', { x: 235, y: subtotalY + 24, w: 340, h: 1, fill: borderCol, strokeWidth: 1, section: 'totals', zIndex: 1 }),

    text('totals_tax_label', { x: 248, y: taxY, w: 200, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'left', text: `GST AND TAXES • ${taxRate}% of Subtotal`, section: 'totals', zIndex: 1 }),
    text('totals_tax_value', { x: 380, y: taxY, w: 183, h: 12, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 800, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    line('div_tax_bot', { x: 235, y: taxY + 24, w: 340, h: 2, fill: borderCol, strokeWidth: 2, section: 'totals', zIndex: 1 }),

    rect('total_banner_bg', { x: 235, y: totalY, w: 340, h: 36, fill: dark, section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 248, y: totalY + 10, w: 100, h: 16, fontSize: 12, fontWeight: 900, color: '#ffffff', align: 'left', text: 'TOTAL', section: 'totals', zIndex: 2 }),
    text('totals_total_value', { x: 380, y: totalY + 8, w: 182, h: 18, fontSize: autoFontSize(m(totalDue), 14), fontWeight: 900, color: '#ffffff', align: 'right', text: m(totalDue), section: 'totals', zIndex: 2 }),

    text('terms_text', { x: 248, y: termsY + 14, w: 314, h: 24, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Please make the payment within 14 days from receiving the invoice without any deductions.', section: 'notes', zIndex: 1 }),
  ];
};

export function getInvoiceOdooCommunityElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a202c';
  const muted = '#4a5568';
  const tealAccent = accent || '#0097b2';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 32;
  const itemsStartY = 286;
  const itemYPositions: number[] = [];
  let currY = itemsStartY;
  items.forEach(() => {
    currY = fitBlockY(currY, rowH, 842, 130, 40);
    itemYPositions.push(currY);
    currY += rowH;
  });
  const lastItemY = itemYPositions.length > 0 ? itemYPositions[itemYPositions.length - 1] : itemsStartY;

  const rawSubtotalY = lastItemY + rowH + 12;
  const subtotalY = fitBlockY(rawSubtotalY, 30);

  const rawTaxY = subtotalY + (taxRate > 0 ? 20 : 0);
  const taxY = fitBlockY(rawTaxY, 20);

  const rawTotalY = (taxRate > 0 ? taxY : subtotalY) + 24;
  const totalY = fitBlockY(rawTotalY, 30);

  const rawAccountY = totalY + 44;
  const accountY = fitBlockY(rawAccountY, 80);

  // The source design (see renderInvoiceOdooCommunity in templateRenderer.ts)
  // keeps the ACCOUNT DATA box right after the totals, then uses a CSS
  // `flex: 1` spacer to push NOTES and the footer down together to the
  // bottom of the page — not immediately below ACCOUNT DATA. Mirror that by
  // anchoring notesY to sit a fixed reserve above the footer's own
  // bottom-pinned position, falling back to "right after ACCOUNT DATA" only
  // once there's not enough room to do that (matching the flex spacer
  // collapsing to zero in the same situation).
  const rawNotesY = accountY + 90;
  // fitBlockY's own 130px bottom-margin safety check is meant for "does
  // this block fit on the CURRENT page", not for an intentional near-bottom
  // anchor — the anchor below is already computed to leave exactly enough
  // room for the footer beneath it, so only run the sequential candidate
  // through it (to still catch genuine multi-page overflow for long docs).
  const sequentialNotesY = fitBlockY(rawNotesY, 50);
  const notesPageIndex = Math.floor(accountY / 842);
  // calculateFooterY adds another +36 on top of the +36 already added at its
  // call site below (lastContentY = notesY + 36, then lastY = lastContentY +
  // 36), plus a further +16 — an existing +88 total offset from notesY to
  // its "lastY + 16" branch. Target the anchor so that branch lands exactly
  // on calculateFooterY's own default footer position (790) rather than
  // past it, which would push totalDocHeight over one page and add a
  // spurious blank second page.
  const anchoredNotesY = notesPageIndex * 842 + (790 - 88);
  const notesY = Math.max(sequentialNotesY, anchoredNotesY);

  const footerY = calculateFooterY(notesY + 36, 842, 790);
  const totalDocHeight = Math.max(842, footerY + 50);
  const totalPages = Math.ceil(totalDocHeight / 842);
  const sidebarH = totalPages * 842;

  const els: InvoiceElement[] = [
    // Left Accent Sidebar Bar
    rect('sidebar_accent', { x: 0, y: 0, w: 24, h: sidebarH, fill: tealAccent, section: 'header', zIndex: 0 }),

    // Header
    text('header_name', { x: 64, y: 32, w: 260, h: 28, fontSize: 24, fontWeight: 800, color: tealAccent, align: 'left', text: `${data.businessName || ''} | Invoice`, section: 'header', zIndex: 1 }),
    text('meta_invnum_label', { x: 430, y: 32, w: 125, h: 12, fontSize: 9.5, fontWeight: 800, color: '#718096', align: 'right', text: 'INVOICE NO.', section: 'meta', zIndex: 1 }),
    text('meta_invnum_value', { x: 430, y: 46, w: 125, h: 16, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: data.invoiceNumber || '', section: 'meta', zIndex: 1, semanticField: 'invoiceNumber' }),
    text('meta_invdate_label', { x: 430, y: 70, w: 125, h: 12, fontSize: 9.5, fontWeight: 800, color: '#718096', align: 'right', text: 'INVOICE DATE', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 430, y: 84, w: 125, h: 16, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: data.issueDate || '', section: 'meta', zIndex: 1, semanticField: 'issueDate' }),

    // Recipient
    text('recipient_label', { x: 64, y: 120, w: 200, h: 14, fontSize: 9.5, fontWeight: 800, color: '#718096', align: 'left', text: 'RECIPIENT', section: 'client', zIndex: 1 }),
    text('client_name', { x: 64, y: 138, w: 220, h: 16, fontSize: 12, fontWeight: 800, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_address', { x: 64, y: 158, w: 220, h: 48, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),

    // Sender
    text('sender_name', { x: 335, y: 138, w: 220, h: 16, fontSize: 12, fontWeight: 800, color: dark, align: 'right', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('sender_address', { x: 335, y: 158, w: 220, h: 48, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
  ];

  if (data.clientTaxId && String(data.clientTaxId).trim() !== '') {
    els.push(text('client_vat', { x: 64, y: 210, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `VAT no.: ${data.clientTaxId}`, section: 'client', zIndex: 1 }));
  }
  if (data.clientEmail && String(data.clientEmail).trim() !== '') {
    els.push(text('client_email', { x: 64, y: 226, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `${data.clientEmail}`, section: 'client', zIndex: 1 }));
  }
  if (data.clientPhone && String(data.clientPhone).trim() !== '') {
    els.push(text('client_phone', { x: 64, y: 242, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `${data.clientPhone}`, section: 'client', zIndex: 1 }));
  }

  if (data.senderTaxId && String(data.senderTaxId).trim() !== '') {
    els.push(text('sender_vat', { x: 335, y: 210, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: `VAT no.: ${data.senderTaxId}`, section: 'header', zIndex: 1 }));
  }
  if (data.senderEmail && String(data.senderEmail).trim() !== '') {
    els.push(text('sender_email', { x: 335, y: 226, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: `${data.senderEmail}`, section: 'header', zIndex: 1 }));
  }
  if (data.senderPhone && String(data.senderPhone).trim() !== '') {
    els.push(text('sender_phone', { x: 335, y: 242, w: 220, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: `${data.senderPhone}`, section: 'header', zIndex: 1 }));
  }

  els.push(
    // Table Header
    line('tbl_head_line', { x: 64, y: 278, w: 491, h: 2, fill: '#e2e8f0', section: 'items', zIndex: 1 }),
    text('items_head_desc', { x: 64, y: 260, w: 220, h: 14, fontSize: 10, fontWeight: 800, color: tealAccent, align: 'left', text: 'DESCRIPTION', section: 'items', zIndex: 1 }),
    text('items_head_qty', { x: 300, y: 260, w: 30, h: 14, fontSize: 10, fontWeight: 800, color: tealAccent, align: 'center', text: 'QTY', section: 'items', zIndex: 1 }),
    text('items_head_rate', { x: 335, y: 260, w: 110, h: 14, fontSize: 10, fontWeight: 800, color: tealAccent, align: 'right', text: 'UNIT PRICE', section: 'items', zIndex: 1 }),
    text('items_head_amount', { x: 455, y: 260, w: 108, h: 14, fontSize: 10, fontWeight: 800, color: tealAccent, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 1 }),
  );

  items.forEach((item, i) => {
    const y = itemYPositions[i];
    els.push(
      text(`item_${i}_desc`, { x: 64, y, w: 220, h: 16, fontSize: 10, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
      text(`item_${i}_qty`, { x: 300, y, w: 30, h: 16, fontSize: 10, fontWeight: 400, color: muted, align: 'center', text: String(item.quantity), section: 'items', zIndex: 1 }),
      text(`item_${i}_rate`, { x: 335, y, w: 110, h: 16, fontSize: 10, fontWeight: 400, color: muted, align: 'right', text: m(item.unitPrice), section: 'items', zIndex: 1 }),
      text(`item_${i}_amount`, { x: 455, y, w: 108, h: 16, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
      line(`item_${i}_line`, { x: 64, y: y + 26, w: 491, h: 1, fill: '#edf2f7', section: 'items', zIndex: 1 }),
    );
  });

  els.push(
    text('totals_subtotal_label', { x: 335, y: subtotalY, w: 100, h: 14, fontSize: 10, fontWeight: 600, color: muted, align: 'left', text: 'SUBTOTAL', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 415, y: subtotalY, w: 140, h: 14, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 600, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
  );

  if (taxRate > 0) {
    els.push(
      text('totals_tax_label', { x: 335, y: taxY, w: 110, h: 14, fontSize: 10, fontWeight: 600, color: tealAccent, align: 'left', text: `TAX (${taxRate}%)`, section: 'totals', zIndex: 1 }),
      text('totals_tax_value', { x: 415, y: taxY, w: 140, h: 14, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 600, color: tealAccent, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    );
  }

  const formattedTotalStr = m(totalDue);
  const calculatedTotalFontSize = formattedTotalStr.length > 14 ? 11 : (formattedTotalStr.length > 10 ? 13 : 15);

  els.push(
    text('totals_total_label', { x: 335, y: totalY, w: 100, h: 20, fontSize: 15, fontWeight: 800, color: tealAccent, align: 'left', text: 'TOTAL', section: 'totals', zIndex: 1 }),
    text('totals_total_value', { x: 375, y: totalY, w: 180, h: 20, fontSize: calculatedTotalFontSize, fontWeight: 800, color: tealAccent, align: 'right', text: formattedTotalStr, section: 'totals', zIndex: 1 }),

    rect('account_banner_bg', { x: 64, y: accountY, w: 491, h: 24, fill: tealAccent, section: 'notes', zIndex: 1 }),
    text('account_banner_text', { x: 74, y: accountY + 5, w: 300, h: 14, fontSize: 9.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'ACCOUNT DATA', section: 'notes', zIndex: 2 }),
    text('account_details', { x: 64, y: accountY + 32, w: 491, h: 48, fontSize: 9.5, fontWeight: 400, color: muted, align: 'left', text: data.accountDetails ? String(data.accountDetails) : '', section: 'notes', zIndex: 1 }),

    text('notes_label', { x: 64, y: notesY, w: 100, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'left', text: 'NOTES', section: 'notes', zIndex: 1 }),
    text('notes_text', { x: 64, y: notesY + 18, w: 491, h: 36, fontSize: 9.5, fontWeight: 400, color: muted, align: 'left', text: data.notesAndTerms ? String(data.notesAndTerms) : '', section: 'notes', zIndex: 1 }),

    line('footer_line', { x: 64, y: footerY, w: 491, h: 1, fill: '#e2e8f0', section: 'notes', zIndex: 1 }),
    text('footer_name', { x: 64, y: footerY + 10, w: 200, h: 12, fontSize: 8.5, fontWeight: 700, color: dark, align: 'left', text: data.businessName || '', section: 'notes', zIndex: 1, semanticField: 'businessName' }),
    text('footer_addr', { x: 64, y: footerY + 24, w: 200, h: 20, fontSize: 8.5, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress ? data.senderAddress.replace(/\n/g, ' | ') : '', section: 'notes', zIndex: 1 }),
    text('footer_contact_1', { x: 235, y: footerY + 10, w: 150, h: 12, fontSize: 8.5, fontWeight: 400, color: muted, align: 'center', text: `${data.senderEmail || ''}`, section: 'notes', zIndex: 1 }),
    text('footer_contact_2', { x: 235, y: footerY + 24, w: 150, h: 12, fontSize: 8.5, fontWeight: 400, color: muted, align: 'center', text: `${data.senderPhone || ''}`, section: 'notes', zIndex: 1 }),
    text('footer_vat_label', { x: 435, y: footerY + 10, w: 120, h: 8.5, fontSize: 8.5, fontWeight: 700, color: dark, align: 'right', text: 'CO. VAT', section: 'notes', zIndex: 1 }),
    text('footer_vat_val', { x: 435, y: footerY + 24, w: 120, h: 12, fontSize: 8.5, fontWeight: 400, color: muted, align: 'right', text: String(data.senderTaxId || ''), section: 'notes', zIndex: 1 })
  );

  return els;
}

export const getReceiptGridBorderedElements: (data: InvoiceData, _accent: string) => InvoiceElement[] = (data) => {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1a1a';
  const muted = '#555555';
  const borderCol = '#2d2d2d';
  const items = lineItems.length > 0 ? lineItems : [];
  const rowH = 36;
  const itemsStartY = 188;
  const lastRawY = itemsStartY + (items.length - 1) * rowH;
  const lastItemY = lastRawY > 700 ? 940 + Math.floor((lastRawY - 700) / rowH) * rowH : lastRawY;
  // See getInvoice2023_08Elements's matching comment — same Grid Bordered
  // design family, same "totals pinned to bottom via a flex spacer" issue.
  const minSubtotalY = lastItemY + rowH;
  const lastItemPageIndex = Math.floor(lastItemY / 842);
  const pageBottomY = lastItemPageIndex * 842 + 822;
  const anchoredSubtotalY = pageBottomY - 154;
  const subtotalY = Math.max(minSubtotalY, anchoredSubtotalY);
  const taxY = subtotalY + 30;
  const totalY = taxY + 30;
  const termsY = totalY + 44;

  const rawNum = String(data.invoiceNumber || data.receiptNumber || '');
  const digits = [rawNum];

  return [
    ...Array.from({ length: Math.max(1, Math.ceil((termsY + 44) / 842)) }, (_, pIdx) => [
      rect(`outer_border_${pIdx}`, { x: 20, y: pIdx * 842 + 20, w: 555, h: 802, fill: '#f7f6f0', stroke: borderCol, strokeWidth: 2, section: 'header', zIndex: 0 }),
      line(`col_divider_${pIdx}`, { x: 235, y: pIdx * 842 + 20, w: 2, h: 802, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
      ...(pIdx > 0 ? [
        text(`page_${pIdx}_cont_title`, { x: 32, y: pIdx * 842 + 32, w: 190, h: 20, fontSize: 12, fontWeight: 800, color: dark, align: 'left', text: 'RECEIPT (CONT.)', section: 'header', zIndex: 1 }),
        text(`page_${pIdx}_cont_num`, { x: 32, y: pIdx * 842 + 54, w: 190, h: 14, fontSize: 8.5, fontWeight: 600, color: muted, align: 'left', text: `Invoice #${data.invoiceNumber || ''}`, section: 'meta', zIndex: 1 }),
        line(`page_${pIdx}_cont_div`, { x: 20, y: pIdx * 842 + 74, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
      ] : []),
    ]).flat(),

    // Left Column
    text('header_title', { x: 32, y: 32, w: 190, h: 40, fontSize: 34, fontWeight: 900, color: dark, align: 'left', text: 'RECEIPT', section: 'header', zIndex: 1 }),
    line('div_1', { x: 20, y: 84, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
    text('meta_issued_label', { x: 32, y: 94, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'SETTLED ON', section: 'meta', zIndex: 1 }),
    text('meta_invdate_value', { x: 32, y: 108, w: 190, h: 16, fontSize: 11, fontWeight: 700, color: dark, align: 'left', text: String(data.issueDate || data.paymentDate || ''), section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    line('div_2', { x: 20, y: 132, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
    text('payable_label', { x: 32, y: 142, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'PAID BY', section: 'header', zIndex: 1 }),
    text('client_name_left', { x: 32, y: 156, w: 190, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('client_entity_left', { x: 32, y: 172, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Entity Name', section: 'client', zIndex: 1 }),
    text('client_website_left', { x: 32, y: 186, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: 'website.com', section: 'client', zIndex: 1 }),
    text('client_address_left', { x: 32, y: 200, w: 190, h: 32, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: data.clientAddress || '', section: 'client', zIndex: 1, semanticField: 'clientAddress' }),
    text('client_email_left', { x: 32, y: 236, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: String(data.clientEmail || ''), section: 'client', zIndex: 1, semanticField: 'clientEmail' }),
    line('div_3', { x: 20, y: 252, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'client', zIndex: 1 }),
    text('billed_label', { x: 32, y: 262, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'PAID TO', section: 'header', zIndex: 1 }),
    text('header_name', { x: 32, y: 276, w: 190, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('header_entity', { x: 32, y: 292, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Entity Name', section: 'header', zIndex: 1 }),
    text('header_address', { x: 32, y: 306, w: 190, h: 32, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: data.senderAddress || '', section: 'header', zIndex: 1, semanticField: 'senderAddress' }),
    text('header_email', { x: 32, y: 342, w: 190, h: 12, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: data.senderEmail || '', section: 'header', zIndex: 1, semanticField: 'senderEmail' }),
    line('div_4', { x: 20, y: 360, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'notes', zIndex: 1 }),
    text('payment_label', { x: 32, y: 370, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'PAYMENT METHOD USED', section: 'notes', zIndex: 1 }),
    text('payment_cheque', { x: 32, y: 388, w: 190, h: 56, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: String(data.accountDetails || ''), section: 'notes', zIndex: 1 }),
    text('payment_paypal', { x: 32, y: 450, w: 190, h: 48, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: String(data.accountDetails || ''), section: 'notes', zIndex: 1 }),
    line('div_5', { x: 20, y: 580, w: 215, h: 2, fill: borderCol, strokeWidth: 2, section: 'notes', zIndex: 1 }),
    text('questions_title', { x: 32, y: 592, w: 190, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: 'GOT ANY QUESTIONS?', section: 'notes', zIndex: 1 }),
    text('contact_label', { x: 32, y: 610, w: 190, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'CONTACT DETAILS', section: 'notes', zIndex: 1 }),
    text('contact_name', { x: 32, y: 624, w: 190, h: 13, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: data.businessName || '', section: 'notes', zIndex: 1, semanticField: 'businessName' }),
    text('contact_entity', { x: 32, y: 639, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Entity Name', section: 'notes', zIndex: 1 }),
    text('contact_website', { x: 32, y: 652, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: dark, align: 'left', underline: true, text: 'website.com', section: 'notes', zIndex: 1 }),
    text('contact_email', { x: 32, y: 665, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: data.senderEmail || '', section: 'notes', zIndex: 1, semanticField: 'senderEmail' }),
    text('contact_phone', { x: 32, y: 678, w: 190, h: 11, fontSize: 8, fontWeight: 400, color: dark, align: 'left', text: String(data.senderPhone || ''), section: 'notes', zIndex: 1, semanticField: 'senderPhone' }),
    text('contact_social', { x: 32, y: 696, w: 190, h: 14, fontSize: 10, fontWeight: 400, color: dark, align: 'left', text: '📷   𝕏   in', section: 'notes', zIndex: 1 }),

    // Right Column
    text('to_header_label', { x: 248, y: 32, w: 150, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'left', text: 'BILL TO', section: 'client', zIndex: 1 }),
    text('client_name_right', { x: 248, y: 46, w: 160, h: 18, fontSize: 13, fontWeight: 800, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('num_header_label', { x: 418, y: 32, w: 144, h: 12, fontSize: 8, fontWeight: 700, color: muted, align: 'right', text: 'INVOICE NUMBER', section: 'meta', zIndex: 1 }),
    ...digits.flatMap((d, i) => [
      rect(`digit_box_${i}`, { x: 466 + i * 16, y: 46, w: 14, h: 16, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'meta', zIndex: 1 }),
      text(`digit_txt_${i}`, { x: 466 + i * 16, y: 47, w: 14, h: 16, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: d, section: 'meta', zIndex: 2 }),
    ]),
    line('div_right_1', { x: 235, y: 84, w: 340, h: 2, fill: borderCol, strokeWidth: 2, section: 'header', zIndex: 1 }),
    text('proj_desc_title', { x: 248, y: 94, w: 314, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'left', text: 'PROJECT DESCRIPTION', section: 'meta', zIndex: 1 }),
    text('proj_desc_text', { x: 248, y: 112, w: 314, h: 36, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || data.subject || '', section: 'meta', zIndex: 1 }),

    // Table Header
    rect('tbl_head_bg', { x: 235, y: 156, w: 340, h: 32, fill: '#dcdbd6', stroke: borderCol, strokeWidth: 2, section: 'items', zIndex: 1 }),
    line('tbl_col_div1', { x: 435, y: 156, w: 2, h: 32, fill: borderCol, strokeWidth: 2, section: 'items', zIndex: 2 }),
    line('tbl_col_div2', { x: 480, y: 156, w: 2, h: 32, fill: borderCol, strokeWidth: 2, section: 'items', zIndex: 2 }),
    text('items_head_desc', { x: 248, y: 166, w: 180, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'left', text: 'DESCRIPTION OF ITEMS', section: 'items', zIndex: 2 }),
    text('items_head_qty', { x: 437, y: 166, w: 41, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'center', text: 'QTY.', section: 'items', zIndex: 2 }),
    text('items_head_amount', { x: 482, y: 166, w: 80, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'right', text: 'AMOUNT', section: 'items', zIndex: 2 }),

    // Table Rows
    ...items.flatMap((item, i) => {
      let y = itemsStartY + i * rowH;
      if (y > 700) {
        const overflowIdx = Math.floor((y - 700) / rowH);
        y = 940 + overflowIdx * rowH;
      }
      return [
        text(`item_${i}_desc`, { x: 248, y: y + 6, w: 180, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 1 }),
        text(`item_${i}_qty`, { x: 437, y: y + 6, w: 41, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'center', text: String(item.quantity).padStart(2, '0'), section: 'items', zIndex: 1 }),
        text(`item_${i}_amount`, { x: 482, y: y + 6, w: 80, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 1 }),
        line(`item_row_div_${i}`, { x: 235, y: y + rowH, w: 340, h: 1, fill: borderCol, strokeWidth: 1, section: 'items', zIndex: 1 }),
      ];
    }),

    // Totals Section
    line('div_subtotal_top', { x: 235, y: subtotalY - 8, w: 340, h: 2, fill: borderCol, strokeWidth: 2, section: 'totals', zIndex: 1 }),
    text('totals_subtotal_label', { x: 248, y: subtotalY, w: 150, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'left', text: 'SUBTOTAL', section: 'totals', zIndex: 1 }),
    text('totals_subtotal_value', { x: 380, y: subtotalY, w: 183, h: 12, fontSize: autoFontSize(m(subtotal), 10), fontWeight: 800, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 1 }),
    // See Invoice 8's identical div_subtotal_bot/div_tax_bot comment: extra
    // clearance guards against html2canvas PDF-export text metric slop.
    line('div_subtotal_bot', { x: 235, y: subtotalY + 24, w: 340, h: 1, fill: borderCol, strokeWidth: 1, section: 'totals', zIndex: 1 }),

    text('totals_tax_label', { x: 248, y: taxY, w: 200, h: 12, fontSize: 9, fontWeight: 800, color: dark, align: 'left', text: `GST AND TAXES • ${taxRate}% of Subtotal`, section: 'totals', zIndex: 1 }),
    text('totals_tax_value', { x: 380, y: taxY, w: 183, h: 12, fontSize: autoFontSize(m(taxAmount), 10), fontWeight: 800, color: dark, align: 'right', text: m(taxAmount), section: 'totals', zIndex: 1 }),
    line('div_tax_bot', { x: 235, y: taxY + 24, w: 340, h: 2, fill: borderCol, strokeWidth: 2, section: 'totals', zIndex: 1 }),

    rect('total_banner_bg', { x: 235, y: totalY, w: 340, h: 36, fill: dark, section: 'totals', zIndex: 1 }),
    text('totals_total_label', { x: 248, y: totalY + 10, w: 100, h: 16, fontSize: 12, fontWeight: 900, color: '#ffffff', align: 'left', text: 'BILL TOTAL', section: 'totals', zIndex: 2 }),
    text('totals_total_value', { x: 380, y: totalY + 8, w: 182, h: 18, fontSize: autoFontSize(m(totalDue), 14), fontWeight: 900, color: '#ffffff', align: 'right', text: m(totalDue), section: 'totals', zIndex: 2 }),

    text('terms_label', { x: 248, y: termsY, w: 314, h: 12, fontSize: 8.5, fontWeight: 700, color: muted, align: 'left', text: 'PAYMENT INSTRUCTIONS', section: 'notes', zIndex: 1 }),
    text('terms_text', { x: 248, y: termsY + 14, w: 314, h: 32, fontSize: 8, fontWeight: 400, color: muted, align: 'left', text: 'Please ensure the payment is made within the due date to avoid any late fees. Payment is considered as received only after it has been credited to our account. The bill total has been rounded off to the nearest whole number.', section: 'notes', zIndex: 1 }),
  ];
};

// ── Purchase Receipt (UI Design) — Blue top hero banner, customer details, item details card, summation ──
export function getReceiptPurchaseUIElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal } = computeTotals(data);


  const dark = '#0f172a';
  const muted = '#64748b';
  const labelMuted = '#94a3b8';
  const blueAccent = accent || '#1d61d1';
  const items = lineItems.length > 0 ? lineItems : [];
  const firstItem = items[0];

  return [
    text('receipt_title', { x: 48, y: 32, w: 500, h: 28, fontSize: 24, fontWeight: 800, color: dark, align: 'center', text: 'Receipt', section: 'header', zIndex: 1 }),

    rect('banner_bg', { x: 48, y: 72, w: 500, h: 72, fill: blueAccent, radius: 10, section: 'header', zIndex: 1 }),
    text('banner_text', { x: 64, y: 84, w: 468, h: 32, fontSize: 12, fontWeight: 600, color: '#ffffff', align: 'center', text: 'Thank you for your purchase! You will receive a confirmation once your order is shipped.', section: 'header', zIndex: 2 }),
    line('barcode_line', { x: 200, y: 124, w: 195, h: 2, fill: '#ffffff', strokeWidth: 2, section: 'header', zIndex: 2 }),

    text('biz_name', { x: 48, y: 160, w: 400, h: 18, fontSize: 14, fontWeight: 800, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('biz_details', { x: 48, y: 180, w: 400, h: 56, fontSize: 11, fontWeight: 400, color: muted, align: 'left', text: `${data.senderPhone || ''}\n${data.senderEmail || ''}\n${data.senderAddress || ''}\n${data.businessWebsite || ''}`, section: 'header', zIndex: 1 }),
    line('dotted_1', { x: 48, y: 246, w: 500, h: 1, fill: '#cbd5e1', strokeWidth: 1, section: 'header', zIndex: 1 }),

    text('cust_title', { x: 48, y: 260, w: 200, h: 18, fontSize: 14, fontWeight: 800, color: dark, align: 'left', text: 'Customer Details', section: 'client', zIndex: 1 }),
    text('cust_name_lbl', { x: 48, y: 284, w: 150, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: 'Customer Name', section: 'client', zIndex: 1 }),
    text('cust_name_val', { x: 348, y: 284, w: 200, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('cust_num_lbl', { x: 48, y: 304, w: 150, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: 'Customer Number', section: 'client', zIndex: 1 }),
    text('cust_num_val', { x: 348, y: 304, w: 200, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: String(data.clientPhone || ''), section: 'client', zIndex: 1, semanticField: 'clientPhone' }),
    text('cust_track_lbl', { x: 48, y: 324, w: 150, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: 'Tracking ID', section: 'client', zIndex: 1 }),
    text('cust_track_val', { x: 348, y: 324, w: 200, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: String(data.trackingId || data.referenceNumber || ''), section: 'client', zIndex: 1 }),
    line('dotted_2', { x: 48, y: 348, w: 500, h: 1, fill: '#cbd5e1', strokeWidth: 1, section: 'client', zIndex: 1 }),

    text('item_title', { x: 48, y: 362, w: 200, h: 18, fontSize: 14, fontWeight: 800, color: dark, align: 'left', text: 'Item Details', section: 'items', zIndex: 1 }),
    rect('item_img_bg', { x: 48, y: 388, w: 110, h: 74, fill: '#0f172a', radius: 8, section: 'items', zIndex: 1 }),
    text('item_desc', { x: 172, y: 388, w: 376, h: 20, fontSize: 13, fontWeight: 800, color: dark, align: 'left', text: firstItem.description, section: 'items', zIndex: 1 }),
    text('item_qty', { x: 172, y: 410, w: 376, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: `QTY: ${firstItem.quantity}`, section: 'items', zIndex: 1 }),
    text('item_date', { x: 172, y: 426, w: 376, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: `Purchase Date: ${String(data.issueDate || '')}`, section: 'items', zIndex: 1 }),
    text('item_del', { x: 172, y: 442, w: 376, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: `Estimated Delivery: ${String(data.dueDate || '')}`, section: 'items', zIndex: 1 }),
    line('dotted_3', { x: 48, y: 476, w: 500, h: 1, fill: '#cbd5e1', strokeWidth: 1, section: 'items', zIndex: 1 }),

    text('sum_title', { x: 48, y: 490, w: 200, h: 18, fontSize: 14, fontWeight: 800, color: dark, align: 'left', text: 'Summation', section: 'totals', zIndex: 1 }),
    text('sub_lbl', { x: 48, y: 514, w: 150, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: 'Sub Total', section: 'totals', zIndex: 1 }),
    text('sub_val', { x: 348, y: 514, w: 200, h: 14, fontSize: 11, fontWeight: 700, color: dark, align: 'right', text: formatDocumentMoney(subtotal,data), section: 'totals', zIndex: 1 }),
    text('disc_lbl', { x: 48, y: 534, w: 150, h: 14, fontSize: 11, fontWeight: 400, color: labelMuted, align: 'left', text: 'Discount', section: 'totals', zIndex: 1 }),
    text('footer_txt', { x: 48, y: 564, w: 500, h: 14, fontSize: 11, fontWeight: 400, color: muted, align: 'center', text: `Have any concerns? Send us an email via ${data.senderEmail || ''}`, section: 'notes', zIndex: 1 }),
  ];
}

// ── Mobile App Receipt (UI Modal Design) — White rounded card, green checkmark badge, breakdown, purple action button ──
export const getReceiptMobileAppUIElements: (data: InvoiceData, _accent: string) => InvoiceElement[] = (data) => {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#0f172a';
  const labelMuted = '#94a3b8';

  const items = lineItems.length > 0 ? lineItems : [];

  return [
    rect('page_bg', { x: 0, y: 0, w: 595, h: 842, fill: '#f1f5f9', section: 'header', zIndex: 0 }),
    rect('card_bg', { x: 77, y: 50, w: 440, h: 450, fill: '#ffffff', radius: 24, section: 'header', zIndex: 1 }),

    // Green badge
    rect('green_circle', { x: 273, y: 80, w: 48, h: 48, fill: '#dcfce7', radius: 24, section: 'header', zIndex: 2 }),
    text('header_name', { x: 105, y: 166, w:384, h:12,fontSize:9,fontWeight:600,color:dark,align:'center',text:data.businessName||'',section:'header',zIndex:2,semanticField:'businessName'}),
    text('title', { x: 97, y: 140, w: 400, h: 28, fontSize: 22, fontWeight: 800, color: dark, align: 'center', text: 'Your Receipt', section: 'header', zIndex: 2 }),
    line('div_1', { x: 105, y: 180, w: 384, h: 1, fill: '#f1f5f9', strokeWidth: 1, section: 'header', zIndex: 2 }),

    // Top Meta
    text('date_lbl', { x: 105, y: 196, w: 150, h: 14, fontSize: 11.5, fontWeight: 400, color: labelMuted, align: 'left', text: 'Date', section: 'meta', zIndex: 2 }),
    text('date_val', { x: 289, y: 196, w: 200, h: 14, fontSize: 11.5, fontWeight: 700, color: dark, align: 'right', text: String(data.issueDate || ''), section: 'meta', zIndex: 2, semanticField: 'issueDate' }),
    text('id_lbl', { x: 105, y: 216, w: 150, h: 14, fontSize: 11.5, fontWeight: 400, color: labelMuted, align: 'left', text: 'Receipt ID', section: 'meta', zIndex: 2 }),
    text('id_val', { x: 289, y: 216, w: 200, h: 14, fontSize: 11.5, fontWeight: 700, color: dark, align: 'right', text: String(data.receiptNumber || data.invoiceNumber || ''), section: 'meta', zIndex: 2, semanticField: 'invoiceNumber' }),
    line('div_2', { x: 105, y: 240, w: 384, h: 1, fill: '#f1f5f9', strokeWidth: 1, section: 'meta', zIndex: 2 }),

    // Items
    ...items.flatMap((item, i) => [
      text(`item_${i}_lbl`, { x: 105, y: 256 + i * 20, w: 250, h: 14, fontSize: 11.5, fontWeight: 400, color: labelMuted, align: 'left', text: `${item.description} x${item.quantity}`, section: 'items', zIndex: 2 }),
      text(`item_${i}_val`, { x: 389, y: 256 + i * 20, w: 100, h: 14, fontSize: 11.5, fontWeight: 700, color: dark, align: 'right', text: m(item.total), section: 'items', zIndex: 2 }),
    ]),

    text('sub_lbl', { x: 105, y: 306, w: 150, h: 14, fontSize: 11.5, fontWeight: 400, color: labelMuted, align: 'left', text: 'Subtotal', section: 'totals', zIndex: 2 }),
    text('sub_val', { x: 289, y: 306, w: 200, h: 14, fontSize: 11.5, fontWeight: 700, color: dark, align: 'right', text: m(subtotal), section: 'totals', zIndex: 2 }),
    text('tax_lbl', { x: 105, y: 326, w: 150, h: 14, fontSize: 11.5, fontWeight: 400, color: labelMuted, align: 'left', text: 'Tax', section: 'totals', zIndex: 2 }),
    text('tax_val', { x: 289, y: 326, w: 200, h: 14, fontSize: 11.5, fontWeight: 700, color: dark, align: 'right', text: m(taxAmount ?? 0), section: 'totals', zIndex: 2 }),
    text('tot_lbl', { x: 105, y: 348, w: 150, h: 16, fontSize: 13, fontWeight: 800, color: dark, align: 'left', text: 'Total', section: 'totals', zIndex: 2 }),
    text('tot_val', { x: 289, y: 348, w: 200, h: 16, fontSize: 13, fontWeight: 800, color: dark, align: 'right', text: m(totalDue), section: 'totals', zIndex: 2 }),
    line('div_3', { x: 105, y: 374, w: 384, h: 1, fill: '#f1f5f9', strokeWidth: 1, section: 'totals', zIndex: 2 }),

    // Payment Meta
    text('pay_lbl', { x: 105, y: 390, w: 150, h: 14, fontSize: 11.5, fontWeight: 400, color: labelMuted, align: 'left', text: 'Payment Method', section: 'notes', zIndex: 2 }),
    text('pay_val', { x: 289, y: 390, w: 200, h: 14, fontSize: 11.5, fontWeight: 700, color: dark, align: 'right', text: String(data.paymentMethod || ''), section: 'notes', zIndex: 2, semanticField: 'paymentMethod' }),
    text('del_lbl', { x: 105, y: 410, w: 150, h: 14, fontSize: 11.5, fontWeight: 400, color: labelMuted, align: 'left', text: 'Delivery day', section: 'notes', zIndex: 2 }),
    text('del_val', { x: 289, y: 410, w: 200, h: 14, fontSize: 11.5, fontWeight: 700, color: dark, align: 'right', text: String(data.deliveryEstimate || ''), section: 'notes', zIndex: 2 }),

    text('thank_you', { x: 105, y: 446, w: 384, h: 16, fontSize: 12, fontWeight: 700, color: dark, align: 'center', text: 'Thank you for your purchase!', section: 'notes', zIndex: 2 }),
  ];
};

// ── Classic Purchase Order (Grid Table) — Slate Blue headers, Requisitioner bar, grid item table ──
export function getPurchaseOrderClassicElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1e293b';
  const muted = '#64748b';
  const slateBlue = accent || '#3b5998';
  const borderCol = '#cbd5e1';

  const items = lineItems.length > 0 ? lineItems : [];

  return [
    // Top Left Business Header
    text('biz_name', { x: 36, y: 32, w: 250, h: 18, fontSize: 14, fontWeight: 800, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('biz_details', { x: 36, y: 52, w: 250, h: 56, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `${data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}\nEmail: ${data.senderEmail || ''}`, section: 'header', zIndex: 1 }),

    // Top Right Header Title
    text('title', { x: 300, y: 32, w: 259, h: 26, fontSize: 22, fontWeight: 900, color: slateBlue, align: 'right', text: 'PURCHASE ORDER', section: 'header', zIndex: 1 }),

    // Top Right Date / PO# Box
    rect('po_meta_border', { x: 440, y: 62, w: 119, h: 36, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'meta', zIndex: 1 }),
    line('po_meta_div', { x: 440, y: 80, w: 119, h: 1, fill: borderCol, strokeWidth: 1, section: 'meta', zIndex: 1 }),
    text('po_date_lbl', { x: 370, y: 65, w: 105, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'DATE', section: 'meta', zIndex: 1 }),
    text('po_date_val', { x: 442, y: 65, w: 115, h: 12, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: String(data.issueDate || ''), section: 'meta', zIndex: 2, semanticField: 'issueDate' }),
    text('po_num_lbl', { x: 370, y: 83, w: 105, h: 12, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'PO #', section: 'meta', zIndex: 1 }),
    text('po_num_val', { x: 442, y: 83, w: 115, h: 12, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: String(data.poNumber || data.invoiceNumber || ''), section: 'meta', zIndex: 2, semanticField: 'invoiceNumber' }),

    // Vendor Block
    rect('vendor_bg', { x: 36, y: 120, w: 240, h: 18, fill: slateBlue, section: 'client', zIndex: 1 }),
    text('vendor_title', { x: 42, y: 123, w: 228, h: 14, fontSize: 9.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'VENDOR', section: 'client', zIndex: 2 }),
    text('vendor_details', { x: 36, y: 142, w: 240, h: 64, fontSize: 9.5, fontWeight: 400, color: dark, align: 'left', text: `${data.clientName || ''}\n${data.clientContact || ''}\n${data.clientAddress || ''}\nPhone: ${data.clientPhone || ''}`, section: 'client', zIndex: 1 }),

    // Ship To Block
    rect('shipto_bg', { x: 315, y: 120, w: 244, h: 18, fill: slateBlue, section: 'client', zIndex: 1 }),
    text('shipto_title', { x: 321, y: 123, w: 232, h: 14, fontSize: 9.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'SHIP TO', section: 'client', zIndex: 2 }),
    text('shipto_details', { x: 315, y: 142, w: 244, h: 64, fontSize: 9.5, fontWeight: 400, color: dark, align: 'left', text: `${data.shipToName || ''}\n${data.businessName || ''}\n${data.shipToAddress || data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}`, section: 'client', zIndex: 1 }),

    // Logistics Header Row
    rect('logistics_bg', { x: 36, y: 216, w: 523, h: 18, fill: slateBlue, section: 'meta', zIndex: 1 }),
    text('req_lbl', { x: 40, y: 219, w: 120, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'REQUISITIONER', section: 'meta', zIndex: 2 }),
    text('via_lbl', { x: 160, y: 219, w: 120, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'SHIP VIA', section: 'meta', zIndex: 2 }),
    text('fob_lbl', { x: 280, y: 219, w: 100, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'F.O.B.', section: 'meta', zIndex: 2 }),
    text('terms_lbl', { x: 380, y: 219, w: 175, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'SHIPPING TERMS', section: 'meta', zIndex: 2 }),

    rect('logistics_val_box', { x: 36, y: 234, w: 523, h: 22, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'meta', zIndex: 1 }),
    line('log_div_1', { x: 160, y: 234, w: 1, h: 22, fill: borderCol, strokeWidth: 1, section: 'meta', zIndex: 2 }),
    line('log_div_2', { x: 280, y: 234, w: 1, h: 22, fill: borderCol, strokeWidth: 1, section: 'meta', zIndex: 2 }),
    line('log_div_3', { x: 380, y: 234, w: 1, h: 22, fill: borderCol, strokeWidth: 1, section: 'meta', zIndex: 2 }),

    text('req_val', { x: 40, y: 239, w: 120, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'center', text: String(data.requisitioner || ''), section: 'meta', zIndex: 2 }),
    text('via_val', { x: 160, y: 239, w: 120, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'center', text: String(data.shipVia || ''), section: 'meta', zIndex: 2 }),
    text('fob_val', { x: 280, y: 239, w: 100, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'center', text: String(data.fob || ''), section: 'meta', zIndex: 2 }),
    text('terms_val', { x: 380, y: 239, w: 175, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'center', text: String(data.shippingTerms || ''), section: 'meta', zIndex: 2 }),

    // Items Table Header Row
    rect('tbl_bg', { x: 36, y: 270, w: 523, h: 20, fill: slateBlue, section: 'items', zIndex: 1 }),
    text('th_item', { x: 42, y: 274, w: 90, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'center', text: 'ITEM #', section: 'items', zIndex: 2 }),
    text('th_desc', { x: 136, y: 274, w: 210, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'center', text: 'DESCRIPTION', section: 'items', zIndex: 2 }),
    text('th_qty', { x: 350, y: 274, w: 50, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'center', text: 'QTY', section: 'items', zIndex: 2 }),
    text('th_price', { x: 404, y: 274, w: 70, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'center', text: 'UNIT PRICE', section: 'items', zIndex: 2 }),
    text('th_total', { x: 478, y: 274, w: 75, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'center', text: 'TOTAL', section: 'items', zIndex: 2 }),

    // Items Outer Border Box
    rect('tbl_outer_box', { x: 36, y: 290, w: 523, h: 260, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'items', zIndex: 1 }),
    line('tbl_col_1', { x: 132, y: 290, w: 1, h: 260, fill: borderCol, strokeWidth: 1, section: 'items', zIndex: 2 }),
    line('tbl_col_2', { x: 348, y: 290, w: 1, h: 260, fill: borderCol, strokeWidth: 1, section: 'items', zIndex: 2 }),
    line('tbl_col_3', { x: 402, y: 290, w: 1, h: 260, fill: borderCol, strokeWidth: 1, section: 'items', zIndex: 2 }),
    line('tbl_col_4', { x: 476, y: 290, w: 1, h: 260, fill: borderCol, strokeWidth: 1, section: 'items', zIndex: 2 }),

    // Table Data Rows
    ...items.flatMap((item, i) => {
      const y = 295 + i * 20;
      return [
        text(`item_${i}_code`, { x: 40, y, w: 88, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'left', text: `[${23423423 + i * 100}]`, section: 'items', zIndex: 2 }),
        text(`item_${i}_desc`, { x: 136, y, w: 208, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 2 }),
        text(`item_${i}_qty`, { x: 350, y, w: 50, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'center', text: String(item.quantity), section: 'items', zIndex: 2 }),
        text(`item_${i}_price`, { x: 404, y, w: 68, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'right', text: formatDocumentMoney(item.unitPrice,data), section: 'items', zIndex: 2 }),
        text(`item_${i}_tot`, { x: 478, y, w: 75, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'right', text: formatDocumentMoney(item.total,data), section: 'items', zIndex: 2 }),
        line(`row_div_${i}`, { x: 36, y: y + 16, w: 523, h: 1, fill: borderCol, strokeWidth: 1, section: 'items', zIndex: 2 }),
      ];
    }),

    // Comments / Notes Box Bottom Left
    rect('comments_hdr', { x: 36, y: 565, w: 300, h: 18, fill: '#94a3b8', section: 'notes', zIndex: 1 }),
    text('comments_lbl', { x: 42, y: 568, w: 288, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Comments or Special Instructions', section: 'notes', zIndex: 2 }),
    rect('comments_box', { x: 36, y: 583, w: 300, h: 80, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'notes', zIndex: 1 }),
    text('comments_txt', { x: 42, y: 589, w: 288, h: 68, fontSize: 9, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 2 }),

    // Summation Breakdown Right Bottom
    text('sub_lbl', { x: 348, y: 565, w: 120, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'SUBTOTAL', section: 'totals', zIndex: 1 }),
    rect('sub_box', { x: 476, y: 560, w: 83, h: 20, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'totals', zIndex: 1 }),
    text('sub_val', { x: 453, y: 564, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: formatDocumentMoney(subtotal,data), section: 'totals', zIndex: 2 }),

    text('tax_lbl', { x: 348, y: 587, w: 120, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'TAX', section: 'totals', zIndex: 1 }),
    rect('tax_box', { x: 476, y: 582, w: 83, h: 20, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'totals', zIndex: 1 }),
    text('tax_val', { x: 453, y: 586, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: taxAmount > 0 ? formatDocumentMoney(taxAmount,data) : '-', section: 'totals', zIndex: 2 }),

    text('ship_lbl', { x: 348, y: 609, w: 120, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'SHIPPING', section: 'totals', zIndex: 1 }),
    rect('ship_box', { x: 476, y: 604, w: 83, h: 20, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'totals', zIndex: 1 }),
    text('ship_val', { x: 453, y: 608, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: '-', section: 'totals', zIndex: 2 }),

    text('oth_lbl', { x: 348, y: 631, w: 120, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'left', text: 'OTHER', section: 'totals', zIndex: 1 }),
    rect('oth_box', { x: 476, y: 626, w: 83, h: 20, fill: '#ffffff', stroke: borderCol, strokeWidth: 1, section: 'totals', zIndex: 1 }),
    text('oth_val', { x: 453, y: 630, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: '-', section: 'totals', zIndex: 2 }),

    rect('tot_banner_bg', { x: 476, y: 648, w: 83, h: 22, fill: slateBlue, section: 'totals', zIndex: 1 }),
    text('tot_lbl', { x: 348, y: 652, w: 120, h: 16, fontSize: 10, fontWeight: 900, color: dark, align: 'left', text: 'TOTAL', section: 'totals', zIndex: 1 }),
    text('tot_val', { x: 453, y: 652, w: 110, h: 16, fontSize: 10, fontWeight: 900, color: '#ffffff', align: 'right', text: m(totalDue), section: 'totals', zIndex: 2 }),

    // Footer Contact Note
    text('footer_txt', { x: 36, y: 700, w: 523, h: 24, fontSize: 9, fontWeight: 500, color: muted, align: 'center', text: `If you have any questions about this purchase order, please contact\n[${data.senderEmail || ''}]`, section: 'notes', zIndex: 1 }),
  ];
}

// ── Purchase Order 4 (Modern Orange Wave & Dark Totals Column) ──
export function getPurchaseOrderOrangeWaveElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, totalDue } = computeTotals(data);


  const dark = '#1e293b';
  const muted = '#64748b';
  const orange = accent || '#e0531c';
  const darkCol = '#262729';

  const items = lineItems.length > 0 ? lineItems : [];

  const shippingCost = 0;
  const calcTotal = totalDue;

  return [
    // Header Company & Details
    text('biz_name', { x: 36, y: 32, w: 250, h: 18, fontSize: 14, fontWeight: 800, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('biz_details', { x: 36, y: 52, w: 250, h: 64, fontSize: 9.5, fontWeight: 400, color: muted, align: 'left', text: `${data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}\nFax: ${data.senderFax || ''}\nWebsite: ${data.senderEmail || ''}`, section: 'header', zIndex: 1 }),

    // Header Right PO Title & Dates
    text('title', { x: 300, y: 32, w: 259, h: 26, fontSize: 22, fontWeight: 900, color: orange, align: 'right', text: 'PURCHASE ORDER', section: 'header', zIndex: 1 }),
    text('po_date_lbl', { x: 360, y: 68, w: 105, h: 14, fontSize: 9.5, fontWeight: 700, color: dark, align: 'right', text: 'DATE', section: 'meta', zIndex: 1 }),
    text('po_date_val', { x: 430, y: 68, w: 129, h: 14, fontSize: 9.5, fontWeight: 600, color: dark, align: 'right', text: String(data.issueDate || ''), section: 'meta', zIndex: 1, semanticField: 'issueDate' }),
    text('po_num_lbl', { x: 360, y: 84, w: 105, h: 14, fontSize: 9.5, fontWeight: 700, color: dark, align: 'right', text: 'PO #', section: 'meta', zIndex: 1 }),
    text('po_num_val', { x: 430, y: 84, w: 129, h: 14, fontSize: 9.5, fontWeight: 600, color: dark, align: 'right', text: String(data.poNumber || data.invoiceNumber || ''), section: 'meta', zIndex: 1, semanticField: 'invoiceNumber' }),

    // Vendor Block Left
    rect('vendor_bg', { x: 36, y: 126, w: 245, h: 18, fill: orange, section: 'client', zIndex: 1 }),
    text('vendor_hdr', { x: 42, y: 129, w: 233, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'VENDOR', section: 'client', zIndex: 2 }),
    text('vendor_val', { x: 36, y: 148, w: 245, h: 68, fontSize: 9, fontWeight: 400, color: dark, align: 'left', text: `${data.clientName || ''}\n${data.clientContact || ''}\n${data.clientAddress || ''}\nPhone: ${data.clientPhone || ''}\nFax: ${data.clientFax || ''}`, section: 'client', zIndex: 1 }),
    line('vendor_div', { x: 36, y: 220, w: 245, h: 2, fill: orange, strokeWidth: 2, section: 'client', zIndex: 1 }),

    // Ship To Block Right
    rect('shipto_bg', { x: 314, y: 126, w: 245, h: 18, fill: orange, section: 'client', zIndex: 1 }),
    text('shipto_hdr', { x: 320, y: 129, w: 233, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'SHIP TO', section: 'client', zIndex: 2 }),
    text('shipto_val', { x: 314, y: 148, w: 245, h: 68, fontSize: 9, fontWeight: 400, color: dark, align: 'left', text: `${data.shipToName || ''}\n${data.businessName || ''}\n${data.shipToAddress || data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}`, section: 'client', zIndex: 1 }),
    line('shipto_div', { x: 314, y: 220, w: 245, h: 2, fill: orange, strokeWidth: 2, section: 'client', zIndex: 1 }),

    // Shipping Logistics Header
    rect('log_bg', { x: 36, y: 232, w: 523, h: 18, fill: orange, section: 'meta', zIndex: 1 }),
    text('terms_lbl', { x: 36, y: 235, w: 174, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'SHIPPING TERMS', section: 'meta', zIndex: 2 }),
    text('method_lbl', { x: 210, y: 235, w: 174, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'SHIPPING METHOD', section: 'meta', zIndex: 2 }),
    text('deliv_lbl', { x: 384, y: 235, w: 175, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'DELIVERY DATE', section: 'meta', zIndex: 2 }),

    rect('log_val_bg', { x: 36, y: 250, w: 523, h: 20, fill: '#f8fafc', stroke: '#cbd5e1', strokeWidth: 1, section: 'meta', zIndex: 1 }),
    text('terms_val', { x: 36, y: 253, w: 174, h: 14, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: String(data.shippingTerms || ''), section: 'meta', zIndex: 2 }),
    text('method_val', { x: 210, y: 253, w: 174, h: 14, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: String(data.shipVia || ''), section: 'meta', zIndex: 2 }),
    text('deliv_val', { x: 384, y: 253, w: 175, h: 14, fontSize: 9, fontWeight: 600, color: dark, align: 'center', text: String(data.dueDate || ''), section: 'meta', zIndex: 2, semanticField: 'dueDate' }),

    // Item Table Header Bar
    rect('tbl_hdr_bg', { x: 36, y: 280, w: 414, h: 20, fill: orange, section: 'items', zIndex: 1 }),
    text('th_code', { x: 42, y: 283, w: 90, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'ITEM #', section: 'items', zIndex: 2 }),
    text('th_desc', { x: 132, y: 283, w: 198, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'DESCRIPTION', section: 'items', zIndex: 2 }),
    text('th_qty', { x: 330, y: 283, w: 50, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'center', text: 'QTY', section: 'items', zIndex: 2 }),
    text('th_price', { x: 380, y: 283, w: 105, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'right', text: 'UNIT PRICE', section: 'items', zIndex: 2 }),

    // Right Dark Column for Total Header & Totals
    rect('dark_col_bg', { x: 450, y: 280, w: 109, h: 320, fill: darkCol, section: 'items', zIndex: 1 }),
    text('th_tot', { x: 450, y: 283, w: 101, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'right', text: 'TOTAL', section: 'items', zIndex: 2 }),
    line('dark_col_hdr_div', { x: 450, y: 300, w: 109, h: 2, fill: orange, strokeWidth: 2, section: 'items', zIndex: 2 }),

    // Table Items Rows
    ...items.flatMap((item, i) => {
      const y = 305 + i * 22;
      return [
        text(`item_${i}_code`, { x: 42, y, w: 90, h: 14, fontSize: 9, fontWeight: 600, color: dark, align: 'left', text: String(12345478 + i * 100), section: 'items', zIndex: 2 }),
        text(`item_${i}_desc`, { x: 132, y, w: 198, h: 14, fontSize: 9, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 2 }),
        text(`item_${i}_qty`, { x: 330, y, w: 50, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'center', text: String(item.quantity), section: 'items', zIndex: 2 }),
        text(`item_${i}_price`, { x: 380, y, w: 105, h: 14, fontSize: 9, fontWeight: 400, color: dark, align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(item.unitPrice,data)}`, section: 'items', zIndex: 2 }),
        text(`item_${i}_tot`, { x: 450, y, w: 101, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(item.total,data)}`, section: 'items', zIndex: 2 }),
        line(`item_div_${i}`, { x: 36, y: y + 18, w: 414, h: 1, fill: '#e2e8f0', strokeWidth: 1, section: 'items', zIndex: 2 }),
      ];
    }),

    // Bottom Left Comments Box
    rect('comments_hdr_bg', { x: 36, y: 520, w: 290, h: 18, fill: orange, section: 'notes', zIndex: 1 }),
    text('comments_lbl', { x: 42, y: 523, w: 278, h: 14, fontSize: 8.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Comments or Special Instructions', section: 'notes', zIndex: 2 }),
    rect('comments_body_bg', { x: 36, y: 538, w: 290, h: 62, fill: darkCol, section: 'notes', zIndex: 1 }),
    text('comments_txt', { x: 42, y: 544, w: 278, h: 50, fontSize: 8.5, fontWeight: 400, color: '#ffffff', align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 2 }),

    // Subtotal / Tax / Shipping Labels on Left of Dark Column
    text('sub_lbl', { x: 335, y: 525, w: 105, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'SUBTOTAL', section: 'totals', zIndex: 1 }),
    text('tax_lbl', { x: 335, y: 545, w: 105, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'TAX', section: 'totals', zIndex: 1 }),
    text('ship_lbl', { x: 335, y: 565, w: 105, h: 14, fontSize: 9, fontWeight: 700, color: dark, align: 'right', text: 'SHIPPING', section: 'totals', zIndex: 1 }),
    text('tot_lbl', { x: 335, y: 585, w: 105, h: 16, fontSize: 10, fontWeight: 900, color: dark, align: 'right', text: 'TOTAL', section: 'totals', zIndex: 1 }),

    // Breakdown Values inside Dark Column Right Bottom
    text('sub_val', { x: 450, y: 525, w: 101, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}`, section: 'totals', zIndex: 2 }),
    text('tax_val', { x: 450, y: 545, w: 101, h: 14, fontSize: 9, fontWeight: 600, color: '#ffffff', align: 'right', text: `${taxRate ?? 0}%`, section: 'totals', zIndex: 2 }),
    text('ship_val', { x: 450, y: 565, w: 101, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(shippingCost,data)}`, section: 'totals', zIndex: 2 }),
    text('tot_val', { x: 450, y: 585, w: 101, h: 16, fontSize: 11, fontWeight: 900, color: orange, align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(calcTotal,data)}`, section: 'totals', zIndex: 2 }),

    // Footer Link
    text('footer_link', { x: 36, y: 720, w: 523, h: 14, fontSize: 8.5, fontWeight: 500, color: muted, align: 'right', text: 'Templatelab.com', section: 'notes', zIndex: 1 }),
  ];
}

// ── Purchase Order 5 (Clean Teal / Yellow Logo Badge) ──
export function getPurchaseOrderCyanCleanElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);


  const dark = '#1e293b';
  const muted = '#64748b';
  const cyanAccent = accent || '#00a8b5';
  const yellowBadge = '#f5a623';

  const items = lineItems.length > 0 ? lineItems : [];

  return [
    // Header
    text('title', { x: 40, y: 36, w: 300, h: 36, fontSize: 26, fontWeight: 800, color: cyanAccent, align: 'left', text: 'Purchase Order', section: 'header', zIndex: 1 }),
    rect('logo_badge', { x: 501, y: 36, w: 54, h: 54, fill: yellowBadge, radius: 27, section: 'header', zIndex: 1 }),
    text('logo_text', { x: 501, y: 53, w: 54, h: 20, fontSize: 13, fontWeight: 700, color: '#ffffff', align: 'center', text: 'Logo', section: 'header', zIndex: 2 }),
    line('header_div', { x: 40, y: 100, w: 515, h: 2, fill: cyanAccent, strokeWidth: 2, section: 'header', zIndex: 1 }),

    // Left Company Info
    text('biz_name', { x: 40, y: 118, w: 220, h: 16, fontSize: 12, fontWeight: 800, color: dark, align: 'left', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('biz_details', { x: 40, y: 136, w: 220, h: 48, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `${data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}`, section: 'header', zIndex: 1 }),

    // Left Ship To
    text('shipto_title', { x: 40, y: 196, w: 220, h: 16, fontSize: 11, fontWeight: 800, color: dark, align: 'left', text: 'Ship to', section: 'client', zIndex: 1 }),
    text('shipto_office', { x: 40, y: 214, w: 220, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: String(data.shipToName || ''), section: 'client', zIndex: 1 }),
    text('shipto_details', { x: 40, y: 230, w: 220, h: 48, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `Attn: ${data.shipToContact || ''}\n${data.shipToAddress || ''}\nPhone: ${data.shipToPhone || ''}`, section: 'client', zIndex: 1 }),

    // Right Metadata Box Card
    rect('meta_box_bg', { x: 335, y: 118, w: 220, h: 145, fill: '#f8fafc', radius: 4, section: 'meta', zIndex: 1 }),
    text('po_num_lbl', { x: 347, y: 126, w: 100, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'PO no:', section: 'meta', zIndex: 2 }),
    text('po_num_val', { x: 447, y: 126, w: 96, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: String(data.poNumber || data.invoiceNumber || ''), section: 'meta', zIndex: 2, semanticField: 'invoiceNumber' }),

    text('status_lbl', { x: 347, y: 144, w: 120, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Purchase Order Status:', section: 'meta', zIndex: 2 }),
    text('status_val', { x: 447, y: 144, w: 96, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: String(data.poStatus || ''), section: 'meta', zIndex: 2 }),

    text('date_lbl', { x: 347, y: 162, w: 100, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Date:', section: 'meta', zIndex: 2 }),
    text('date_val', { x: 447, y: 162, w: 96, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: String(data.issueDate || ''), section: 'meta', zIndex: 2, semanticField: 'issueDate' }),

    text('req_lbl', { x: 347, y: 180, w: 100, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Requested By:', section: 'meta', zIndex: 2 }),
    text('req_val', { x: 447, y: 180, w: 96, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: String(data.requisitioner || ''), section: 'meta', zIndex: 2 }),

    text('appr_lbl', { x: 347, y: 198, w: 100, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Approved By:', section: 'meta', zIndex: 2 }),
    text('appr_val', { x: 447, y: 198, w: 96, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: String(data.approvedBy || ''), section: 'meta', zIndex: 2 }),

    text('dept_lbl', { x: 347, y: 216, w: 100, h: 14, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: 'Department:', section: 'meta', zIndex: 2 }),
    text('dept_val', { x: 447, y: 216, w: 96, h: 14, fontSize: 10, fontWeight: 600, color: dark, align: 'right', text: String(data.department || ''), section: 'meta', zIndex: 2 }),

    // Supplier Left & Terms Right
    text('supplier_hdr', { x: 40, y: 290, w: 220, h: 16, fontSize: 11, fontWeight: 800, color: dark, align: 'left', text: 'Supplier', section: 'client', zIndex: 1 }),
    text('supplier_name', { x: 40, y: 308, w: 220, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'left', text: data.clientName || '', section: 'client', zIndex: 1, semanticField: 'clientName' }),
    text('supplier_details', { x: 40, y: 324, w: 220, h: 68, fontSize: 10, fontWeight: 400, color: muted, align: 'left', text: `${data.clientAddress || ''}\nPhone: ${data.clientPhone || ''}\nEmail: ${data.clientEmail || ''}\nTerms: ${data.paymentTerms || ''}`, section: 'client', zIndex: 1 }),

    text('comments_hdr', { x: 335, y: 290, w: 220, h: 16, fontSize: 11, fontWeight: 800, color: dark, align: 'left', text: 'Terms of sale and other comments', section: 'notes', zIndex: 1 }),
    text('comments_txt', { x: 335, y: 308, w: 220, h: 54, fontSize: 9.5, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    // Item Table
    line('tbl_top_line', { x: 40, y: 400, w: 515, h: 3, fill: cyanAccent, strokeWidth: 3, section: 'items', zIndex: 1 }),
    text('th_item', { x: 40, y: 408, w: 90, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'left', text: 'Item #', section: 'items', zIndex: 2 }),
    text('th_desc', { x: 135, y: 408, w: 175, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'left', text: 'Description', section: 'items', zIndex: 2 }),
    text('th_qty', { x: 315, y: 408, w: 55, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'center', text: 'Qty', section: 'items', zIndex: 2 }),
    text('th_unit', { x: 375, y: 408, w: 55, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'center', text: 'Unit', section: 'items', zIndex: 2 }),
    text('th_price', { x: 435, y: 408, w: 105, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'right', text: 'Unit Price', section: 'items', zIndex: 2 }),
    text('th_total', { x: 500, y: 408, w: 55, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'right', text: 'Total', section: 'items', zIndex: 2 }),
    line('tbl_head_bot', { x: 40, y: 426, w: 515, h: 1, fill: '#e2e8f0', strokeWidth: 1, section: 'items', zIndex: 1 }),

    // Table Data Rows
    ...items.flatMap((item, i) => {
      const y = 434 + i * 28;
      return [
        text(`item_${i}_code`, { x: 40, y, w: 90, h: 14, fontSize: 9.5, fontWeight: 500, color: muted, align: 'left', text: String(123456789 + i * 100), section: 'items', zIndex: 2 }),
        text(`item_${i}_desc`, { x: 135, y, w: 175, h: 14, fontSize: 9.5, fontWeight: 600, color: dark, align: 'left', text: item.description, section: 'items', zIndex: 2 }),
        text(`item_${i}_qty`, { x: 315, y, w: 55, h: 14, fontSize: 9.5, fontWeight: 400, color: muted, align: 'center', text: String(item.quantity), section: 'items', zIndex: 2 }),
        text(`item_${i}_unit`, { x: 375, y, w: 55, h: 14, fontSize: 9.5, fontWeight: 400, color: muted, align: 'center', text: i === 0 ? 'kg' : 'l', section: 'items', zIndex: 2 }),
        text(`item_${i}_price`, { x: 435, y, w: 105, h: 14, fontSize: 9.5, fontWeight: 400, color: muted, align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(item.unitPrice,data)}`, section: 'items', zIndex: 2 }),
        text(`item_${i}_tot`, { x: 500, y, w: 55, h: 14, fontSize: 9.5, fontWeight: 600, color: dark, align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(item.total,data)}`, section: 'items', zIndex: 2 }),
        line(`row_div_${i}`, { x: 40, y: y + 22, w: 515, h: 1, fill: '#f1f5f9', strokeWidth: 1, section: 'items', zIndex: 1 }),
      ];
    }),

    // Totals Breakdown Right
    text('sub_lbl', { x: 375, y: 550, w: 90, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: 'Subtotal', section: 'totals', zIndex: 1 }),
    text('sub_val', { x: 475, y: 550, w: 80, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}`, section: 'totals', zIndex: 1 }),

    text('tax_lbl', { x: 375, y: 570, w: 90, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: 'Tax', section: 'totals', zIndex: 1 }),
    text('tax_val', { x: 475, y: 570, w: 80, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'right', text: taxAmount > 0 ? `${data.currencySymbol || ''}${formatDocumentMoney(taxAmount,data)}` : (data.currencySymbol || '') + '0', section: 'totals', zIndex: 1 }),

    text('ship_lbl', { x: 375, y: 590, w: 90, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: 'Shipping', section: 'totals', zIndex: 1 }),
    text('ship_val', { x: 475, y: 590, w: 80, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'right', text: (data.currencySymbol || '') + '0', section: 'totals', zIndex: 1 }),

    text('oth_lbl', { x: 375, y: 610, w: 90, h: 14, fontSize: 10, fontWeight: 700, color: dark, align: 'right', text: 'Other', section: 'totals', zIndex: 1 }),
    text('oth_val', { x: 475, y: 610, w: 80, h: 14, fontSize: 10, fontWeight: 800, color: dark, align: 'right', text: (data.currencySymbol || '') + '0', section: 'totals', zIndex: 1 }),

    text('tot_lbl', { x: 375, y: 638, w: 90, h: 16, fontSize: 11, fontWeight: 800, color: cyanAccent, align: 'right', text: 'Total', section: 'totals', zIndex: 1 }),
    text('tot_val', { x: 475, y: 638, w: 80, h: 16, fontSize: 11, fontWeight: 800, color: cyanAccent, align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(totalDue,data)}`, section: 'totals', zIndex: 1 }),

    // Bottom Solid Accent Bar
    rect('bot_bar', { x: 0, y: 828, w: 595, h: 14, fill: cyanAccent, section: 'notes', zIndex: 1 }),
  ];
}

// ── Purchase Order 6 (Minimalist Black & White Grid Order Form) ──
export function getPurchaseOrderMinimalGridElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);


  const dark = accent || '#0f172a';
  const muted = '#475569';

  const items = lineItems.length > 0 ? lineItems : [];

  return [
    // Header Title Left
    text('title', { x: 40, y: 36, w: 260, h: 34, fontSize: 26, fontWeight: 900, color: '#000000', align: 'left', text: 'Purchase Order', section: 'header', zIndex: 1 }),

    // Header Address Right
    text('biz_name', { x: 335, y: 36, w: 220, h: 14, fontSize: 11, fontWeight: 700, color: '#000000', align: 'right', text: data.businessName || '', section: 'header', zIndex: 1, semanticField: 'businessName' }),
    text('biz_details', { x: 335, y: 52, w: 220, h: 36, fontSize: 9.5, fontWeight: 400, color: muted, align: 'right', text: `${data.senderAddress || ''}\n${data.senderPhone || ''}`, section: 'header', zIndex: 1 }),

    // PO # & Date Underline Section
    text('po_num_lbl', { x: 40, y: 95, w: 100, h: 14, fontSize: 10, fontWeight: 700, color: '#000000', align: 'left', text: 'Purchase Order #', section: 'meta', zIndex: 1 }),
    text('po_num_val', { x: 142, y: 95, w: 150, h: 14, fontSize: 10, fontWeight: 600, color: '#000000', align: 'left', text: String(data.poNumber || data.invoiceNumber || ''), section: 'meta', zIndex: 2, semanticField: 'invoiceNumber' }),
    line('po_num_underline', { x: 142, y: 110, w: 150, h: 1, fill: '#000000', strokeWidth: 1.5, section: 'meta', zIndex: 1 }),

    text('date_lbl', { x: 365, y: 95, w: 40, h: 14, fontSize: 10, fontWeight: 700, color: '#000000', align: 'right', text: 'Date', section: 'meta', zIndex: 1 }),
    text('date_val', { x: 410, y: 95, w: 145, h: 14, fontSize: 10, fontWeight: 600, color: '#000000', align: 'left', text: String(data.issueDate || ''), section: 'meta', zIndex: 2, semanticField: 'issueDate' }),
    line('date_underline', { x: 410, y: 110, w: 145, h: 1, fill: '#000000', strokeWidth: 1.5, section: 'meta', zIndex: 1 }),

    // Vendor / Ship To Boxed Banner
    rect('vendor_box_border', { x: 40, y: 122, w: 515, h: 80, fill: 'none', stroke: '#000000', strokeWidth: 1.5, section: 'client', zIndex: 1 }),
    rect('vendor_hdr_bg', { x: 40, y: 122, w: 515, h: 20, fill: dark, section: 'client', zIndex: 1 }),
    line('vendor_col_div', { x: 297, y: 122, w: 1, h: 80, fill: '#000000', strokeWidth: 1.5, section: 'client', zIndex: 2 }),

    text('vendor_lbl', { x: 48, y: 126, w: 240, h: 14, fontSize: 9.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'VENDOR', section: 'client', zIndex: 3 }),
    text('vendor_val', { x: 48, y: 146, w: 240, h: 50, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'left', text: `${data.clientName || ''}\n${data.clientAddress || ''}\n${data.clientPhone || ''}`, section: 'client', zIndex: 2 }),

    text('shipto_lbl', { x: 305, y: 126, w: 240, h: 14, fontSize: 9.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'SHIP TO', section: 'client', zIndex: 3 }),
    text('shipto_val', { x: 305, y: 146, w: 240, h: 50, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'left', text: `${String(data.shipToName || data.businessName || '')}\n${data.shipToAddress || data.senderAddress || ''}\n${data.senderPhone || ''}`, section: 'client', zIndex: 2 }),

    // Products or Services Header Bar
    rect('products_hdr_bg', { x: 40, y: 212, w: 515, h: 20, fill: dark, stroke: '#000000', strokeWidth: 1.5, section: 'items', zIndex: 1 }),
    text('products_hdr_txt', { x: 48, y: 216, w: 500, h: 14, fontSize: 9.5, fontWeight: 800, color: '#ffffff', align: 'left', text: 'PRODUCTS OR SERVICES', section: 'items', zIndex: 2 }),

    // Table Header Grid
    rect('tbl_border', { x: 40, y: 232, w: 515, h: 320, fill: 'none', stroke: '#000000', strokeWidth: 1.5, section: 'items', zIndex: 1 }),
    line('tbl_hdr_bot', { x: 40, y: 252, w: 515, h: 1, fill: '#000000', strokeWidth: 1.5, section: 'items', zIndex: 2 }),

    text('th_desc', { x: 48, y: 236, w: 250, h: 14, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'left', text: 'Description', section: 'items', zIndex: 3 }),
    line('col_div_1', { x: 300, y: 232, w: 1, h: 320, fill: '#000000', strokeWidth: 1.5, section: 'items', zIndex: 2 }),

    text('th_price', { x: 305, y: 236, w: 75, h: 14, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'center', text: 'Unit Price', section: 'items', zIndex: 3 }),
    line('col_div_2', { x: 385, y: 232, w: 1, h: 320, fill: '#000000', strokeWidth: 1.5, section: 'items', zIndex: 2 }),

    text('th_qty', { x: 390, y: 236, w: 75, h: 14, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'center', text: 'Quantity', section: 'items', zIndex: 3 }),
    line('col_div_3', { x: 470, y: 232, w: 1, h: 320, fill: '#000000', strokeWidth: 1.5, section: 'items', zIndex: 2 }),

    text('th_total', { x: 475, y: 236, w: 75, h: 14, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'right', text: 'Total', section: 'items', zIndex: 3 }),

    // Grid Row Dividers and Items
    ...items.flatMap((item, i) => {
      const y = 257 + i * 24;
      return [
        text(`item_${i}_desc`, { x: 48, y, w: 245, h: 14, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'left', text: item.description, section: 'items', zIndex: 3 }),
        text(`item_${i}_price`, { x: 305, y, w: 75, h: 14, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'center', text: `${data.currencySymbol || ''}${formatDocumentMoney(item.unitPrice,data)}`, section: 'items', zIndex: 3 }),
        text(`item_${i}_qty`, { x: 390, y, w: 75, h: 14, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'center', text: String(item.quantity), section: 'items', zIndex: 3 }),
        text(`item_${i}_tot`, { x: 475, y, w: 75, h: 14, fontSize: 9.5, fontWeight: 600, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(item.total,data)}`, section: 'items', zIndex: 3 }),
        line(`row_div_${i}`, { x: 40, y: y + 20, w: 515, h: 1, fill: '#000000', strokeWidth: 1, section: 'items', zIndex: 2 }),
      ];
    }),

    // Bottom Notes Box Left
    rect('notes_box', { x: 40, y: 570, w: 275, h: 80, fill: 'none', stroke: '#000000', strokeWidth: 1.5, section: 'notes', zIndex: 1 }),
    text('notes_hdr', { x: 48, y: 576, w: 255, h: 14, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'left', text: 'Notes', section: 'notes', zIndex: 2 }),
    text('notes_body', { x: 48, y: 594, w: 255, h: 50, fontSize: 9.5, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 2 }),

    // Bottom Totals Breakdown Right
    text('sub_lbl', { x: 340, y: 570, w: 85, h: 14, fontSize: 10, fontWeight: 700, color: '#000000', align: 'left', text: 'Sub Total', section: 'totals', zIndex: 1 }),
    text('sub_val', { x: 435, y: 570, w: 120, h: 14, fontSize: 10, fontWeight: 600, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}`, section: 'totals', zIndex: 2 }),
    line('sub_line', { x: 435, y: 585, w: 120, h: 1, fill: '#000000', strokeWidth: 1.5, section: 'totals', zIndex: 1 }),

    text('oth_lbl', { x: 340, y: 594, w: 85, h: 14, fontSize: 10, fontWeight: 700, color: '#000000', align: 'left', text: 'Other', section: 'totals', zIndex: 1 }),
    text('oth_val', { x: 435, y: 594, w: 120, h: 14, fontSize: 10, fontWeight: 600, color: '#000000', align: 'right', text: (data.currencySymbol || '') + '0.00', section: 'totals', zIndex: 2 }),
    line('oth_line', { x: 435, y: 609, w: 120, h: 1, fill: '#000000', strokeWidth: 1.5, section: 'totals', zIndex: 1 }),

    text('tax_lbl', { x: 340, y: 618, w: 85, h: 14, fontSize: 10, fontWeight: 700, color: '#000000', align: 'left', text: 'Taxes', section: 'totals', zIndex: 1 }),
    text('tax_val', { x: 435, y: 618, w: 120, h: 14, fontSize: 10, fontWeight: 600, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(taxAmount,data)}`, section: 'totals', zIndex: 2 }),
    line('tax_line', { x: 435, y: 633, w: 120, h: 1, fill: '#000000', strokeWidth: 1.5, section: 'totals', zIndex: 1 }),

    text('tot_lbl', { x: 340, y: 642, w: 85, h: 16, fontSize: 10, fontWeight: 900, color: '#000000', align: 'left', text: 'Grand Total', section: 'totals', zIndex: 1 }),
    text('tot_val', { x: 435, y: 642, w: 120, h: 16, fontSize: 10, fontWeight: 900, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(totalDue,data)}`, section: 'totals', zIndex: 2 }),
    line('tot_line', { x: 435, y: 658, w: 120, h: 1, fill: '#000000', strokeWidth: 1.5, section: 'totals', zIndex: 1 }),
  ];
}

// ── Purchase Order 7 (Global Company Dotted Order Form) ──
export function getPurchaseOrderGlobalCompanyElements(data: InvoiceData, accent: string): InvoiceElement[] {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);


  const dark = accent || '#111827';
  const muted = '#6b7280';

  const items = lineItems.length > 0 ? lineItems : [];

  const calcTax = taxAmount;
  const otherCost = 0;
  const calcTotal = totalDue;

  return [
    // Header Title Left
    text('title', { x: 36, y: 32, w: 250, h: 30, fontSize: 24, fontWeight: 800, color: '#000000', align: 'left', text: 'Purchase Order', section: 'header', zIndex: 1 }),

    // Dotted Meta Left
    text('date_lbl', { x: 36, y: 66, w: 50, h: 12, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'left', text: 'Date:', section: 'meta', zIndex: 1 }),
    text('date_val', { x: 90, y: 66, w: 220, h: 12, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'right', text: String(data.issueDate || ''), section: 'meta', zIndex: 2, semanticField: 'issueDate' }),
    line('date_dot', { x: 36, y: 79, w: 274, h: 1, fill: '#000000', strokeWidth: 1, section: 'meta', zIndex: 1 }),

    text('cid_lbl', { x: 36, y: 83, w: 80, h: 12, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'left', text: 'Customer ID:', section: 'meta', zIndex: 1 }),
    text('cid_val', { x: 120, y: 83, w: 190, h: 12, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'right', text: String(data.clientId || ''), section: 'meta', zIndex: 2 }),
    line('cid_dot', { x: 36, y: 96, w: 274, h: 1, fill: '#000000', strokeWidth: 1, section: 'meta', zIndex: 1 }),

    text('po_num_lbl', { x: 36, y: 100, w: 105, h: 12, fontSize: 9.5, fontWeight: 700, color: '#000000', align: 'left', text: 'PO. No:', section: 'meta', zIndex: 1 }),
    text('po_num_val', { x: 100, y: 100, w: 210, h: 12, fontSize: 9.5, fontWeight: 400, color: '#000000', align: 'right', text: String(data.poNumber || data.invoiceNumber || ''), section: 'meta', zIndex: 2, semanticField: 'invoiceNumber' }),
    line('po_num_dot', { x: 36, y: 113, w: 274, h: 1, fill: '#000000', strokeWidth: 1, section: 'meta', zIndex: 1 }),

    // Header Right Company Info
    text('biz_logo', { x: 330, y: 32, w: 229, h: 16, fontSize: 13, fontWeight: 800, color: '#000000', align: 'right', text: `🌐 ${data.businessName || ''}`, section: 'header', zIndex: 1 }),
    text('biz_details', { x: 330, y: 50, w: 229, h: 56, fontSize: 8.5, fontWeight: 400, color: muted, align: 'right', text: `${data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}, Fax: ${data.senderFax || ''}\nEmail: ${data.senderEmail || ''}\n${data.businessWebsite || ''}`, section: 'header', zIndex: 1 }),

    // Solid Top Divider Line
    rect('top_divider_bar', { x: 36, y: 124, w: 523, h: 6, fill: '#000000', section: 'header', zIndex: 1 }),

    // 3 Column Boxed Banner
    rect('banner_box', { x: 36, y: 138, w: 523, h: 90, fill: 'none', stroke: '#000000', strokeWidth: 1, section: 'client', zIndex: 1 }),
    rect('banner_hdr_bg', { x: 36, y: 138, w: 523, h: 18, fill: '#1a1a1a', section: 'client', zIndex: 1 }),

    line('col1_div', { x: 210, y: 138, w: 1, h: 90, fill: '#000000', strokeWidth: 1, section: 'client', zIndex: 2 }),
    line('col2_div', { x: 384, y: 138, w: 1, h: 90, fill: '#000000', strokeWidth: 1, section: 'client', zIndex: 2 }),

    text('col1_hdr', { x: 42, y: 140, w: 160, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Vendor', section: 'client', zIndex: 3 }),
    text('col1_body', { x: 42, y: 160, w: 160, h: 64, fontSize: 8.5, fontWeight: 400, color: '#000000', align: 'left', text: `${data.clientName || ''}\n${data.clientCompany || ''}\n${data.clientAddress || ''}\nPhone: ${data.clientPhone || ''}`, section: 'client', zIndex: 2 }),

    text('col2_hdr', { x: 216, y: 140, w: 160, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Ship To', section: 'client', zIndex: 3 }),
    text('col2_body', { x: 216, y: 160, w: 160, h: 64, fontSize: 8.5, fontWeight: 400, color: '#000000', align: 'left', text: `${String(data.shipToName || '')}\n${data.shipToAddress || ''}\nPhone: ${data.shipToPhone || ''}`, section: 'client', zIndex: 2 }),

    text('col3_hdr', { x: 390, y: 140, w: 160, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Other Information', section: 'client', zIndex: 3 }),
    text('col3_body', { x: 390, y: 160, w: 160, h: 64, fontSize: 8.5, fontWeight: 400, color: '#000000', align: 'left', text: `Ship Via: ${data.shipVia || ''}\nShipping Method: ${data.shippingMethod || ''}\nPayment Terms: ${data.paymentTerms || ''}\nDelivery Date: ${data.dueDate || ''}`, section: 'client', zIndex: 2 }),

    // Item Table Header
    rect('th_bg', { x: 36, y: 236, w: 523, h: 18, fill: '#000000', section: 'items', zIndex: 1 }),
    text('th_code', { x: 40, y: 238, w: 105, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Item #', section: 'items', zIndex: 2 }),
    text('th_desc', { x: 105, y: 238, w: 260, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'left', text: 'Product Name/Description', section: 'items', zIndex: 2 }),
    text('th_qty', { x: 370, y: 238, w: 50, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'center', text: 'Qty', section: 'items', zIndex: 2 }),
    text('th_price', { x: 425, y: 238, w: 105, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'right', text: 'Unit Price', section: 'items', zIndex: 2 }),
    text('th_total', { x: 458, y: 238, w: 105, h: 14, fontSize: 9, fontWeight: 800, color: '#ffffff', align: 'right', text: 'Total', section: 'items', zIndex: 2 }),

    // Item Table Box & Rows
    rect('tbl_border', { x: 36, y: 254, w: 523, h: 250, fill: 'none', stroke: '#000000', strokeWidth: 1, section: 'items', zIndex: 1 }),
    ...items.flatMap((item, i) => {
      const y = 258 + i * 22;
      return [
        text(`item_${i}_code`, { x: 40, y, w: 105, h: 14, fontSize: 9, fontWeight: 400, color: '#000000', align: 'left', text: `00${i + 1}`, section: 'items', zIndex: 2 }),
        text(`item_${i}_desc`, { x: 105, y, w: 260, h: 14, fontSize: 9, fontWeight: 500, color: '#000000', align: 'left', text: item.description, section: 'items', zIndex: 2 }),
        text(`item_${i}_qty`, { x: 370, y, w: 50, h: 14, fontSize: 9, fontWeight: 400, color: '#000000', align: 'center', text: String(item.quantity), section: 'items', zIndex: 2 }),
        text(`item_${i}_price`, { x: 425, y, w: 105, h: 14, fontSize: 9, fontWeight: 400, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${item.unitPrice.toFixed(0)}`, section: 'items', zIndex: 2 }),
        text(`item_${i}_tot`, { x: 495, y, w: 105, h: 14, fontSize: 9, fontWeight: 600, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${item.total.toFixed(0)}`, section: 'items', zIndex: 2 }),
        line(`row_div_${i}`, { x: 36, y: y + 18, w: 523, h: 1, fill: '#000000', strokeWidth: 1, section: 'items', zIndex: 1 }),
      ];
    }),

    // Notes Left
    text('notes_hdr', { x: 36, y: 512, w: 280, h: 14, fontSize: 9.5, fontWeight: 800, color: dark, align: 'left', text: 'Notes & Description:', section: 'notes', zIndex: 1 }),
    text('notes_txt', { x: 36, y: 528, w: 280, h: 60, fontSize: 8.5, fontWeight: 400, color: muted, align: 'left', text: stripMarkdownText(data.notesAndTerms || '') || '', section: 'notes', zIndex: 1 }),

    // Dark Totals Right Card
    rect('tot_card_bg', { x: 349, y: 512, w: 210, h: 120, fill: '#333333', stroke: '#000000', strokeWidth: 1.5, section: 'totals', zIndex: 1 }),

    text('sub_lbl', { x: 355, y: 516, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: 'Sub Total:', section: 'totals', zIndex: 2 }),
    rect('sub_val_bg', { x: 474, y: 516, w: 80, h: 14, fill: '#ffffff', section: 'totals', zIndex: 2 }),
    text('sub_val', { x: 474, y: 516, w: 76, h: 14, fontSize: 9, fontWeight: 700, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}`, section: 'totals', zIndex: 3 }),

    text('disc_lbl', { x: 355, y: 534, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: 'Discount:', section: 'totals', zIndex: 2 }),
    rect('disc_val_bg', { x: 474, y: 534, w: 80, h: 14, fill: '#ffffff', section: 'totals', zIndex: 2 }),
    text('disc_val', { x: 474, y: 534, w: 76, h: 14, fontSize: 9, fontWeight: 700, color: '#000000', align: 'right', text: (data.currencySymbol || '') + '0.00', section: 'totals', zIndex: 3 }),

    text('taxrate_lbl', { x: 355, y: 552, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: 'Sales Tax Rate:', section: 'totals', zIndex: 2 }),
    rect('taxrate_val_bg', { x: 474, y: 552, w: 80, h: 14, fill: '#ffffff', section: 'totals', zIndex: 2 }),
    text('taxrate_val', { x: 474, y: 552, w: 76, h: 14, fontSize: 9, fontWeight: 700, color: '#000000', align: 'right', text: `${taxRate ?? 0}%`, section: 'totals', zIndex: 3 }),

    text('tax_lbl', { x: 355, y: 570, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: 'Sales Tax:', section: 'totals', zIndex: 2 }),
    rect('tax_val_bg', { x: 474, y: 570, w: 80, h: 14, fill: '#ffffff', section: 'totals', zIndex: 2 }),
    text('tax_val', { x: 474, y: 570, w: 76, h: 14, fontSize: 9, fontWeight: 700, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(calcTax,data)}`, section: 'totals', zIndex: 3 }),

    text('oth_lbl', { x: 355, y: 588, w: 110, h: 14, fontSize: 9, fontWeight: 700, color: '#ffffff', align: 'right', text: 'Other Cost:', section: 'totals', zIndex: 2 }),
    rect('oth_val_bg', { x: 474, y: 588, w: 80, h: 14, fill: '#ffffff', section: 'totals', zIndex: 2 }),
    text('oth_val', { x: 474, y: 588, w: 76, h: 14, fontSize: 9, fontWeight: 700, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(otherCost,data)}`, section: 'totals', zIndex: 3 }),

    text('tot_lbl', { x: 355, y: 608, w: 110, h: 16, fontSize: 10, fontWeight: 900, color: '#ffffff', align: 'right', text: 'Grand Total:', section: 'totals', zIndex: 2 }),
    rect('tot_val_bg', { x: 474, y: 608, w: 80, h: 16, fill: '#ffffff', section: 'totals', zIndex: 2 }),
    text('tot_val', { x: 474, y: 608, w: 76, h: 16, fontSize: 10, fontWeight: 900, color: '#000000', align: 'right', text: `${data.currencySymbol || ''}${formatDocumentMoney(calcTotal,data)}`, section: 'totals', zIndex: 3 }),

    // Signatures Dotted Underlines
    line('sig1_dot', { x: 36, y: 660, w: 200, h: 1, fill: '#000000', strokeWidth: 1, section: 'notes', zIndex: 1 }),
    text('sig1_lbl', { x: 36, y: 646, w: 105, h: 12, fontSize: 8.5, fontWeight: 700, color: '#000000', align: 'left', text: 'Date', section: 'notes', zIndex: 2 }),
    text('sig1_val', { x: 36, y: 664, w: 200, h: 12, fontSize: 8.5, fontWeight: 400, color: muted, align: 'left', text: String(data.issueDate || ''), section: 'notes', zIndex: 2, semanticField: 'issueDate' }),

    line('sig2_dot', { x: 309, y: 660, w: 250, h: 1, fill: '#000000', strokeWidth: 1, section: 'notes', zIndex: 1 }),
    text('sig2_lbl', { x: 309, y: 646, w: 250, h: 12, fontSize: 8.5, fontWeight: 700, color: muted, align: 'center', text: 'Authorized Signature', section: 'notes', zIndex: 2 }),

    // Customer Care Note
    text('cust_note', { x: 36, y: 695, w: 523, h: 14, fontSize: 8.5, fontWeight: 400, color: muted, align: 'center', text: 'If you have any questions, concerns or queries regarding this PO, please feel free to contact with MR. ABC at 111-222-4455', section: 'notes', zIndex: 1 }),

    // Bottom Logo Footer
    text('bot_logo', { x: 36, y: 730, w: 523, h: 14, fontSize: 10, fontWeight: 800, color: '#000000', align: 'center', text: `🌐 ${data.businessName || ''}`, section: 'notes', zIndex: 1 }),
    text('bot_addr', { x: 36, y: 746, w: 523, h: 36, fontSize: 8, fontWeight: 400, color: muted, align: 'center', text: `${data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}, Fax: ${data.senderFax || ''}\nEmail: ${data.senderEmail || ''} | ${data.businessWebsite || ''}`, section: 'notes', zIndex: 1 }),
  ];
}

export const ELEMENT_MODEL_TEMPLATE_IDS = [
  'tmpl_invoice_odoo_community',
  'tmpl_invoice_2023_01',
  'tmpl_invoice_2023_02',
  'tmpl_invoice_2023_03',
  'tmpl_invoice_2023_52',
  'tmpl_invoice_2018_01',
  'tmpl_invoice_2018_02',
  'tmpl_invoice_2023_04',
  'tmpl_invoice_2023_06',
  'tmpl_invoice_2023_03_1',
  'tmpl_invoice_2023_02_1',
  'tmpl_invoice_2023_05_1',
  'tmpl_invoice_2023_07',
  'tmpl_invoice_2023_08',
  'tmpl_invoice_2018_03',
  'tmpl_invoice_2018_04',
  'tmpl_quotation_modern',
  'tmpl_quotation_executive',
  'tmpl_proposal_corporate',
  'tmpl_proposal_modern',
  'tmpl_receipt_mobile_app_ui',
  'tmpl_receipt_purchase_ui',
  'tmpl_receipt_grid_bordered',
  'tmpl_receipt_official',
  'tmpl_receipt_compact',
  'tmpl_purchase_order_global_company',
  'tmpl_purchase_order_minimal_grid',
  'tmpl_purchase_order_cyan_clean',
  'tmpl_purchase_order_templatelab',
  'tmpl_purchase_order_classic',
  'tmpl_purchase_order_standard',
  'tmpl_purchase_order_corporate',
];

export function getElementsForTemplate(templateId: string, rawData: Record<string, unknown>, accent: string): InvoiceElement[] | null {
  const bound=bindDocumentText(normalizeInvoiceData(rawData));
  const data = bound.data as InvoiceData;
  let elements: InvoiceElement[] | null = null;
  if (templateId === 'tmpl_invoice_odoo_community') elements = getInvoiceOdooCommunityElements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_01') elements = getInvoice2023_01Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_02') elements = getInvoice2023_02Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_03') elements = getInvoice2023_03Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_52') elements = getInvoice2023_52Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2018_01') elements = getInvoice2018_01Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2018_02') elements = getInvoice2018_02Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_04') elements = getInvoice2023_04Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_06') elements = getInvoice2023_06Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_03_1') elements = getInvoice2023_03_1Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_02_1') elements = getInvoice2023_02_1Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_05_1') elements = getInvoice2023_05_1Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_07') elements = getInvoice2023_07Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2023_08') elements = getInvoice2023_08Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2018_03') elements = getInvoice2018_03Elements(data, accent);
  else if (templateId === 'tmpl_invoice_2018_04') elements = getInvoice2018_04Elements(data, accent);
  else if (templateId === 'tmpl_quotation_modern' || templateId === 'tmpl_quotation_executive') elements = getQuotationModernElements(data, accent);
  else if (templateId === 'tmpl_proposal_corporate' || templateId === 'tmpl_proposal_modern') elements = getProposalCorporateElements(data, accent);
  else if (templateId === 'tmpl_receipt_mobile_app_ui') elements = getReceiptMobileAppUIElements(data, accent);
  else if (templateId === 'tmpl_receipt_purchase_ui') elements = getReceiptPurchaseUIElements(data, accent);
  else if (templateId === 'tmpl_receipt_grid_bordered') elements = getReceiptGridBorderedElements(data, accent);
  else if (templateId === 'tmpl_receipt_official' || templateId === 'tmpl_receipt_compact') elements = getReceiptOfficialElements(data, accent);
  else if (templateId === 'tmpl_purchase_order_global_company') elements = getPurchaseOrderGlobalCompanyElements(data, accent);
  else if (templateId === 'tmpl_purchase_order_minimal_grid') elements = getPurchaseOrderMinimalGridElements(data, accent);
  else if (templateId === 'tmpl_purchase_order_cyan_clean') elements = getPurchaseOrderCyanCleanElements(data, accent);
  else if (templateId === 'tmpl_purchase_order_templatelab') elements = getPurchaseOrderOrangeWaveElements(data, accent);
  else if (templateId === 'tmpl_purchase_order_classic') elements = getPurchaseOrderClassicElements(data, accent);
  else if (templateId === 'tmpl_purchase_order_standard' || templateId === 'tmpl_purchase_order_corporate') elements = getPurchaseOrderStandardElements(data, accent);

  const docType = data.documentType;
  if (elements && docType && docType !== 'invoice') {
    elements = elements.map((el) => {
      if (el.type === 'text') {
        const text = transformDocTypeText(el.text, docType);
        // The big header title (id 'header_title' across every migrated
        // template) is sized to fit its own fixed-width box for the
        // shortest doc-type word, "INVOICE" (7 chars) — "QUOTATION" (9)
        // and especially "PURCHASE ORDER" (14) overflow that box and wrap
        // onto a second line, colliding with whatever sits below it.
        // Scale the font down proportionally to how much longer the
        // transformed word is, same idea as autoFontSize for money values.
        if (el.id === 'header_title' && text.length > 7) {
          return { ...el, text, fontSize: Math.max(14, Math.round((el.fontSize * 7) / text.length)) };
        }
        return { ...el, text };
      }
      return el;
    });
  }

  return elements?.map(el=>el.type==='text'?{...el,text:bound.restore(el.text)}:el)||null;
}
