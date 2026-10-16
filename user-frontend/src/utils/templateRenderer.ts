import { formatMoney } from '../../../shared/field-processing.mjs';
import { bindDocumentText, escapeDocumentText } from './documentValues';
import { documentData,validField,formatDocumentMoney } from '../../../shared/document-contract.mjs';
import type { LayoutState } from '../types';

// ─────────────────────────────────────────────────────────────────────────
// Sourced from Figma "Invoice Templates (Community)" via the REST API —
// exact field labels, positions, colors and font sizes/weights were pulled
// node-by-node (not eyeballed) from two real variants:
//   - "Invoice 1" on the Templates - 2023 page  -> renderInvoice2023_01
//   - "Invoice 2" on the Old / 2018 Templates page -> renderInvoice2018_02
// These two are pixel-faithful to the source. Only ship a template here
// once it's been extracted the same way — do not add "inspired by" variants
// under a real Figma invoice's name.
// ─────────────────────────────────────────────────────────────────────────

interface InvoiceData {
  businessName?: string;
  senderEmail?: string;
  senderAddress?: string;
  senderPhone?: string;
  clientName?: string;
  clientEmail?: string;
  clientAddress?: string;
  invoiceNumber?: string;
  issueDate?: string;
  dueDate?: string;
  taxRate?: number;
  taxAmount?: number;
  subtotal?: number;
  totalDue?: number;
  notesAndTerms?: string;
  lineItems?: Array<{ description: string; quantity: number; unitPrice: number; total: number }>;
  [key: string]: unknown;
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
  if (len > 22) return Math.max(7, baseSize - 6);
  if (len > 18) return Math.max(8, baseSize - 5);
  if (len > 15) return Math.max(9, baseSize - 4);
  if (len > 13) return Math.max(10, baseSize - 3);
  if (len > 11) return Math.max(10, baseSize - 1);
  return baseSize;
}

export function formatMarkdownHTML(text: string): string {
  if (!text) return '';
  return escapeDocumentText(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br/>');
}

export function getCurrencySymbol(data?: InvoiceData): string {
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

export function getCurrencyCode(data?: InvoiceData): string {
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
  return `${sym}${formatMoney(num,typeof symbolOrData==='object'?String(symbolOrData.currency||''):undefined,typeof symbolOrData==='object'?String(symbolOrData.locale||'en-US'):undefined)}`;
}

// Logo mark shown next to the org name wherever the real Figma frame has a
// logo slot. Renders nothing until the user actually uploads one via the
// Branding toolkit (layoutState.logoUrl) — no auto-inserted placeholder box
// on the canvas itself.
function renderLogoMark(layoutState: LayoutState | null | undefined, size = 32, radius = '6px'): string {
  if (!layoutState?.logoUrl || layoutState?.showLogo === false) return '';
  return `<img src="${layoutState.logoUrl}" alt="Logo" style="width: ${size}px; height: ${size}px; border-radius: ${radius}; object-fit: cover; flex-shrink: 0;" />`;
}

function showSection(layoutState: LayoutState | null | undefined, key: 'showHeader' | 'showNotes' | 'showTotalDetails'): boolean {
  return layoutState?.[key] !== false;
}

// ── Invoice 1 (2023) — orange accent, two-row meta grid, generous whitespace ──
function renderInvoice2023_01(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <!-- Header — business name is offset ~68px to clear a logo mark, per the real Figma layout -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 44px;">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          ${renderLogoMark(layoutState, 32, '6px')}
          <div>
            <h1 style="font-size: 18px; font-weight: 600; color: ${accent}; margin: 0 0 12px 0;">${data.businessName || ''}</h1>
            <p style="font-size: 10px; color: ${muted}; margin: 2px 0;">${data.senderEmail ? '' : ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 2px 0;">${data.senderEmail || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 2px 0;">${data.senderPhone || ''}</p>
          </div>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 10px; color: ${muted}; margin: 2px 0; line-height: 1.5;">${data.senderAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 2px 0;"></p>
        </div>
      </div>
      ` : ''}

      <!-- Meta row 1: Billed to / Invoice number / Invoice of (${data.currency || ''}) -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Billed to</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">${data.clientEmail || ''}</p>
        </div>
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Invoice number</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 22px 0;">#${data.invoiceNumber || ''}</p>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Reference</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.referenceNumber || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Invoice of (${data.currency || ''})</p>
          <p style="font-size: ${m(totalDue).length > 13 ? '16px' : (m(totalDue).length > 10 ? '18px' : '20px')}; font-weight: 700; color: ${accent}; margin: 0; white-space: nowrap;">${m(totalDue)}</p>
        </div>
      </div>

      <!-- Meta row 2: Subject / Invoice date / Due date -->
      <div style="display: flex; justify-content: space-between; margin-bottom: 32px; padding-bottom: 24px; border-bottom: 1px solid #e5e7eb;">
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Subject</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.subject || ''}</p>
        </div>
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Invoice date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Due date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.dueDate || ''}</p>
        </div>
      </div>

      <!-- Item table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="text-align: left; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${muted};">Item Detail</th>
            <th style="text-align: left; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${muted};">Qty</th>
            <th style="text-align: right; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${muted};">Rate</th>
            <th style="text-align: right; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: ${muted};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr>
              <td style="padding: 8px 0;">
                <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${item.description}</p>
              </td>
              <td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark};">${item.quantity}</td>
              <td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <!-- Totals -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
        <div style="width: 220px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 10px; font-weight: 500; color: ${dark};">
            <span>Subtotal</span><span>${m(subtotal)}</span>
          </div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 10px; font-weight: 500; color: ${dark};"><span>Tax (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 0; font-size: 10px; font-weight: 700; color: ${dark}; border-top: 1px solid #e5e7eb; margin-top: 6px;">
            <span>Total</span><span>${m(totalDue)}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <!-- Footer -->
      <div>
        <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 24px 0;">Thanks for the business.</p>
        <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Terms &amp; Conditions</p>
        <p style="font-size: 10px; color: ${dark}; margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 2 (2018 legacy) — purple brand, yellow highlight card, navy total bar ──
function renderInvoice2018_02(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const highlight = '#fff9b9';
  const navy = '#222234';
  const divider = '#bcb0c4';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          ${renderLogoMark(layoutState, 32, '999px')}
          <h1 style="font-size: 20px; font-weight: 700; color: ${accent}; margin: 0;">${data.businessName || ''}</h1>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 12px; color: ${muted}; margin: 0 0 4px 0;">${data.senderAddress || ''}</p>
          <p style="font-size: 12px; color: ${muted}; margin: 0; line-height: 1.5;">${data.senderPhone || ''}<br/>${data.senderEmail || ''}</p>
        </div>
      </div>
      ` : ''}

      <!-- Billed to -->
      <div style="text-align: right; margin-bottom: 20px;">
        <p style="font-size: 12px; color: ${muted}; margin: 0 0 4px 0;">Billed to,</p>
        <p style="font-size: 12px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">${data.clientName || ''}</p>
        <p style="font-size: 12px; color: ${muted}; margin: 0; line-height: 1.5;">${data.clientAddress || ''}</p>
      </div>

      <!-- Subject / Invoice Date — plain, sits above the highlighted band -->
      <div style="display: flex; justify-content: space-between; padding-bottom: 12px; margin-bottom: 12px; border-top: 1px solid ${divider}; padding-top: 12px;">
        <div>
          <p style="font-size: 11px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Subject</p>
          <p style="font-size: 16px; font-weight: 600; color: ${dark}; margin: 0;">${data.subject || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 12px; color: ${muted}; margin: 0 0 4px 0;">Invoice Date</p>
          <p style="font-size: 12px; font-weight: 600; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
        </div>
      </div>

      <!-- Full-width highlight bar: Invoice of (${data.currency || ''}) / Invoice number / Reference -->
      <div style="display: flex; justify-content: space-between; background: ${highlight}; border-top: 1px solid ${divider}; border-bottom: 1px solid ${divider}; padding: 12px 20px; margin-bottom: 16px;">
        <div>
          <p style="font-size: 11px; color: ${muted}; margin: 0 0 4px 0;">Invoice of (${data.currency || ''})</p>
          <p style="font-size: 13px; font-weight: 800; color: ${dark}; margin: 0;">${m(totalDue)}</p>
        </div>
        <div>
          <p style="font-size: 11px; color: ${muted}; margin: 0 0 4px 0;">Invoice number</p>
          <p style="font-size: 12px; font-weight: 600; color: ${dark}; margin: 0;">#${data.invoiceNumber || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 11px; color: ${muted}; margin: 0 0 4px 0;">Reference</p>
          <p style="font-size: 12px; font-weight: 600; color: ${dark}; margin: 0;">${data.referenceNumber || ''}</p>
        </div>
      </div>

      <!-- Item table — plain, full width -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; padding: 0 20px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 0 20px 8px 20px; font-size: 10px; font-weight: 600; text-transform: uppercase; color: ${muted};">Item description</th>
            <th style="text-align: right; padding-bottom: 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; color: ${muted};">Qty</th>
            <th style="text-align: right; padding-bottom: 8px; font-size: 10px; font-weight: 600; text-transform: uppercase; color: ${muted};">Rate</th>
            <th style="text-align: right; padding: 0 20px 8px 0; font-size: 10px; font-weight: 600; text-transform: uppercase; color: ${muted};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr>
              <td style="padding: 6px 20px; font-size: 12px; color: ${dark};">${item.description}</td>
              <td style="padding: 6px 0; font-size: 12px; color: ${dark}; text-align: right;">${String(item.quantity).padStart(2, '0')}</td>
              <td style="padding: 6px 0; font-size: 12px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 6px 20px; font-size: 12px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <!-- Payment Details (left, plain) + Sub Total/GST/Total (right, yellow -> navy panel) -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
        <div style="padding-top: 10px; border-top: 1px solid ${divider}; width: 45%;">
          <p style="font-size: 11px; font-weight: 500; color: ${muted}; margin: 0 0 8px 0;">Payment Details</p>
          <p style="font-size: 12px; color: ${dark}; margin: 0 0 2px 0;">${data.senderEmail ? `Paypal: ${data.senderEmail}` : ''}</p>
          <p style="font-size: 12px; color: ${dark}; margin: 0;">UPI: </p>
        </div>
        <div style="width: 48%; background: ${highlight};">
          <div style="padding: 10px 16px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: ${muted}; margin-bottom: 6px;">
              <span>Sub Total</span><span style="font-weight: 700; color: ${dark};">${m(subtotal)}</span>
            </div>
            ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 12px; color: ${muted};"><span>GST(${taxRate}%)</span><span style="font-weight: 700; color: ${dark};">${m(taxAmount)}</span></div>` : ''}
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; white-space: nowrap; background: ${navy}; padding: 12px 16px;">
            <span style="font-size: 12px; font-weight: 600; color: #ffffff;">Total</span>
            <span style="font-size: 16px; font-weight: 800; color: #ffffff;">${m(totalDue)}</span>
          </div>
        </div>
      </div>

      <div style="text-align: right; margin-top: 16px; margin-bottom: 24px;">
        <p style="font-size: 11px; color: ${muted}; margin: 0 0 4px 0;">In words</p>
        <p style="font-size: 12px; font-weight: 700; color: ${dark}; margin: 0;">${data.amountInWords || `${getCurrencyCode(data)} ${Math.round(totalDue).toLocaleString("en-US")} Only.`}</p>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <!-- Footer: Note | Terms & Conditions -->
      <div style="display: flex; justify-content: space-between; gap: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <div>
          <p style="font-size: 11px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Note</p>
          <p style="font-size: 16px; font-weight: 600; color: ${dark}; margin: 0;">Thanks for the business.</p>
        </div>
        <div style="flex: 1;">
          <p style="font-size: 11px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Terms &amp; Conditions</p>
          <p style="font-size: 11px; color: ${dark}; margin: 0; line-height: 1.5;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 2 (2023) — blue accent, 4-col meta row, right-side highlight panel ──
function renderInvoice2023_02(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const soft = '#eaf4fe';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 44px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${renderLogoMark(layoutState, 20, '4px')}
          <h1 style="font-size: 12px; font-weight: 700; color: ${accent}; margin: 0;">${data.businessName || ''}</h1>
        </div>
        <p style="font-size: 10px; color: ${muted}; margin: 0; text-align: right; line-height: 1.5;">${data.senderAddress || ''}<br/></p>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; margin-bottom: 32px;">
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Billed to</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">${data.clientPhone || ''}</p>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-bottom: 12px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Due date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.dueDate || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Invoice date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
        </div>
        <div style="background: ${soft}; margin: -10px 0; padding: 10px 16px;">
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Invoice number</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">#${data.invoiceNumber || ''}</p>
        </div>
        <div style="background: ${soft}; margin: -10px -0; padding: 10px 16px; text-align: right;">
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Reference</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.referenceNumber || ''}</p>
        </div>
      </div>

      <div style="display: flex;">
        <div style="flex: 1;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding-bottom: 8px; font-size: 10px; font-weight: 500; color: ${muted};">Item description</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map((item) => `<tr><td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">${item.description}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="width: 266px; background: ${soft}; padding: 0 20px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 8px 0; font-size: 10px; font-weight: 500; color: ${muted};">Qty</th>
                <th style="text-align: right; padding: 8px 0; font-size: 10px; font-weight: 500; color: ${muted};">Rate</th>
                <th style="text-align: right; padding: 8px 0; font-size: 10px; font-weight: 500; color: ${muted};">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map((item) => `
                <tr>
                  <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">${item.quantity}</td>
                  <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                  <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
                </tr>
              `).join('')}
              ${showSection(layoutState, 'showTotalDetails') ? `
              <tr><td colspan="2" style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">Subtotal</td><td style="text-align: right; white-space: nowrap; font-size: 10px; font-weight: 500; color: ${dark};">${m(subtotal)}</td></tr>
              ${taxRate > 0 ? `<tr><td colspan="2" style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">Tax (${taxRate}%)</td><td style="text-align: right; white-space: nowrap; font-size: 10px; font-weight: 500; color: ${dark};">${m(taxAmount)}</td></tr>` : ''}
              <tr><td colspan="2" style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">Total</td><td style="text-align: right; white-space: nowrap; font-size: 10px; font-weight: 500; color: ${dark};">${m(totalDue)}</td></tr>
              ` : ''}
            </tbody>
          </table>
          ${showSection(layoutState, 'showTotalDetails') ? `
          <div style="display: flex; justify-content: space-between; align-items: center; white-space: nowrap; background: ${accent}; padding: 12px 16px; margin: 0 -20px;">
            <span style="font-size: 12px; font-weight: 700; color: #ffffff;">Total due</span>
            <span style="font-size: 12px; font-weight: 800; color: #ffffff;">${m(totalDue)}</span>
          </div>
          ` : ''}
        </div>
      </div>
      ${showSection(layoutState, 'showTotalDetails') ? `<p style="font-size: 10px; color: ${muted}; text-align: right; margin: 8px 0 0 0;">USD ${Math.round(totalDue).toLocaleString("en-US")} Only.</p>` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="display: flex; justify-content: space-between; padding-top: 16px; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 10px; font-weight: 500; color: ${dark}; margin: 0;">Thank you for the business!</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderPhone || ''} &nbsp; ${data.senderEmail || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 3 (2023) — indigo, plain "Invoice" title, vertical meta list + table ──
function renderInvoice2023_03(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const band = '#f9fafc';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="background: ${band}; padding: 28px 32px;">
        <h1 style="font-size: 28px; font-weight: 600; color: ${dark}; margin: 0 0 24px 0;">Invoice</h1>
        <div style="display: flex; justify-content: space-between;">
          <div>
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">Billed to</p>
            <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          </div>
          <div style="display: flex; align-items: flex-start; gap: 8px;">
            <div style="text-align: right;">
              <p style="font-size: 12px; font-weight: 700; color: ${accent}; margin: 0 0 6px 0;">${data.businessName || ''}</p>
              <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.5;">${data.senderAddress || ''}${data.senderTaxId ? `<br/>TAX ID ${data.senderTaxId}` : ''}</p>
            </div>
            ${renderLogoMark(layoutState, 24, '4px')}
          </div>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; padding: 32px; flex: 1;">
        <div style="width: 124px; flex-shrink: 0;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Invoice #</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 18px 0;">${data.invoiceNumber || ''}</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Invoice date</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 18px 0;">${data.issueDate || ''}</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Reference</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 18px 0;">${data.referenceNumber || ''}</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Due date</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.dueDate || ''}</p>
        </div>
        <div style="flex: 1;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Services</th>
                <th style="text-align: left; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Qty</th>
                <th style="text-align: right; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Rate</th>
                <th style="text-align: right; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Line total</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map((item) => `
                <tr>
                  <td style="padding: 8px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
                  <td style="padding: 8px 0; font-size: 10px; color: ${muted};">${item.quantity}</td>
                  <td style="padding: 8px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                  <td style="padding: 8px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
                </tr>
              `).join('')}
              ${showSection(layoutState, 'showTotalDetails') ? `
              <tr><td></td><td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark};">Subtotal</td><td></td><td style="text-align: right; white-space: nowrap; font-size: 10px; color: ${muted};">${m(subtotal)}</td></tr>
              ${taxRate > 0 ? `<tr><td></td><td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark};">Tax (${taxRate}%)</td><td></td><td style="text-align: right; white-space: nowrap; font-size: 10px; color: ${muted};">${m(taxAmount)}</td></tr>` : ''}
              <tr style="background: ${band};"><td></td><td style="padding: 8px 0; font-size: 10px; font-weight: 700; color: ${accent};">Total due</td><td></td><td style="text-align: right; white-space: nowrap; font-size: 10px; font-weight: 700; color: ${accent};">${m(totalDue)}</td></tr>
              ` : ''}
            </tbody>
          </table>
          ${showSection(layoutState, 'showNotes') ? `<p style="font-size: 10px; color: ${muted}; margin: 12px 0 0 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>` : ''}
        </div>
      </div>

      <div style="background: ${band}; padding: 20px 32px; display: flex; justify-content: space-between;">
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress ? '' : ''}</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderPhone || ''}</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderEmail || ''}</p>
      </div>
    </div>
  `;
}

// ── Invoice 5.2 (2023, "Digital") — card-grid layout, To/From, pink dues banner ──
function renderInvoice2023_52(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const card = '#f2f4f7';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 16px; background: #ffffff; display: flex; flex-direction: column; gap: 12px;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="background: ${card}; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${renderLogoMark(layoutState, 20, '4px')}
          <p style="font-size: 12px; margin: 0;"><span style="font-weight: 600; color: ${dark};">Invoice </span><span style="color: ${muted};">#${data.invoiceNumber || ''}</span></p>
        </div>
        <p style="font-size: 12px; margin: 0;"><span style="font-weight: 600; color: ${dark};">Date </span><span style="color: ${muted};">${data.issueDate || ''}</span></p>
      </div>

      <div style="display: flex; gap: 12px;">
        <div style="flex: 1; background: ${card}; padding: 16px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 8px 0;">To</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientPhone || ''}</p>
        </div>
        <div style="flex: 1; background: ${card}; padding: 16px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 8px 0;">From</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.businessName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.senderAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;"></p>
        </div>
      </div>
      ` : ''}

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="background: ${card}; padding: 12px 16px;">
        <span style="font-size: 14px; font-weight: 700; color: ${accent};">${m(totalDue)}</span>
        <span style="font-size: 14px; font-weight: 500; color: ${muted};"> dues on ${data.dueDate || ''}</span>
      </div>
      ` : ''}

      <div style="background: ${card}; padding: 16px; flex: 1;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Service</th>
              <th style="text-align: left; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Qty</th>
              <th style="text-align: right; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Rate</th>
              <th style="text-align: right; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Line total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map((item) => `
              <tr>
                <td style="padding: 10px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted};">${item.quantity}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${showSection(layoutState, 'showTotalDetails') ? `
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #d8dce3;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${dark};"><span style="font-weight: 600;">Subtotal</span><span style="color: ${muted};">${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${dark};"><span style="font-weight: 600;">Tax (${taxRate}%)</span><span style="color: ${muted};">${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${dark};"><span style="font-weight: 600;">Total</span><span>${m(totalDue)}</span></div>
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; font-weight: 700; color: ${dark};"><span>Amount due</span><span>${m(totalDue)}</span></div>
        </div>
        ` : ''}
      </div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="display: flex; gap: 12px;">
        <div style="flex: 1; background: ${card}; padding: 16px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">Thank you for the business!</p>
          <p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
        <div style="flex: 1; background: ${card}; padding: 16px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px;"><span style="font-weight: 600; color: ${dark};">Bank details</span><span style="color: ${muted};">${data.accountDetails || ''}</span></div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px;"><span style="font-weight: 600; color: ${dark};">IFS code</span><span style="color: ${muted};"></span></div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; margin-bottom: 4px;"><span style="font-weight: 600; color: ${dark};">Swift code</span><span style="color: ${muted};"></span></div>
          <div style="display: flex; justify-content: space-between; font-size: 10px;"><span style="font-weight: 600; color: ${dark};">Account #</span><span style="color: ${muted};"></span></div>
        </div>
      </div>
      ` : ''}

      <div style="background: ${card}; padding: 12px 16px; display: flex; justify-content: space-between;">
        <span style="font-size: 12px; font-weight: 500; color: ${muted};">Digital Product Designer, IN</span>
        <span style="font-size: 12px; font-weight: 500; color: ${muted};">${data.senderPhone || ''}</span>
        <span style="font-size: 12px; font-weight: 500; color: ${muted};">${data.senderEmail || ''}</span>
      </div>
    </div>
  `;
}

// ── Invoice 1 (2018 legacy) — lavender header band, purple grand total ──
function renderInvoice2018_01(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const band = '#ebebf5';
  const divider = '#bcb0c4';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="background: ${band}; padding: 30px 30px 24px 30px; display: flex; justify-content: space-between;">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          ${renderLogoMark(layoutState, 28, '999px')}
          <p style="font-size: 16px; color: ${muted}; margin: 0; line-height: 1.5;">${data.businessName ? `<span style="font-weight: 600; color: ${dark};">${data.businessName}</span><br/>` : ''}${data.senderPhone || ''}<br/>${data.senderEmail || ''}<br/>${data.senderAddress ? '' : ''}</p>
        </div>
        <p style="font-size: 16px; color: ${muted}; margin: 0; text-align: right; line-height: 1.5;">${data.senderAddress || ''}</p>
      </div>
      ` : ''}

      <div style="padding: 30px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 30px;">
          <div>
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Billed to,</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
            <p style="font-size: 14px; color: ${dark}; margin: 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          </div>
          <div>
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Invoice number</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0 0 14px 0;">#${data.invoiceNumber || ''}</p>
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Reference</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0;">${data.referenceNumber || ''}</p>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Invoice of (${data.currency || ''})</p>
            <p style="font-size: 24px; font-weight: 700; color: ${accent}; margin: 0;">${m(totalDue)}</p>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; padding-bottom: 20px; margin-bottom: 20px; border-bottom: 2px solid ${divider};">
          <div>
            <p style="font-size: 18px; font-weight: 600; color: ${dark}; margin: 0;">${data.subject || ''}</p>
          </div>
          <div>
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Invoice Date</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
          </div>
          <div style="text-align: right;">
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Due Date</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0;">${data.dueDate || ''}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
          <thead>
            <tr>
              <th style="text-align: left; padding-bottom: 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: ${muted};">Item Details</th>
              <th style="text-align: right; padding-bottom: 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: ${muted};">Qty</th>
              <th style="text-align: right; padding-bottom: 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: ${muted};">Rate</th>
              <th style="text-align: right; padding-bottom: 10px; font-size: 12px; font-weight: 600; text-transform: uppercase; color: ${muted};">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map((item) => `
              <tr style="border-bottom: 1px solid ${divider};">
                <td style="padding: 10px 0; font-size: 14px; color: ${dark};">${item.description}</td>
                <td style="padding: 10px 0; font-size: 14px; font-weight: 500; color: ${dark}; text-align: right;">${String(item.quantity).padStart(2, '0')}</td>
                <td style="padding: 10px 0; font-size: 14px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                <td style="padding: 10px 0; font-size: 14px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="display: flex; justify-content: space-between; padding-top: 10px;">
          ${showSection(layoutState, 'showNotes') ? `
          <div>
            <p style="font-size: 12px; font-weight: 600; color: ${muted}; margin: 0 0 8px 0;">Notes</p>
            <p style="font-size: 14px; color: ${dark}; margin: 0; max-width: 280px;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
          </div>
          ` : '<div></div>'}
          ${showSection(layoutState, 'showTotalDetails') ? `
          <div style="width: 200px;">
            <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; font-weight: 600; color: ${muted};"><span>Sub Total</span><span style="font-size: 14px; font-weight: 500; color: ${dark};">${m(subtotal)}</span></div>
            ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; font-weight: 600; color: ${muted};"><span>GST(${taxRate}%)</span><span style="font-size: 14px; font-weight: 500; color: ${dark};">${m(taxAmount)}</span></div>` : ''}
            <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-top: 6px; border-top: 1px solid ${divider}; font-size: 12px; font-weight: 600; color: ${muted};"><span>Total</span><span style="font-size: 16px; font-weight: 600; color: ${dark};">${m(totalDue)}</span></div>
          </div>
          ` : ''}
        </div>
      </div>

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="padding: 0 30px 30px 30px;">
        <p style="font-size: 12px; font-weight: 600; color: ${muted}; margin: 0 0 8px 0;">Terms &amp; Conditions</p>
        <p style="font-size: 12px; color: ${dark}; margin: 0;">Lorem ipsum dolor sit amet, consectetur adipiscing elit</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 4 (2023) — magenta accent, serif "Invoice" title, 3-col Billed-to/From ──
function renderInvoice2023_04(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
        <h1 style="font-family: Georgia, serif; font-size: 32px; font-weight: 600; color: ${dark}; margin: 0;">Invoice</h1>
        <span style="font-size: 20px; font-weight: 700; color: ${muted};">${data.invoiceNumber || ''}</span>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
        <div style="width: 130px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">Payable ${m(totalDue)}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 4px 0;">Dues ${data.dueDate || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 4px 0;">Issued ${data.issueDate || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">Ref. #${data.referenceNumber || ''}</p>
        </div>
        <div style="width: 178px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">Billed to</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientPhone || ''}</p>
        </div>
        <div style="width: 178px; display: flex; gap: 8px;">
          <div style="flex: 1;">
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">From</p>
            <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.businessName || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.senderAddress || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0;"></p>
          </div>
          ${renderLogoMark(layoutState, 24, '4px')}
        </div>
      </div>
      ` : ''}

      <p style="font-size: 10px; font-weight: 700; color: ${dark}; margin: 0 0 20px 0;">${data.subject || ''}</p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="text-align: left; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted};">Item description</th>
            <th style="text-align: left; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted};">Qty</th>
            <th style="text-align: right; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted};">Rate</th>
            <th style="text-align: right; padding-bottom: 10px; font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr>
              <td style="padding: 8px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark};">${item.quantity}</td>
              <td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 8px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
        <div style="width: 220px;">
          <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 10px; font-weight: 600; color: ${muted};"><span>Subtotal</span><span style="font-weight: 500; color: ${dark};">${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 10px; font-weight: 600; color: ${muted};"><span>Tax (${taxRate}%)</span><span style="font-weight: 500; color: ${dark};">${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: baseline; padding: 8px 0; border-top: 1px solid #e5e7eb; margin-top: 6px;">
            <span style="font-size: 12px; font-weight: 700; color: ${dark};">Total <span style="font-weight: 700; color: ${muted};">(${data.currency || ''})</span></span>
            <span style="font-size: 12px; font-weight: 700; color: ${accent};">${m(totalDue)}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
        <div>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">Payment details</p>
          <p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
        <table style="border-collapse: collapse; font-size: 10px;">
          <tr><td style="padding: 2px 24px 2px 0; font-weight: 500; color: ${dark};">Bank name</td><td style="text-align: right; color: ${muted};">${data.accountDetails || ''}</td></tr>
          <tr><td style="padding: 2px 24px 2px 0; font-weight: 500; color: ${dark};">IFS code</td><td style="text-align: right; color: ${muted};"></td></tr>
          <tr><td style="padding: 2px 24px 2px 0; font-weight: 500; color: ${dark};">Swift code</td><td style="text-align: right; color: ${muted};"></td></tr>
          <tr><td style="padding: 2px 24px 2px 0; font-weight: 500; color: ${dark};">Account #</td><td style="text-align: right; color: ${muted};">3747489 2300011</td></tr>
        </table>
      </div>
      <div style="display: flex; justify-content: space-between; padding-top: 12px; border-top: 1px solid #e5e7eb;">
        <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">Thanks for the business.</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderEmail || ''} &nbsp; ${data.senderPhone || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 6 (2023) — violet accent, plain off-white page, stacked Issued/Due ──
function renderInvoice2023_06(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #f9fafc; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
        ${renderLogoMark(layoutState, 22, '4px')}
        <h1 style="font-size: 28px; font-weight: 600; color: ${dark}; margin: 0;">Invoice</h1>
      </div>
      <p style="font-size: 11px; color: ${muted}; margin: 0 0 40px 0;">#${data.invoiceNumber || ''}</p>

      <div style="display: flex; justify-content: space-between; margin-bottom: 34px;">
        <div style="width: 150px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">Issued</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 18px 0;">${data.issueDate || ''}</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">Due</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0;">${data.dueDate || ''}</p>
        </div>
        <div style="width: 150px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">Billed to</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientPhone || ''}</p>
        </div>
        <div style="width: 150px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">From</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.businessName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.senderAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;"></p>
        </div>
      </div>
      ` : ''}

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="text-align: left; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Service</th>
            <th style="text-align: left; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Qty</th>
            <th style="text-align: right; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Rate</th>
            <th style="text-align: right; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Line total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr>
              <td style="padding: 9px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 9px 0; font-size: 10px; color: ${muted};">${item.quantity}</td>
              <td style="padding: 9px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 9px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 40px;">
        <div style="width: 220px;">
          <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 10px; font-weight: 600; color: ${dark};"><span>Subtotal</span><span style="color: ${muted}; font-weight: 500;">${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 10px; font-weight: 600; color: ${dark};"><span>Tax (${taxRate}%)</span><span style="color: ${muted}; font-weight: 500;">${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 10px; font-weight: 600; color: ${dark};"><span>Total</span><span style="color: ${dark}; font-weight: 500;">${m(totalDue)}</span></div>
          <div style="display: flex; justify-content: space-between; padding: 5px 0; font-size: 10px; font-weight: 700; color: ${accent};"><span>Amount due</span><span>${m(totalDue)}</span></div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="margin-bottom: 20px;">
        <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 6px 0;">Thank you for the business!</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
      </div>
      ` : ''}
      <div style="display: flex; justify-content: space-between; padding-top: 14px; border-top: 1px solid #e2e5eb;">
        <span style="font-size: 10px; color: ${muted};">Digital Product Designer, IN</span>
        <span style="font-size: 10px; color: ${muted};">${data.senderPhone || ''}</span>
        <span style="font-size: 10px; color: ${muted};">${data.senderEmail || ''}</span>
      </div>
    </div>
  `;
}

// ── Invoice 3.1 (2023, "Full height") — indigo, meta labels spread down the full page ──
function renderInvoice2023_03_1(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
        <h1 style="font-size: 28px; font-weight: 600; color: ${dark}; margin: 0;">Invoice</h1>
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <div style="text-align: right;">
            <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Billed to</p>
            <p style="font-size: 12px; font-weight: 700; color: ${accent}; margin: 0 0 4px 0;">${data.businessName || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.4;">${data.senderAddress || ''}</p>
          </div>
          ${renderLogoMark(layoutState, 24, '4px')}
        </div>
      </div>
      ` : ''}

      <div style="display: flex; flex: 1; gap: 24px;">
        <div style="width: 124px; flex-shrink: 0; display: flex; flex-direction: column; justify-content: space-between; padding-bottom: 40px;">
          <div>
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Invoice #</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.invoiceNumber || ''}</p>
          </div>
          <div>
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Invoice date</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.issueDate || ''}</p>
          </div>
          <div>
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Reference</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.referenceNumber || ''}</p>
          </div>
          <div>
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Due date</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.dueDate || ''}</p>
          </div>
        </div>
        <div style="flex: 1;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Services</th>
                <th style="text-align: left; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Qty</th>
                <th style="text-align: right; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Rate</th>
                <th style="text-align: right; padding-bottom: 10px; font-size: 10px; font-weight: 600; color: ${dark};">Line total</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map((item) => `
                <tr>
                  <td style="padding: 8px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
                  <td style="padding: 8px 0; font-size: 10px; color: ${muted};">${item.quantity}</td>
                  <td style="padding: 8px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                  <td style="padding: 8px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          ${showSection(layoutState, 'showTotalDetails') ? `
          <div style="margin-top: 20px;">
            <div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 10px; font-weight: 500; color: ${dark};"><span>Subtotal</span><span style="color: ${muted};">${m(subtotal)}</span></div>
            ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 6px 0; font-size: 10px; font-weight: 500; color: ${dark};"><span>Tax (${taxRate}%)</span><span style="color: ${muted};">${m(taxAmount)}</span></div>` : ''}
            <div style="display: flex; justify-content: space-between; padding: 8px 0; margin-top: 40px; border-top: 1px solid #e5e7eb; font-size: 10px; font-weight: 700; color: ${accent};"><span>Total due</span><span>${m(totalDue)}</span></div>
          </div>
          ` : ''}
          ${showSection(layoutState, 'showNotes') ? `<p style="font-size: 10px; color: ${muted}; margin: 12px 0 0 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>` : ''}
        </div>
      </div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="display: flex; justify-content: space-between; padding-top: 14px; border-top: 1px solid #e5e7eb; margin-top: 16px;">
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress ? '' : ''}</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderPhone || ''}</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderEmail || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 2.1 (2023, "With Payment details") — blue, full-height tinted panel + payment details ──
function renderInvoice2023_02_1(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const panel = '#eaf4fe';
  const solid = '#3598f3';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${renderLogoMark(layoutState, 20, '4px')}
          <h1 style="font-size: 12px; font-weight: 700; color: ${accent}; margin: 0;">${data.businessName || ''}</h1>
        </div>
        <p style="font-size: 10px; color: ${muted}; margin: 0; text-align: right; line-height: 1.5;">${data.senderAddress || ''}<br/></p>
      </div>

      <div style="margin-bottom: 24px;">
        <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Billed to</p>
        <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0 0 4px 0; line-height: 1.4;">${data.clientAddress || ''}</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientPhone || ''}</p>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; padding: 10px 0; margin-bottom: 12px; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Due date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.dueDate || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Invoice date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
        </div>
        <div>
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Invoice number</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">#${data.invoiceNumber || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 10px; font-weight: 500; color: ${muted}; margin: 0 0 4px 0;">Reference</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.referenceNumber || ''}</p>
        </div>
      </div>

      <div style="display: flex; flex: 1;">
        <div style="flex: 1; padding-top: 4px;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead><tr><th style="text-align: left; padding-bottom: 8px; font-size: 10px; font-weight: 500; color: ${muted};">Item description</th></tr></thead>
            <tbody>
              ${lineItems.map((item) => `<tr><td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">${item.description}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="width: 266px; background: ${panel}; padding: 4px 20px 0 20px; display: flex; flex-direction: column;">
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr>
                <th style="text-align: left; padding: 8px 0; font-size: 10px; font-weight: 500; color: ${muted};">Qty</th>
                <th style="text-align: right; padding: 8px 0; font-size: 10px; font-weight: 500; color: ${muted};">Rate</th>
                <th style="text-align: right; padding: 8px 0; font-size: 10px; font-weight: 500; color: ${muted};">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItems.map((item) => `
                <tr>
                  <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">${String(item.quantity).padStart(2, '0')}</td>
                  <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                  <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
                </tr>
              `).join('')}
              ${showSection(layoutState, 'showTotalDetails') ? `
              <tr><td colspan="2" style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">Subtotal</td><td style="text-align: right; white-space: nowrap; font-size: 10px; font-weight: 500; color: ${dark};">${m(subtotal)}</td></tr>
              ${taxRate > 0 ? `<tr><td colspan="2" style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">Tax (${taxRate}%)</td><td style="text-align: right; white-space: nowrap; font-size: 10px; font-weight: 500; color: ${dark};">${m(taxAmount)}</td></tr>` : ''}
              <tr><td colspan="2" style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark};">Total</td><td style="text-align: right; white-space: nowrap; font-size: 10px; font-weight: 500; color: ${dark};">${m(totalDue)}</td></tr>
              ` : ''}
            </tbody>
          </table>
          ${showSection(layoutState, 'showTotalDetails') ? `
          <div style="display: flex; justify-content: space-between; align-items: center; white-space: nowrap; background: ${solid}; padding: 12px 16px; margin: 8px -20px 0 -20px;">
            <span style="font-size: 12px; font-weight: 700; color: #ffffff;">Total due</span>
            <span style="font-size: 12px; font-weight: 800; color: #ffffff;">${m(totalDue)}</span>
          </div>
          <p style="font-size: 9px; color: ${muted}; margin: 8px 0 0 0;">USD ${Math.round(totalDue).toLocaleString('en-US')} Only.</p>
          ` : ''}
          <div style="flex: 1;"></div>
          ${showSection(layoutState, 'showNotes') ? `
          <div style="margin: 16px -20px 0 -20px; padding: 12px 20px; border-top: 1px solid #d7e6f5;">
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 6px 0;">Payment details</p>
            <p style="font-size: 9px; color: ${muted}; margin: 0 0 2px 0;">${data.accountDetails || ''}</p>
            <p style="font-size: 9px; color: ${muted}; margin: 0 0 2px 0;">SWIFT: </p>
            <p style="font-size: 9px; color: ${muted}; margin: 0;">Acct. #</p>
          </div>
          ` : ''}
        </div>
      </div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="display: flex; justify-content: space-between; padding-top: 14px; margin-top: 12px; border-top: 1px solid #e5e7eb;">
        <div>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">Thank you for the business!</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
        <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderPhone || ''} &nbsp; ${data.senderEmail || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 5.1 (2023, "Digital") — rose accent, card-grid, pink-tinted dues banner ──
function renderInvoice2023_05_1(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const card = '#f2f5fa';
  const duesBand = '#faf2f5';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 16px; background: #ffffff; display: flex; flex-direction: column; gap: 12px;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; gap: 12px;">
        <div style="flex: 1; background: ${card}; padding: 16px;">
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 8px 0;">To</p>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientPhone || ''}</p>
        </div>
        <div style="flex: 1; background: ${card}; padding: 16px;">
          <div style="display: flex; align-items: center; gap: 6px; margin-bottom: 8px;">
            ${renderLogoMark(layoutState, 16, '4px')}
            <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">From</p>
          </div>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 4px 0;">${data.businessName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0; line-height: 1.4;">${data.senderAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;"></p>
        </div>
      </div>
      ` : ''}

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="background: ${duesBand}; padding: 12px 16px;">
        <span style="font-size: 14px; font-weight: 700; color: ${accent};">${m(totalDue)}</span>
        <span style="font-size: 14px; font-weight: 500; color: ${muted};"> dues on ${data.dueDate || ''}</span>
      </div>
      ` : ''}

      <div style="background: ${card}; padding: 16px; flex: 1;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr>
              <th style="text-align: left; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Service</th>
              <th style="text-align: left; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Qty</th>
              <th style="text-align: right; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Rate</th>
              <th style="text-align: right; padding-bottom: 8px; font-size: 10px; font-weight: 600; color: ${dark};">Line total</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map((item) => `
              <tr>
                <td style="padding: 10px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted};">${item.quantity}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        ${showSection(layoutState, 'showTotalDetails') ? `
        <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #dfe4ea;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${dark};"><span style="font-weight: 600;">Subtotal</span><span style="color: ${muted};">${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${dark};"><span style="font-weight: 600;">Tax (${taxRate}%)</span><span style="color: ${muted};">${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; font-weight: 700; color: ${dark};"><span>Amount due</span><span>${m(totalDue)}</span></div>
        </div>
        ` : ''}
      </div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="background: ${card}; padding: 16px;">
        <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">Thank you for the business!</p>
        <p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
      </div>
      ` : ''}

      <div style="background: ${card}; padding: 12px 16px; display: flex; justify-content: space-between;">
        <span style="font-size: 12px; font-weight: 700; color: ${accent};">${data.businessName || ''}</span>
        <span style="font-size: 12px; font-weight: 500; color: ${muted};">${data.senderPhone || ''}</span>
        <span style="font-size: 12px; font-weight: 500; color: ${muted};">${data.senderEmail || ''}</span>
      </div>
    </div>
  `;
}

// ── Invoice 7 (2023) — Archivo wordmark, ghost "Invoice" title, lime highlight behind total ──
function renderInvoice2023_07(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #f9fafc; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${renderLogoMark(layoutState, 28, '6px')}
          <div>
            <h1 style="font-family: 'Arial Black', sans-serif; font-size: 18px; font-weight: 700; color: ${dark}; margin: 0 0 6px 0;">${data.businessName || ''}</h1>
            <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderEmail || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderPhone || ''}</p>
          </div>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 36px; font-weight: 600; color: #b2b7c2; margin: 0 0 8px 0;">Invoice</h2>
          <p style="font-size: 12px; color: ${muted}; margin: 0;">#${data.invoiceNumber || ''}</p>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 32px;">
        <div>
          <p style="font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted}; margin: 0 0 4px 0;">Billed to</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.clientName || ''}</p>
        </div>
        <div style="text-align: center;">
          <p style="font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted}; margin: 0 0 4px 0;">Invoice date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
          <p style="font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted}; margin: 12px 0 4px 0;">Due date</p>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${data.dueDate || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 8px; font-weight: 600; text-transform: uppercase; color: ${muted}; margin: 0 0 8px 0;">Amount due</p>
          <div style="display: inline-block; background: #e3fa7d; padding: 6px 12px;">
            <span style="font-size: 14px; font-weight: 700; color: ${accent};">${m(totalDue)}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0 0 20px 0;">${data.subject || ''}</p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr>
            <th style="text-align: left; padding-bottom: 8px; font-size: 8px; font-weight: 600; color: ${muted};">#</th>
            <th style="text-align: left; padding-bottom: 8px; font-size: 8px; font-weight: 600; color: ${muted};">Title / Description</th>
            <th style="text-align: right; padding-bottom: 8px; font-size: 8px; font-weight: 600; color: ${muted};">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item, i) => `
            <tr>
              <td style="padding: 9px 0; font-size: 10px; color: ${dark};">${i + 1}</td>
              <td style="padding: 9px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 9px 0; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
        <div style="display: flex; justify-content: space-between; width: 220px; padding-top: 8px; border-top: 2px solid ${dark};">
          <span style="font-size: 10px; font-weight: 700; color: ${dark};">Total</span>
          <span style="font-size: 10px; font-weight: 700; color: ${dark};">${m(subtotal)}</span>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0 0 16px 0;">Thank you for the business!</p>
      <div>
        <p style="font-size: 8px; font-weight: 600; color: ${muted}; margin: 0 0 10px 0;">Payment info</p>
        <table style="width: 100%; border-collapse: collapse; font-size: 8px;">
          <tr>
            <td style="font-weight: 600; color: ${dark}; padding-bottom: 4px;">Account Name</td>
            <td style="font-weight: 500; color: ${dark}; padding-bottom: 4px;">Bank name</td>
            <td style="font-weight: 500; color: ${dark}; padding-bottom: 4px;">Swift code</td>
            <td style="font-weight: 500; color: ${dark}; padding-bottom: 4px;">Account #</td>
          </tr>
          <tr>
            <td style="color: ${muted};">${data.senderAddress ? '' : ''}</td>
            <td style="color: ${muted};">${data.accountDetails || ''}</td>
            <td style="color: ${muted};"></td>
            <td style="color: ${muted};"></td>
          </tr>
        </table>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Invoice 3 (2018 legacy) — purple accent, ghost "Invoice" wordmark, thin dividers ──
function renderInvoice2018_03(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const divider = '#bcb0c4';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 30px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          ${renderLogoMark(layoutState, 24, '999px')}
          <p style="font-size: 14px; color: ${muted}; margin: 0;">${data.senderAddress || ''}</p>
        </div>
        <h1 style="font-size: 36px; font-weight: 600; color: #b0b0c2; margin: 0;">Invoice</h1>
      </div>
      <div style="text-align: right; margin-bottom: 24px;">
        <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Billed to,</p>
        <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
        <p style="font-size: 14px; color: ${dark}; margin: 0; line-height: 1.4;">${data.clientAddress || ''}</p>
      </div>
      ` : ''}

      <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0 0 24px 0;">${data.issueDate || ''}</p>

      <div style="margin-bottom: 20px;">
        <p style="font-size: 12px; color: ${muted}; margin: 0 0 6px 0;">Subject</p>
        <p style="font-size: 16px; font-weight: 600; color: ${dark}; margin: 0;">${data.subject || ''}</p>
      </div>

      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <div>
          <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Invoice number</p>
          <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0;">#${data.invoiceNumber || ''}</p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px;">
        <thead>
          <tr>
            <th style="text-align: right; padding-bottom: 8px; font-size: 12px; font-weight: 600; color: ${muted};">Qty</th>
            <th style="text-align: left; padding: 0 0 8px 16px; font-size: 12px; font-weight: 600; color: ${muted};">Item description</th>
            <th style="text-align: right; padding-bottom: 8px; font-size: 12px; font-weight: 600; color: ${muted};">Rate</th>
            <th style="text-align: right; padding-bottom: 8px; font-size: 12px; font-weight: 600; color: ${muted};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr>
              <td style="padding: 10px 0; font-size: 12px; font-weight: 500; color: ${dark}; text-align: right;">${String(item.quantity).padStart(2, '0')}</td>
              <td style="padding: 10px 0 10px 16px; font-size: 12px; color: ${dark};">${item.description}</td>
              <td style="padding: 10px 0; font-size: 12px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 10px 0; font-size: 12px; font-weight: 500; color: ${dark}; text-align: right;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div style="height: 2px; background: ${divider}; margin-bottom: 8px;"></div>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end;">
        <div style="width: 260px;">
          <div style="height: 1px; background: ${divider}; margin: 8px 0;"></div>
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: ${muted};"><span>Sub Total</span><span style="font-weight: 700; color: ${dark};">${m(subtotal)}</span></div>
          <div style="height: 2px; background: ${divider}; margin: 8px 0;"></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 600; color: ${muted};"><span>GST(${taxRate}%)</span><span style="font-weight: 700; color: ${dark};">${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 14px;">
            <span style="font-size: 12px; font-weight: 600; color: ${dark};">Total (${data.currency || ''})</span>
            <span style="font-size: 20px; font-weight: 800; color: ${accent};">${m(totalDue)}</span>
          </div>
        </div>
      </div>
      <div style="height: 2px; background: ${divider}; margin-top: 8px;"></div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; margin-top: 24px;">
        <div>
          <p style="font-size: 14px; color: ${muted}; margin: 0 0 4px 0;">Due Date</p>
          <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0;">${data.dueDate || ''}</p>
        </div>
        ${showSection(layoutState, 'showNotes') ? `
        <div style="width: 396px;">
          <p style="font-size: 12px; font-weight: 500; color: ${muted}; margin: 0 0 8px 0;">Terms &amp; Conditions</p>
          <p style="font-size: 12px; color: ${dark}; margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
        ` : ''}
      </div>

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="margin-bottom: 20px;">
        <p style="font-size: 12px; font-weight: 500; color: ${muted}; margin: 0 0 8px 0;">Payment Details</p>
        <p style="font-size: 14px; color: ${dark}; margin: 0 0 4px 0;">${data.senderEmail ? `Paypal: ${data.senderEmail}` : ''}</p>
        <p style="font-size: 14px; color: ${dark}; margin: 0;">UPI: </p>
      </div>
      ` : ''}

      <div style="height: 1px; background: ${divider}; margin-bottom: 16px;"></div>
      <div style="display: flex; justify-content: space-between;">
        <span style="font-size: 14px; color: ${accent};">${data.senderAddress ? '' : ''}</span>
        <span style="font-size: 14px; color: ${muted};">${data.senderEmail || ''}</span>
        <span style="font-size: 14px; color: ${muted};">${data.senderPhone || ''}</span>
      </div>
    </div>
  `;
}

// ── Invoice 4 (2018 legacy) — top purple bar, TO:/FROM:/INFO: 3-column header ──
function renderInvoice2018_04(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#222234';
  const muted = '#6f6f84';
  const noteBg = '#f5f5fa';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; background: #ffffff; display: flex; flex-direction: column;">
      <div style="height: 10px; background: ${accent};"></div>
      <div style="padding: 30px; flex: 1; display: flex; flex-direction: column;">
        ${showSection(layoutState, 'showHeader') ? `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
          <h1 style="font-family: Georgia, serif; font-size: 36px; font-weight: 400; color: ${dark}; margin: 0;">Invoice</h1>
          <div style="display: flex; align-items: center; gap: 8px;">
            ${renderLogoMark(layoutState, 24, '4px')}
            <span style="font-size: 24px; font-weight: 400; color: ${dark};">${data.invoiceNumber || ''}</span>
          </div>
        </div>

        <div style="display: flex; justify-content: space-between; margin-bottom: 28px;">
          <div style="width: 146px;">
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 6px 0;">TO:</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0 0 6px 0;">${data.clientName || ''}</p>
            <p style="font-size: 12px; color: ${dark}; margin: 0; line-height: 1.4;">${data.clientAddress || ''}</p>
          </div>
          <div style="width: 260px;">
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 6px 0;">FROM:</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0 0 6px 0;">${data.businessName || ''}</p>
            <p style="font-size: 12px; color: ${dark}; margin: 0; line-height: 1.4;">${data.senderAddress || ''}</p>
          </div>
          <div style="width: 160px;">
            <p style="font-size: 14px; color: ${muted}; margin: 0 0 6px 0;">INFO:</p>
            <p style="font-size: 14px; font-weight: 600; color: ${dark}; margin: 0 0 6px 0;">Amount: ${m(totalDue)}</p>
            <p style="font-size: 14px; color: ${dark}; margin: 0 0 6px 0;">Date: ${data.issueDate || ''}</p>
            <p style="font-size: 14px; color: ${dark}; margin: 0 0 6px 0;">Ref: ${data.referenceNumber || ''}</p>
            <p style="font-size: 14px; color: ${dark}; margin: 0;">Dues: ${data.dueDate || ''}</p>
          </div>
        </div>
        ` : ''}

        <div style="margin-bottom: 20px;">
          <p style="font-size: 12px; color: ${muted}; margin: 0 0 6px 0;">Subject:</p>
          <p style="font-size: 16px; font-weight: 600; color: ${dark}; margin: 0;">${data.subject || ''}</p>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 4px;">
          <thead>
            <tr>
              <th style="text-align: left; padding-bottom: 8px; font-size: 12px; font-weight: 500; color: ${muted};">Item description</th>
              <th style="text-align: right; padding-bottom: 8px; font-size: 12px; font-weight: 500; color: ${muted};">Qty</th>
              <th style="text-align: right; padding-bottom: 8px; font-size: 12px; font-weight: 500; color: ${muted};">Rate</th>
              <th style="text-align: right; padding-bottom: 8px; font-size: 12px; font-weight: 500; color: ${muted};">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map((item) => `
              <tr>
                <td style="padding: 8px 0; font-size: 12px; color: ${dark};">${item.description}</td>
                <td style="padding: 8px 0; font-size: 12px; font-weight: 600; color: ${dark}; text-align: right;">${String(item.quantity).padStart(2, '0')}</td>
                <td style="padding: 8px 0; font-size: 12px; font-weight: 600; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
                <td style="padding: 8px 0; font-size: 12px; font-weight: 600; color: ${dark}; text-align: right;">${m(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${showSection(layoutState, 'showTotalDetails') ? `
        <div style="height: 2px; background: ${muted}; margin-bottom: 10px;"></div>
        <div style="display: flex; justify-content: flex-end;">
          <div style="width: 260px;">
            <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; color: ${muted};"><span>Sub Total</span><span style="font-weight: 700; color: ${dark};">${m(subtotal)}</span></div>
            <div style="height: 1px; background: ${muted}; margin: 10px 0;"></div>
            ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 500; color: ${muted};"><span>GST(${taxRate}%)</span><span style="font-weight: 700; color: ${dark};">${m(taxAmount)}</span></div>` : ''}
            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 20px;">
              <span style="font-size: 12px; font-weight: 600; color: ${dark};">Total (${data.currency || ''})</span>
              <span style="font-size: 20px; font-weight: 800; color: ${accent};">${m(totalDue)}</span>
            </div>
          </div>
        </div>
        ` : ''}

        <div style="flex: 1;"></div>

        ${showSection(layoutState, 'showNotes') ? `
        <div style="background: ${noteBg}; padding: 14px 18px; margin-bottom: 16px;">
          <p style="font-size: 12px; font-weight: 500; color: ${muted}; margin: 0 0 6px 0;">Note</p>
          <p style="font-size: 16px; font-weight: 600; color: ${dark}; margin: 0;">Thanks for the business.</p>
        </div>
        <div style="display: flex; justify-content: space-between; padding-bottom: 16px; border-bottom: 1px solid #d8d0dc;">
          <p style="font-size: 12px; font-weight: 500; color: ${muted}; margin: 0;">Payment Details</p>
          <p style="font-size: 12px; color: ${dark}; margin: 0;">${data.senderEmail ? `Paypal: ${data.senderEmail}` : ''} &nbsp; UPI: </p>
        </div>
        ` : ''}
        <div style="display: flex; justify-content: space-between; margin-top: 16px;">
          <span style="font-size: 14px; color: ${muted};">${data.senderAddress ? '' : ''}</span>
          <span style="font-size: 14px; color: ${muted};">${data.senderEmail || ''}</span>
          <span style="font-size: 14px; color: ${muted};">${data.senderPhone || ''}</span>
        </div>
      </div>
    </div>
  `;
}

// ── Quotation 1 (Modern) — Emerald accent, Quote #, Valid Until, Acceptance signature ──
function renderQuotationModern(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1c21';
  const muted = '#5e6470';
  const band = '#f0fdf4';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 36px;">
        <div style="display: flex; align-items: flex-start; gap: 10px;">
          ${renderLogoMark(layoutState, 32, '6px')}
          <div>
            <h1 style="font-size: 18px; font-weight: 700; color: ${accent}; margin: 0 0 4px 0;">${data.businessName || ''}</h1>
            <p style="font-size: 10px; color: ${muted}; margin: 2px 0;">${data.senderAddress || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 2px 0;">${data.senderEmail || ''} &bull; ${data.senderPhone || ''}</p>
          </div>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 24px; font-weight: 800; color: ${dark}; margin: 0 0 6px 0; tracking-tight">QUOTATION</h2>
          <p style="font-size: 10px; font-weight: 600; color: ${accent}; margin: 0 0 2px 0;">#${data.invoiceNumber || data.quoteNumber || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">Date: ${data.issueDate || ''}</p>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; background: ${band}; padding: 16px 20px; border-radius: 8px; margin-bottom: 28px;">
        <div>
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${accent}; margin: 0 0 4px 0;">Prepared For</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientAddress || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${accent}; margin: 0 0 4px 0;">Quote Validity</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">Valid Until: ${data.dueDate || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">Ref: ${data.referenceNumber || ''}</p>
        </div>
      </div>

      <div style="margin-bottom: 20px;">
        <p style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: ${muted}; margin: 0 0 4px 0;">Subject / Project Scope</p>
        <p style="font-size: 12px; font-weight: 600; color: ${dark}; margin: 0;">${data.subject || ''}</p>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid ${accent};">
            <th style="text-align: left; padding: 8px 0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${dark};">Item &amp; Description</th>
            <th style="text-align: center; padding: 8px 0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${dark};">Qty</th>
            <th style="text-align: right; padding: 8px 0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${dark};">Rate</th>
            <th style="text-align: right; padding: 8px 0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${dark};">Estimated Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr style="border-bottom: 1px solid #e5e7eb;">
              <td style="padding: 10px 0;">
                <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">${item.description}</p>
              </td>
              <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px 0; font-size: 10px; font-weight: 500; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 10px 0; font-size: 10px; font-weight: 600; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
        <div style="width: 230px; background: #fafafa; padding: 14px 16px; border-radius: 8px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; font-weight: 500; color: ${dark};">
            <span>Subtotal</span><span>${m(subtotal)}</span>
          </div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; font-weight: 500; color: ${dark};"><span>Estimated Tax (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 0 0 0; font-size: 12px; font-weight: 800; color: ${accent}; border-top: 1px solid #e5e7eb; margin-top: 6px;">
            <span>Total Estimate</span><span>${m(totalDue)}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; display: flex; justify-content: space-between; gap: 24px;">
        <div style="flex: 1;">
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${muted}; margin: 0 0 4px 0;">Terms &amp; Conditions</p>
          <p style="font-size: 9px; color: ${muted}; margin: 0; line-height: 1.5;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
        <div style="width: 180px; text-align: center;">
          <div style="border-bottom: 1px solid ${dark}; height: 32px; margin-bottom: 4px;"></div>
          <p style="font-size: 9px; font-weight: 600; color: ${dark}; margin: 0;">Client Acceptance Signature</p>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Quotation 2 (Executive) — Corporate Slate/Navy theme ──
function renderQuotationExecutive(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#0f172a';
  const muted = '#64748b';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="border-bottom: 2px solid ${accent}; padding-bottom: 20px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h1 style="font-size: 22px; font-weight: 800; color: ${accent}; margin: 0 0 4px 0;">${data.businessName || ''}</h1>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress || ''} &bull; ${data.senderEmail || ''}</p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 20px; font-weight: 700; color: ${dark}; margin: 0 0 4px 0;">PRICE QUOTATION</h2>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 0;">Ref: #${data.invoiceNumber || data.quoteNumber || ''}</p>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
        <div style="width: 48%;">
          <p style="font-size: 9px; font-weight: 700; color: ${muted}; text-transform: uppercase; margin: 0 0 4px 0;">Client Information</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientAddress || ''}</p>
        </div>
        <div style="width: 48%; text-align: right;">
          <p style="font-size: 9px; font-weight: 700; color: ${muted}; text-transform: uppercase; margin: 0 0 4px 0;">Quotation Details</p>
          <p style="font-size: 10px; color: ${dark}; margin: 2px 0;"><strong>Issue Date:</strong> ${data.issueDate || ''}</p>
          <p style="font-size: 10px; color: ${dark}; margin: 2px 0;"><strong>Expiry Date:</strong> ${data.dueDate || ''}</p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
            <th style="text-align: left; padding: 10px; font-size: 9px; font-weight: 700; color: ${dark};">Service / Product Description</th>
            <th style="text-align: center; padding: 10px; font-size: 9px; font-weight: 700; color: ${dark};">Qty</th>
            <th style="text-align: right; padding: 10px; font-size: 9px; font-weight: 700; color: ${dark};">Unit Cost</th>
            <th style="text-align: right; padding: 10px; font-size: 9px; font-weight: 700; color: ${dark};">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 10px; font-size: 10px; color: ${dark}; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px; font-size: 10px; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 10px; font-size: 10px; font-weight: 700; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
        <div style="width: 220px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${muted};"><span>Subtotal</span><span>${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${muted};"><span>Tax (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: ${accent}; color: #ffffff; border-radius: 4px; font-size: 11px; font-weight: 800; margin-top: 8px;">
            <span>Estimated Total</span><span>${m(totalDue)}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="background: #f8fafc; padding: 14px; border-radius: 6px; font-size: 9px; color: ${muted}; line-height: 1.5;">
        <p style="font-weight: 700; color: ${dark}; margin: 0 0 4px 0;">Notes &amp; Validity:</p>
        <p style="margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Proposal 1 (Corporate) — Rose/Indigo theme, Project Scope & Investment ──
function renderProposalCorporate(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1e1b4b';
  const muted = '#475569';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 36px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
        <div>
          <span style="font-size: 9px; font-weight: 800; tracking-wider; text-transform: uppercase; color: ${accent}; background: #ffe4e6; padding: 4px 10px; border-radius: 999px;">PROJECT PROPOSAL</span>
          <h1 style="font-size: 18px; font-weight: 800; color: ${dark}; margin: 10px 0 4px 0; line-height: 1.25;">${data.subject || ''}</h1>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">Proposal ID: #${data.invoiceNumber || data.proposalId || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 11px; font-weight: 700; color: ${accent}; margin: 0 0 2px 0;">${data.businessName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderEmail || ''}</p>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 14px 0; margin-bottom: 24px;">
        <div>
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${muted}; margin: 0 0 2px 0;">Prepared For</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.clientName || ''}</p>
        </div>
        <div>
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${muted}; margin: 0 0 2px 0;">Prepared By</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.businessName || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${muted}; margin: 0 0 2px 0;">Proposal Date</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
        </div>
      </div>

      <div style="margin-bottom: 24px; background: #faf5ff; padding: 14px 18px; border-left: 3px solid ${accent}; border-radius: 4px;">
        <p style="font-size: 9px; font-weight: 800; text-transform: uppercase; color: ${accent}; margin: 0 0 4px 0;">Executive Summary &amp; Overview</p>
        <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.5;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
      </div>

      <p style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: ${dark}; margin: 0 0 8px 0;">Scope of Deliverables &amp; Pricing</p>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f1f5f9;">
            <th style="text-align: left; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Deliverable / Task</th>
            <th style="text-align: center; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Qty</th>
            <th style="text-align: right; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Rate</th>
            <th style="text-align: right; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Investment</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 10px; font-size: 10px; color: ${muted}; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px; font-size: 10px; color: ${muted}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 10px; font-size: 10px; font-weight: 700; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 30px;">
        <div style="width: 230px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${muted};"><span>Subtotal Investment</span><span>${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${muted};"><span>Tax (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 0; border-top: 2px solid ${dark}; margin-top: 6px; font-size: 12px; font-weight: 800; color: ${accent};">
            <span>Total Investment</span><span>${m(totalDue)}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between;">
        <div style="width: 200px;">
          <div style="border-bottom: 1px solid ${dark}; height: 28px; margin-bottom: 4px;"></div>
          <p style="font-size: 9px; font-weight: 700; color: ${dark}; margin: 0;">Authorized Provider Signature</p>
        </div>
        <div style="width: 200px;">
          <div style="border-bottom: 1px solid ${dark}; height: 28px; margin-bottom: 4px;"></div>
          <p style="font-size: 9px; font-weight: 700; color: ${dark}; margin: 0;">Client Approval Signature</p>
        </div>
      </div>
    </div>
  `;
}

// ── Proposal 2 (Modern) — Clean layout with project milestones ──
function renderProposalModern(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#0f172a';
  const muted = '#64748b';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="background: ${accent}; color: #ffffff; padding: 24px; border-radius: 12px; margin-bottom: 28px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h1 style="font-size: 18px; font-weight: 800; margin: 0 0 4px 0; color: #ffffff;">${data.subject || ''}</h1>
          <p style="font-size: 10px; opacity: 0.9; margin: 0;">Presented by ${data.businessName || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 12px; font-weight: 800; margin: 0; color: #ffffff;">${m(totalDue)}</p>
          <p style="font-size: 9px; opacity: 0.8; margin: 0;">Total Proposal Cost</p>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
        <div>
          <p style="font-size: 9px; font-weight: 700; color: ${muted}; text-transform: uppercase; margin: 0 0 4px 0;">Client</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.clientName || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 9px; font-weight: 700; color: ${muted}; text-transform: uppercase; margin: 0 0 4px 0;">Date</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid #e2e8f0;">
            <th style="text-align: left; padding: 8px 0; font-size: 9px; font-weight: 700; color: ${dark};">Deliverable / Milestone</th>
            <th style="text-align: center; padding: 8px 0; font-size: 9px; font-weight: 700; color: ${dark};">Qty</th>
            <th style="text-align: right; padding: 8px 0; font-size: 9px; font-weight: 700; color: ${dark};">Rate</th>
            <th style="text-align: right; padding: 8px 0; font-size: 9px; font-weight: 700; color: ${dark};">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 10px 0; font-size: 10px; color: ${dark}; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px 0; font-size: 10px; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 10px 0; font-size: 10px; font-weight: 700; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 24px;">
        <div style="width: 200px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; padding: 3px 0;"><span>Subtotal</span><span>${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; padding: 3px 0;"><span>Tax (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; color: ${accent}; padding-top: 6px; border-top: 1px solid #e2e8f0; margin-top: 4px;"><span>Total</span><span>${m(totalDue)}</span></div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 9px; color: ${muted}; line-height: 1.4;">
        <p style="font-weight: 600; color: ${dark}; margin: 0 0 2px 0;">Terms of Agreement</p>
        <p style="margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Receipt (Grid Bordered / Figma Design) — Warm off-white, SETTLED ON, PAID BY, PAID TO, PAYMENT METHOD, BILL TOTAL banner, PAYMENT ACKNOWLEDGEMENT ──
const renderReceiptGridBordered: (data: InvoiceData, _accent: string, _layoutState?: LayoutState | null) => string = (data) => {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1a1a';
  const muted = '#555555';
  const borderCol = '#2d2d2d';
  const items = lineItems.length > 0 ? lineItems : [];

  const numStr = String(data.invoiceNumber || data.receiptNumber || '');
  const rawNum = numStr;
  const digits = [rawNum];

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 20px; background: #f7f6f0; display: flex; flex-direction: column;">
      <div style="border: 2px solid ${borderCol}; display: flex; flex: 1; min-height: 798px;">

        <!-- LEFT COLUMN -->
        <div style="width: 215px; border-right: 2px solid ${borderCol}; display: flex; flex-direction: column;">

          <!-- Header: RECEIPT -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 14px 12px;">
            <h1 style="font-size: 34px; font-weight: 900; letter-spacing: -0.5px; color: ${dark}; margin: 0; text-transform: uppercase;">RECEIPT</h1>
          </div>

          <!-- SETTLED ON -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">SETTLED ON</p>
            <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.issueDate || data.paymentDate || ''}</p>
          </div>

          <!-- PAID BY -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">PAID BY</p>
            <p style="font-size: 10px; font-weight: 800; color: ${dark}; margin: 0;">${data.clientName || ''}</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 1px 0 2px 0;">Entity Name</p>
            <p style="font-size: 8.5px; color: ${dark}; text-decoration: underline; margin: 0 0 3px 0;">website.com</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 0; line-height: 1.3; white-space: pre-wrap;">${data.clientAddress || ''}</p>
            <p style="font-size: 8.5px; color: ${dark}; margin: 4px 0 0 0;">${data.clientEmail || ''}</p>
          </div>

          <!-- PAID TO -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">PAID TO</p>
            <p style="font-size: 10px; font-weight: 800; color: ${dark}; margin: 0;">${data.businessName || ''}</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 1px 0 3px 0;">Entity Name</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 0; line-height: 1.3; white-space: pre-wrap;">${data.senderAddress || ''}</p>
            <p style="font-size: 8.5px; color: ${dark}; margin: 4px 0 0 0;">${data.senderEmail || ''}</p>
          </div>

          <!-- PAYMENT METHOD USED -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 6px 0; text-transform: uppercase;">PAYMENT METHOD USED</p>
            <p style="font-size: 9.5px; font-weight: 800; color: ${dark}; margin: 0 0 2px 0;">${data.paymentMethod || ''}</p>





            <p style="font-size: 9.5px; font-weight: 800; color: ${dark}; margin: 0 0 2px 0;"></p>



          </div>

          <!-- GOT ANY QUESTIONS? -->
          <div style="padding: 10px 12px; flex: 1;">
            <p style="font-size: 10px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0; text-transform: uppercase;">GOT ANY QUESTIONS?</p>
            <p style="font-size: 8px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">CONTACT DETAILS</p>
            <p style="font-size: 9px; font-weight: 700; color: ${dark}; margin: 0;">FIRST LAST</p>
            <p style="font-size: 8px; color: ${muted}; margin: 1px 0;">Entity Name</p>
            <p style="font-size: 8px; color: ${dark}; text-decoration: underline; margin: 1px 0;">website.com</p>
            <p style="font-size: 8px; color: ${dark}; margin: 1px 0;">you@gmail.com</p>
            <p style="font-size: 8px; color: ${dark}; margin: 1px 0 6px 0;">+1 98765 43210</p>
            <div style="display: flex; gap: 8px; font-size: 10px; color: ${dark};">
              <span>📷</span> <span>𝕏</span> <span>in</span>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div style="flex: 1; display: flex; flex-direction: column;">

          <!-- Top Row: BILL TO & INVOICE NUMBER -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${borderCol}; padding: 12px 14px;">
            <div>
              <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">BILL TO</p>
              <p style="font-size: 13px; font-weight: 800; color: ${dark}; margin: 0;">${data.clientName || ''}</p>
            </div>
            <div style="text-align: right;">
              <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">INVOICE NUMBER</p>
              <div style="display: flex; gap: 2px; justify-content: flex-end;">
                ${digits.map((d: string) => `<span style="width: 14px; height: 16px; border: 1px solid ${borderCol}; background: #ffffff; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;">${d}</span>`).join('')}
              </div>
            </div>
          </div>

          <!-- PROJECT DESCRIPTION -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 12px 14px;">
            <p style="font-size: 10.5px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0; text-transform: uppercase;">PROJECT DESCRIPTION</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 0; line-height: 1.4;">${formatMarkdownHTML(data.notesAndTerms || '') || data.subject || ''}</p>
          </div>

          <!-- DESCRIPTION OF ITEMS TABLE -->
          <div style="flex: 1; display: flex; flex-direction: column;">
            <table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid ${borderCol};">
              <thead>
                <tr style="background: #dcdbd6; border-bottom: 2px solid ${borderCol};">
                  <th style="text-align: left; padding: 8px 10px; font-size: 9.5px; font-weight: 800; color: ${dark}; border-right: 2px solid ${borderCol}; uppercase;">DESCRIPTION OF ITEMS</th>
                  <th style="text-align: center; padding: 8px 6px; font-size: 9.5px; font-weight: 800; color: ${dark}; width: 45px; border-right: 2px solid ${borderCol}; uppercase;">QTY.</th>
                  <th style="text-align: right; padding: 8px 10px; font-size: 9.5px; font-weight: 800; color: ${dark}; width: 95px; uppercase;">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, idx) => `
                  <tr style="border-bottom: 1px solid ${borderCol};">
                    <td style="padding: 8px 10px; border-right: 2px solid ${borderCol};">
                      <p style="font-size: 9.5px; font-weight: 700; color: ${dark}; margin: 0;">${item.description}</p>
                      ${idx === 2 ? `<p style="font-size: 8px; color: ${muted}; margin: 2px 0 0 8px;">• extra details</p>` : ''}
                      ${idx === 4 ? `<p style="font-size: 8px; color: ${muted}; margin: 2px 0 0 8px;">• extra details<br/>• breakup details<br/>• tax included details</p>` : ''}
                    </td>
                    <td style="padding: 8px 6px; text-align: center; font-size: 9.5px; font-weight: 700; color: ${dark}; border-right: 2px solid ${borderCol};">
                      ${String(item.quantity).padStart(2, '0')}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; white-space: nowrap; font-size: 9.5px; font-weight: 700; color: ${dark};">
                      ${m(item.total)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <!-- Spacer (clean open area without stamp) -->
            <div style="flex: 1; min-height: 80px;"></div>

            <!-- SUBTOTAL -->
            <div style="border-top: 2px solid ${borderCol}; border-bottom: 1px solid ${borderCol}; padding: 7px 12px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; font-weight: 800; color: ${dark}; text-transform: uppercase;">SUBTOTAL</span>
              <span style="font-size: 10px; font-weight: 800; color: ${dark};">${m(subtotal)}</span>
            </div>

            <!-- GST AND TAXES -->
            <div style="border-bottom: 2px solid ${borderCol}; padding: 7px 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 9px; font-weight: 800; color: ${dark}; text-transform: uppercase;">GST AND TAXES</span>
                <span style="font-size: 8px; color: ${muted}; margin-left: 6px;">• ${taxRate}% of Subtotal</span>
              </div>
              <span style="font-size: 10px; font-weight: 800; color: ${dark};">${m(taxAmount)}</span>
            </div>

            <!-- BILL TOTAL BANNER -->
            <div style="background: ${dark}; color: #ffffff; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">BILL TOTAL</span>
              <span style="font-size: ${autoFontSize(m(totalDue), 14)}px; font-weight: 900; white-space: nowrap;">${m(totalDue)}</span>
            </div>

            <!-- PAYMENT INSTRUCTIONS -->
            <div style="padding: 10px 12px;">
              <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">PAYMENT INSTRUCTIONS</p>
              <p style="font-size: 8px; color: ${muted}; margin: 0; line-height: 1.35;">Please ensure the payment is made within the due date to avoid any late fees. Payment is considered as received only after it has been credited to our account. The bill total has been rounded off to the nearest whole number.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
};

// ── Receipt 1 (Official) — Payment receipt with prominent "PAID IN FULL" status badge ──
function renderReceiptOfficial(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#064e3b';
  const muted = '#475569';
  const greenBadge = '#10b981';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 36px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px;">
        <div>
          <div style="display: inline-block; background: #ecfdf5; border: 1px solid #a7f3d0; color: ${greenBadge}; font-size: 10px; font-weight: 800; padding: 4px 12px; border-radius: 999px; tracking-wider; text-transform: uppercase; margin-bottom: 8px;">
            &check; PAID IN FULL
          </div>
          <h1 style="font-size: 24px; font-weight: 800; color: ${dark}; margin: 0;">PAYMENT RECEIPT</h1>
          <p style="font-size: 10px; font-weight: 600; color: ${muted}; margin: 2px 0 0 0;">Receipt #${data.invoiceNumber || data.receiptNumber || ''}</p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 16px; font-weight: 700; color: ${accent}; margin: 0 0 4px 0;">${data.businessName || ''}</h2>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 2px 0 0 0;">${data.senderEmail || ''}</p>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; background: #f8fafc; padding: 16px 20px; border-radius: 8px; margin-bottom: 24px;">
        <div>
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${muted}; margin: 0 0 4px 0;">Received From</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientAddress || ''}</p>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${muted}; margin: 0 0 4px 0;">Payment Details</p>
          <p style="font-size: 10px; color: ${dark}; margin: 2px 0;"><strong>Date Paid:</strong> ${data.issueDate || ''}</p>
          <p style="font-size: 10px; color: ${dark}; margin: 2px 0;"><strong>Payment Method:</strong> ${data.paymentMethod || ''}</p>
          <p style="font-size: 10px; color: ${dark}; margin: 2px 0;"><strong>Ref #:</strong> ${data.referenceNumber || ''}</p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="border-bottom: 2px solid ${greenBadge};">
            <th style="text-align: left; padding: 8px 0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${dark};">Description of Paid Items / Services</th>
            <th style="text-align: center; padding: 8px 0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${dark};">Qty</th>
            <th style="text-align: right; padding: 8px 0; font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${dark};">Amount Paid</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr style="border-bottom: 1px solid #e2e8f0;">
              <td style="padding: 10px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 10px 0; font-size: 10px; color: ${muted}; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px 0; font-size: 10px; font-weight: 700; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 32px;">
        <div style="width: 230px; background: #ecfdf5; padding: 14px 16px; border-radius: 8px; border: 1px solid #a7f3d0;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; padding: 3px 0;"><span>Subtotal</span><span>${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; padding: 3px 0;"><span>Tax Included (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; color: ${greenBadge}; padding-top: 6px; border-top: 1px solid #a7f3d0; margin-top: 4px;">
            <span>Total Received</span><span>${m(totalDue)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 10px; font-weight: 700; color: ${dark}; margin-top: 4px;">
            <span>Balance Due</span><span>$0.00</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <p style="font-size: 10px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">Thank you for your business!</p>
          <p style="font-size: 9px; color: ${muted}; margin: 0;">This is an official receipt of payment received.</p>
        </div>
        <div style="width: 160px; text-align: center;">
          <div style="border-bottom: 1px solid ${dark}; height: 28px; margin-bottom: 4px;"></div>
          <p style="font-size: 9px; font-weight: 600; color: ${dark}; margin: 0;">Authorized Signature</p>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Receipt 2 (Compact Slip) — Modern compact receipt format ──
const renderReceiptCompact: (data: InvoiceData, accent: string, _layoutState?: LayoutState | null) => string = (data, accent) => {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1e1b4b';
  const muted = '#64748b';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 36px; background: #f8fafc; display: flex; flex-direction: column;">
      <div style="max-width: 480px; margin: 0 auto; background: #ffffff; padding: 28px; border-radius: 12px; shadow: 0 4px 12px rgba(0,0,0,0.05); width: 100%;">
        <div style="text-align: center; border-bottom: 2px dashed #cbd5e1; padding-bottom: 16px; margin-bottom: 20px;">
          <h1 style="font-size: 18px; font-weight: 800; color: ${accent}; margin: 0 0 4px 0;">${data.businessName || ''}</h1>
          <p style="font-size: 10px; color: ${muted}; margin: 0 0 8px 0;">${data.senderAddress || ''}</p>
          <span style="display: inline-block; background: #dcfce7; color: #166534; font-size: 9px; font-weight: 800; padding: 2px 8px; border-radius: 4px;">PAID RECEIPT</span>
        </div>

        <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; margin-bottom: 16px;">
          <div>
            <p style="margin: 2px 0;"><strong>Receipt #:</strong> ${data.invoiceNumber || ''}</p>
            <p style="margin: 2px 0;"><strong>Customer:</strong> ${data.clientName || ''}</p>
          </div>
          <div style="text-align: right;">
            <p style="margin: 2px 0;"><strong>Date:</strong> ${data.issueDate || ''}</p>
            <p style="margin: 2px 0;"><strong>Method:</strong> ${data.paymentMethod || ''}</p>
          </div>
        </div>

        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 10px;">
          <thead>
            <tr style="border-bottom: 1px solid #e2e8f0; color: ${muted};">
              <th style="text-align: left; padding: 6px 0;">Item</th>
              <th style="text-align: center; padding: 6px 0;">Qty</th>
              <th style="text-align: right; padding: 6px 0;">Price</th>
            </tr>
          </thead>
          <tbody>
            ${lineItems.map((item) => `
              <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 8px 0; font-weight: 600;">${item.description}</td>
                <td style="padding: 8px 0; text-align: center;">${item.quantity}</td>
                <td style="padding: 8px 0; text-align: right; font-weight: 700;">${m(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="border-top: 2px dashed #cbd5e1; padding-top: 12px; font-size: 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: ${muted};"><span>Subtotal</span><span>${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; margin-bottom: 4px; color: ${muted};"><span>Tax</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 14px; font-weight: 800; color: ${accent}; margin-top: 8px; padding-top: 8px; border-top: 1px solid #e2e8f0;">
            <span>TOTAL PAID</span><span>${m(totalDue)}</span>
          </div>
        </div>

        <p style="text-align: center; font-size: 9px; color: ${muted}; margin: 20px 0 0 0;">Thank you for shopping with us!</p>
      </div>
    </div>
  `;
};

// ── Purchase Receipt (E-Commerce UI Design) — Blue top hero banner, barcode graphic, customer details, item card with thumbnail, summation, Download action button ──
const renderReceiptPurchaseUI: (data: InvoiceData, accentOverride: string, _layoutState?: LayoutState | null) => string = (data, accentOverride) => {
  const { lineItems, subtotal, taxAmount } = computeTotals(data);


  const dark = '#0f172a';
  const muted = '#64748b';
  const labelMuted = '#94a3b8';
  const blueAccent = accentOverride || '#1d61d1';
  const items = lineItems.length > 0 ? lineItems : [];

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 40px 48px; background: #ffffff; display: flex; flex-direction: column;">

      <!-- Top Title -->
      <h1 style="font-size: 24px; font-weight: 800; color: ${dark}; text-align: center; margin: 0 0 20px 0; letter-spacing: -0.5px;">Receipt</h1>

      <!-- Top Hero Blue Banner Box -->
      <div style="background: ${blueAccent}; color: #ffffff; border-radius: 10px; padding: 20px 24px; text-align: center; margin-bottom: 24px;">
        <p style="font-size: 13px; font-weight: 600; margin: 0 0 14px 0; line-height: 1.45;">Thank you for your purchase! You will receive a confirmation once your order is shipped.</p>
        <!-- Barcode pattern -->
        <div style="display: flex; justify-content: center; align-items: center; gap: 3px; height: 32px;">
          <div style="width: 3px; height: 32px; background: #ffffff;"></div>
          <div style="width: 1px; height: 32px; background: #ffffff;"></div>
          <div style="width: 4px; height: 32px; background: #ffffff;"></div>
          <div style="width: 2px; height: 32px; background: #ffffff;"></div>
          <div style="width: 5px; height: 32px; background: #ffffff;"></div>
          <div style="width: 1px; height: 32px; background: #ffffff;"></div>
          <div style="width: 3px; height: 32px; background: #ffffff;"></div>
          <div style="width: 2px; height: 32px; background: #ffffff;"></div>
          <div style="width: 4px; height: 32px; background: #ffffff;"></div>
          <div style="width: 1px; height: 32px; background: #ffffff;"></div>
          <div style="width: 3px; height: 32px; background: #ffffff;"></div>
          <div style="width: 5px; height: 32px; background: #ffffff;"></div>
          <div style="width: 2px; height: 32px; background: #ffffff;"></div>
          <div style="width: 4px; height: 32px; background: #ffffff;"></div>
          <div style="width: 1px; height: 32px; background: #ffffff;"></div>
          <div style="width: 3px; height: 32px; background: #ffffff;"></div>
        </div>
      </div>

      <!-- Business Details -->
      <div style="margin-bottom: 16px;">
        <p style="font-size: 14px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">${data.businessName || ''}</p>
        <p style="font-size: 11px; color: ${muted}; margin: 2px 0;">${data.senderPhone || ''}</p>
        <p style="font-size: 11px; color: ${muted}; margin: 2px 0;">${data.senderEmail || ''}</p>
        <p style="font-size: 11px; color: ${muted}; margin: 2px 0;">${data.senderAddress || ''}</p>
        <p style="font-size: 11px; color: ${dark}; margin: 2px 0; font-weight: 600;">${data.businessWebsite || ''}</p>
      </div>

      <!-- Separator -->
      <div style="border-bottom: 1px dotted #cbd5e1; margin-bottom: 20px;"></div>

      <!-- Customer Details -->
      <div style="margin-bottom: 16px;">
        <p style="font-size: 14px; font-weight: 800; color: ${dark}; margin: 0 0 12px 0;">Customer Details</p>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 8px;">
          <span style="color: ${labelMuted};">Customer Name</span>
          <span style="font-weight: 700; color: ${dark};">${data.clientName || ''}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 8px;">
          <span style="color: ${labelMuted};">Customer Number</span>
          <span style="font-weight: 700; color: ${dark};">${data.clientPhone || ''}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 4px;">
          <span style="color: ${labelMuted};">Tracking ID</span>
          <span style="font-weight: 700; color: ${dark};">${data.trackingId || data.referenceNumber || ''}</span>
        </div>
      </div>

      <!-- Separator -->
      <div style="border-bottom: 1px dotted #cbd5e1; margin-bottom: 20px;"></div>

      <!-- Item Details -->
      <div style="margin-bottom: 16px;">
        <p style="font-size: 14px; font-weight: 800; color: ${dark}; margin: 0 0 14px 0;">Item Details</p>

        ${items.map((item) => `
          <div style="display: flex; gap: 16px; align-items: flex-start; margin-bottom: 12px;">
            <!-- Product Image Graphic -->
            <div style="width: 110px; height: 74px; background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); border-radius: 8px; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; box-shadow: 0 2px 6px rgba(0,0,0,0.12);">
              <svg width="60" height="40" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="2" y="4" width="56" height="28" rx="3" stroke="#64748b" stroke-width="2"/>
                <path d="M20 36L30 32L40 36" stroke="#64748b" stroke-width="2" stroke-linecap="round"/>
                <path d="M12 24C20 16 35 12 48 20" stroke="${blueAccent}" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </div>
            <!-- Item Information -->
            <div style="flex: 1;">
              <p style="font-size: 13px; font-weight: 800; color: ${dark}; margin: 0 0 6px 0; line-height: 1.35;">${item.description}</p>
              <p style="font-size: 11px; color: ${labelMuted}; margin: 2px 0;">QTY: ${item.quantity}</p>
              <p style="font-size: 11px; color: ${labelMuted}; margin: 2px 0;">Purchase Date: ${data.issueDate || ''}</p>
              <p style="font-size: 11px; color: ${labelMuted}; margin: 2px 0;">Estimated Delivery: ${data.dueDate || ''}</p>
            </div>
          </div>
        `).join('')}
      </div>

      <!-- Separator -->
      <div style="border-bottom: 1px dotted #cbd5e1; margin-bottom: 20px;"></div>

      <!-- Summation -->
      <div style="margin-bottom: 24px;">
        <p style="font-size: 14px; font-weight: 800; color: ${dark}; margin: 0 0 12px 0;">Summation</p>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 8px;">
          <span style="color: ${labelMuted};">Sub Total</span>
          <span style="font-weight: 700; color: ${dark};">${formatDocumentMoney(subtotal,data)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px; margin-bottom: 16px;">
          <span style="color: ${labelMuted};">Discount</span>
          <span style="font-weight: 700; color: ${dark};">${(taxAmount ?? 0).toFixed(2)}</span>
        </div>

        <!-- Download Action Button -->
        <div style="display: flex; justify-content: center; margin-bottom: 16px;">
          <div style="background: ${blueAccent}; color: #ffffff; font-size: 13px; font-weight: 800; padding: 10px 48px; border-radius: 8px; display: inline-flex; align-items: center; gap: 8px;">
            <span>Download PDF</span>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </div>
        </div>

        <p style="font-size: 11px; color: ${muted}; text-align: center; margin: 0;">Have any concerns? Send us an email via <span style="text-decoration: underline; font-weight: 700; color: ${dark};">${data.senderEmail || ''}</span></p>
      </div>

    </div>
  `;
};

// ── Purchase Order 1 (Standard) — Cyan/Blue header with Vendor & Ship To blocks ──
function renderPurchaseOrderStandard(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#0c4a6e';
  const muted = '#475569';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px;">
        <div>
          <h1 style="font-size: 24px; font-weight: 800; color: ${accent}; margin: 0 0 4px 0;">PURCHASE ORDER</h1>
          <p style="font-size: 10px; font-weight: 700; color: ${dark}; margin: 0;">P.O. Number: #${data.invoiceNumber || data.poNumber || ''}</p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 14px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.businessName || ''}</h2>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 2px 0 0 0;">${data.senderEmail || ''}</p>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; margin-bottom: 24px; gap: 16px;">
        <div style="flex: 1; background: #f0f9ff; padding: 14px; border-radius: 6px; border: 1px solid #bae6fd;">
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${accent}; margin: 0 0 4px 0;">Vendor / Supplier</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientAddress || ''}</p>
        </div>
        <div style="flex: 1; background: #f0f9ff; padding: 14px; border-radius: 6px; border: 1px solid #bae6fd;">
          <p style="font-size: 9px; font-weight: 700; text-transform: uppercase; color: ${accent}; margin: 0 0 4px 0;">Ship To / Deliver To</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.businessName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress || ''}</p>
        </div>
      </div>

      <div style="display: flex; justify-content: space-between; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 10px 0; margin-bottom: 20px; font-size: 10px;">
        <div><strong>Order Date:</strong> ${data.issueDate || ''}</div>
        <div><strong>Expected Delivery:</strong> ${data.dueDate || ''}</div>
        <div><strong>Shipping Method:</strong> Standard Freight</div>
        <div><strong>Terms:</strong> Net 30</div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #e0f2fe; border-bottom: 2px solid ${accent};">
            <th style="text-align: left; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Item Description</th>
            <th style="text-align: center; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Qty Ordered</th>
            <th style="text-align: right; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Unit Price</th>
            <th style="text-align: right; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Extended Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 10px; font-size: 10px; color: ${dark}; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px; font-size: 10px; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 10px; font-size: 10px; font-weight: 700; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 28px;">
        <div style="width: 220px;">
          <div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${muted};"><span>Subtotal</span><span>${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; padding: 4px 0; font-size: 10px; color: ${muted};"><span>Tax (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; padding: 8px 12px; background: ${accent}; color: #ffffff; border-radius: 6px; font-size: 11px; font-weight: 800; margin-top: 6px;">
            <span>Total P.O. Amount</span><span>${m(totalDue)}</span>
          </div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="border-top: 1px solid #e2e8f0; padding-top: 16px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div style="flex: 1;">
          <p style="font-size: 9px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">Instructions &amp; Conditions</p>
          <p style="font-size: 9px; color: ${muted}; margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
        <div style="width: 180px; text-align: center; margin-left: 24px;">
          <div style="border-bottom: 1px solid ${dark}; height: 28px; margin-bottom: 4px;"></div>
          <p style="font-size: 9px; font-weight: 600; color: ${dark}; margin: 0;">Authorized Purchaser Signature</p>
        </div>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Purchase Order 2 (Corporate Navy) ──
function renderPurchaseOrderCorporate(data: InvoiceData, accent: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#0f172a';
  const muted = '#64748b';

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px; background: #ffffff; display: flex; flex-direction: column;">
      ${showSection(layoutState, 'showHeader') ? `
      <div style="border-bottom: 3px solid ${dark}; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h1 style="font-size: 22px; font-weight: 800; color: ${dark}; margin: 0 0 2px 0;">${data.businessName || ''}</h1>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress || ''}</p>
        </div>
        <div style="text-align: right;">
          <h2 style="font-size: 18px; font-weight: 800; color: ${accent}; margin: 0 0 2px 0;">PURCHASE ORDER</h2>
          <p style="font-size: 10px; font-weight: 600; color: ${dark}; margin: 0;">P.O. #${data.invoiceNumber || data.poNumber || ''}</p>
        </div>
      </div>
      ` : ''}

      <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
        <div style="width: 48%;">
          <p style="font-size: 9px; font-weight: 700; color: ${muted}; text-transform: uppercase; margin: 0 0 4px 0;">Vendor</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.clientAddress || ''}</p>
        </div>
        <div style="width: 48%;">
          <p style="font-size: 9px; font-weight: 700; color: ${muted}; text-transform: uppercase; margin: 0 0 4px 0;">Ship To</p>
          <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.businessName || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 0;">${data.senderAddress || ''}</p>
        </div>
      </div>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background: #f8fafc; border-top: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0;">
            <th style="text-align: left; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Item Description</th>
            <th style="text-align: center; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Qty</th>
            <th style="text-align: right; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Rate</th>
            <th style="text-align: right; padding: 8px 10px; font-size: 9px; font-weight: 700; color: ${dark};">Total</th>
          </tr>
        </thead>
        <tbody>
          ${lineItems.map((item) => `
            <tr style="border-bottom: 1px solid #f1f5f9;">
              <td style="padding: 10px; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
              <td style="padding: 10px; font-size: 10px; color: ${dark}; text-align: center;">${item.quantity}</td>
              <td style="padding: 10px; font-size: 10px; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.unitPrice)}</td>
              <td style="padding: 10px; font-size: 10px; font-weight: 700; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      ${showSection(layoutState, 'showTotalDetails') ? `
      <div style="display: flex; justify-content: flex-end; margin-bottom: 24px;">
        <div style="width: 200px;">
          <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; padding: 3px 0;"><span>Subtotal</span><span>${m(subtotal)}</span></div>
          ${taxRate > 0 ? `<div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; padding: 3px 0;"><span>Tax (${taxRate}%)</span><span>${m(taxAmount)}</span></div>` : ''}
          <div style="display: flex; justify-content: space-between; font-size: 12px; font-weight: 800; color: ${accent}; padding-top: 6px; border-top: 2px solid ${dark}; margin-top: 4px;"><span>Total Order</span><span>${m(totalDue)}</span></div>
        </div>
      </div>
      ` : ''}

      <div style="flex: 1;"></div>

      ${showSection(layoutState, 'showNotes') ? `
      <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; font-size: 9px; color: ${muted};">
        <p style="margin: 0;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
      </div>
      ` : ''}
    </div>
  `;
}

// ── Purchase Order 3 (Classic Grid) — Excel/Word style with blue headers & grid table ──
const renderPurchaseOrderClassic: (data: InvoiceData, accentOverride: string, _layoutState?: LayoutState | null) => string = (data, accentOverride) => {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1e293b';
  const muted = '#64748b';
  const slateBlue = accentOverride || '#3b5998';
  const borderCol = '#cbd5e1';
  const items = lineItems.length > 0 ? lineItems : [];

  return `
    <div style="font-family: 'Arial', 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 36px 40px; background: #ffffff; display: flex; flex-direction: column;">

      <!-- Header Row -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
        <div>
          <h2 style="font-size: 16px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">${data.businessName || ''}</h2>
          <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.4; white-space: pre-wrap;">${data.senderAddress || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 2px 0 0 0;">Phone: ${data.senderPhone || ''}</p>
          <p style="font-size: 10px; color: ${muted}; margin: 1px 0 0 0;">Email: ${data.senderEmail || ''}</p>
        </div>
        <div style="text-align: right;">
          <h1 style="font-size: 24px; font-weight: 900; color: ${slateBlue}; margin: 0 0 10px 0; letter-spacing: 0.5px;">PURCHASE ORDER</h1>
          <table style="border-collapse: collapse; margin-left: auto; font-size: 9.5px;">
            <tr>
              <td style="font-weight: 700; padding: 3px 8px; color: ${dark}; text-align: right;">DATE</td>
              <td style="border: 1px solid ${borderCol}; padding: 3px 12px; font-weight: 600; text-align: center;">${data.issueDate || ''}</td>
            </tr>
            <tr>
              <td style="font-weight: 700; padding: 3px 8px; color: ${dark}; text-align: right;">PO #</td>
              <td style="border: 1px solid ${borderCol}; padding: 3px 12px; font-weight: 600; text-align: center;">${data.poNumber || data.invoiceNumber || ''}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Vendor / Ship To Row -->
      <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 16px;">
        <div style="flex: 1;">
          <div style="background: ${slateBlue}; color: #ffffff; font-size: 9.5px; font-weight: 800; padding: 4px 10px; text-transform: uppercase;">
            VENDOR
          </div>
          <div style="font-size: 9.5px; color: ${dark}; padding: 6px 4px; line-height: 1.45; white-space: pre-wrap;">${data.clientName || ''}\n${data.clientContact || ''}\n${data.clientAddress || ''}\nPhone: ${data.clientPhone || ''}</div>
        </div>
        <div style="flex: 1;">
          <div style="background: ${slateBlue}; color: #ffffff; font-size: 9.5px; font-weight: 800; padding: 4px 10px; text-transform: uppercase;">
            SHIP TO
          </div>
          <div style="font-size: 9.5px; color: ${dark}; padding: 6px 4px; line-height: 1.45; white-space: pre-wrap;">${data.shipToName || ''}\n${data.businessName || ''}\n${data.shipToAddress || data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}</div>
        </div>
      </div>

      <!-- Logistics Row -->
      <div style="margin-bottom: 18px;">
        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 9px;">
          <thead>
            <tr style="background: ${slateBlue}; color: #ffffff; font-weight: 800;">
              <th style="padding: 4px 6px; width: 25%;">REQUISITIONER</th>
              <th style="padding: 4px 6px; width: 25%;">SHIP VIA</th>
              <th style="padding: 4px 6px; width: 20%;">F.O.B.</th>
              <th style="padding: 4px 6px; width: 30%;">SHIPPING TERMS</th>
            </tr>
          </thead>
          <tbody>
            <tr style="border: 1px solid ${borderCol}; font-weight: 500; color: ${dark};">
              <td style="padding: 5px; border-right: 1px solid ${borderCol};">${data.requisitioner || ''}</td>
              <td style="padding: 5px; border-right: 1px solid ${borderCol};">${data.shipVia || ''}</td>
              <td style="padding: 5px; border-right: 1px solid ${borderCol};">${data.fob || ''}</td>
              <td style="padding: 5px;">${data.shippingTerms || ''}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Items Grid Table -->
      <div style="margin-bottom: 18px; flex: 1;">
        <table style="width: 100%; border-collapse: collapse; border: 1px solid ${borderCol}; font-size: 9px;">
          <thead>
            <tr style="background: ${slateBlue}; color: #ffffff; font-weight: 800;">
              <th style="padding: 5px 8px; text-align: center; width: 18%; border-right: 1px solid ${borderCol};">ITEM #</th>
              <th style="padding: 5px 8px; text-align: left; width: 44%; border-right: 1px solid ${borderCol};">DESCRIPTION</th>
              <th style="padding: 5px 8px; text-align: center; width: 10%; border-right: 1px solid ${borderCol};">QTY</th>
              <th style="padding: 5px 8px; text-align: right; width: 14%; border-right: 1px solid ${borderCol};">UNIT PRICE</th>
              <th style="padding: 5px 8px; text-align: right; width: 14%;">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr style="border-bottom: 1px solid ${borderCol}; height: 22px;">
                <td style="padding: 4px 8px; text-align: left; border-right: 1px solid ${borderCol}; color: ${dark};">[${23423423 + idx * 100}]</td>
                <td style="padding: 4px 8px; text-align: left; border-right: 1px solid ${borderCol}; font-weight: 600; color: ${dark};">${item.description}</td>
                <td style="padding: 4px 8px; text-align: center; border-right: 1px solid ${borderCol}; color: ${dark};">${item.quantity}</td>
                <td style="padding: 4px 8px; text-align: right; border-right: 1px solid ${borderCol}; color: ${dark};">${formatDocumentMoney(item.unitPrice,data)}</td>
                <td style="padding: 4px 8px; text-align: right; font-weight: 600; color: ${dark};">${formatDocumentMoney(item.total,data)}</td>
              </tr>
            `).join('')}
            ${Array.from({ length: Math.max(0, 8 - items.length) }).map(() => `
              <tr style="border-bottom: 1px solid ${borderCol}; height: 20px;">
                <td style="border-right: 1px solid ${borderCol};"></td>
                <td style="border-right: 1px solid ${borderCol};"></td>
                <td style="border-right: 1px solid ${borderCol};"></td>
                <td style="border-right: 1px solid ${borderCol};"></td>
                <td style="text-align: right; padding-right: 8px; color: ${muted};">-</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bottom Comments & Totals Row -->
      <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 24px;">
        <!-- Comments Left Box -->
        <div style="width: 58%;">
          <div style="background: #94a3b8; color: #ffffff; font-size: 9px; font-weight: 800; padding: 4px 10px;">
            Comments or Special Instructions
          </div>
          <div style="border: 1px solid ${borderCol}; height: 74px; padding: 8px; font-size: 9px; color: ${muted}; line-height: 1.4; box-sizing: border-box;">
            ${formatMarkdownHTML(data.notesAndTerms || '') || ''}
          </div>
        </div>

        <!-- Totals Right Block -->
        <div style="width: 38%;">
          <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
            <tr>
              <td style="font-weight: 700; padding: 3px 6px; color: ${dark};">SUBTOTAL</td>
              <td style="border: 1px solid ${borderCol}; padding: 3px 8px; text-align: right; font-weight: 700; width: 80px;">${formatDocumentMoney(subtotal,data)}</td>
            </tr>
            <tr>
              <td style="font-weight: 700; padding: 3px 6px; color: ${dark};">TAX</td>
              <td style="border: 1px solid ${borderCol}; padding: 3px 8px; text-align: right; color: ${muted};">${taxAmount > 0 ? formatDocumentMoney(taxAmount,data) : '-'}</td>
            </tr>
            <tr>
              <td style="font-weight: 700; padding: 3px 6px; color: ${dark};">SHIPPING</td>
              <td style="border: 1px solid ${borderCol}; padding: 3px 8px; text-align: right; color: ${muted};">-</td>
            </tr>
            <tr>
              <td style="font-weight: 700; padding: 3px 6px; color: ${dark};">OTHER</td>
              <td style="border: 1px solid ${borderCol}; padding: 3px 8px; text-align: right; color: ${muted};">-</td>
            </tr>
            <tr>
              <td style="font-weight: 900; padding: 5px 6px; color: ${dark};">TOTAL</td>
              <td style="background: ${slateBlue}; color: #ffffff; padding: 5px 8px; text-align: right; font-weight: 900;">${m(totalDue)}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Footer Note -->
      <div style="text-align: center; font-size: 9px; color: ${muted}; font-weight: 500;">
        If you have any questions about this purchase order, please contact<br/>
        <strong style="color: ${dark};">${data.senderEmail || ''}</strong>
      </div>

    </div>
  `;
};

// ── Purchase Order 4 (Modern Orange Wave & Dark Totals) ──
const renderPurchaseOrderOrangeWave: (data: InvoiceData, accentOverride: string, _layoutState?: LayoutState | null) => string = (data, accentOverride) => {
  const { lineItems, subtotal, taxRate, taxAmount } = computeTotals(data);


  const dark = '#1e293b';
  const muted = '#64748b';
  const orange = accentOverride || '#e0531c';
  const darkCol = '#262729';
  const items = lineItems.length > 0 ? lineItems : [];

  const shippingCost = 0;
  const calcTax = taxAmount;
  const grandTotal = subtotal + calcTax + shippingCost;

  return `
    <div style="font-family: 'Arial', 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 36px 36px 0 36px; background: #ffffff; display: flex; flex-direction: column; position: relative; overflow: hidden;">

      <!-- Top Header Row -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px;">
        <div>
          <h2 style="font-size: 16px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">${data.businessName || ''}</h2>
          <p style="font-size: 9.5px; color: ${muted}; margin: 0; line-height: 1.45; white-space: pre-wrap;">${data.senderAddress || ''}</p>
          <p style="font-size: 9.5px; color: ${muted}; margin: 2px 0 0 0;">Phone: ${data.senderPhone || ''}</p>
          <p style="font-size: 9.5px; color: ${muted}; margin: 1px 0 0 0;">Fax: ${data.senderFax || ''}</p>
          <p style="font-size: 9.5px; color: ${muted}; margin: 1px 0 0 0;">Website: ${data.senderEmail || ''}</p>
        </div>
        <div style="text-align: right;">
          <h1 style="font-size: 24px; font-weight: 900; color: ${orange}; margin: 0 0 14px 0; letter-spacing: 0.5px; text-transform: uppercase;">PURCHASE ORDER</h1>
          <table style="border-collapse: collapse; margin-left: auto; font-size: 9.5px;">
            <tr>
              <td style="font-weight: 700; padding: 3px 12px 3px 0; color: ${dark}; text-align: right;">DATE</td>
              <td style="font-weight: 600; text-align: right; color: ${dark};">${data.issueDate || ''}</td>
            </tr>
            <tr>
              <td style="font-weight: 700; padding: 3px 12px 3px 0; color: ${dark}; text-align: right;">PO #</td>
              <td style="font-weight: 600; text-align: right; color: ${dark};">${data.poNumber || data.invoiceNumber || ''}</td>
            </tr>
          </table>
        </div>
      </div>

      <!-- Vendor / Ship To Row -->
      <div style="display: flex; justify-content: space-between; gap: 16px; margin-bottom: 20px;">
        <!-- Vendor -->
        <div style="flex: 1;">
          <div style="background: ${orange}; color: #ffffff; font-size: 9px; font-weight: 800; padding: 4px 8px; text-transform: uppercase;">
            VENDOR
          </div>
          <div style="font-size: 9px; color: ${dark}; padding: 6px 2px; line-height: 1.45; white-space: pre-wrap; border-bottom: 2px solid ${orange};">${data.clientName || ''}\n${data.clientContact || ''}\n${data.clientAddress || ''}\nPhone: ${data.clientPhone || ''}\nFax: ${data.clientFax || ''}</div>
        </div>

        <!-- Ship To -->
        <div style="flex: 1;">
          <div style="background: ${orange}; color: #ffffff; font-size: 9px; font-weight: 800; padding: 4px 8px; text-transform: uppercase;">
            SHIP TO
          </div>
          <div style="font-size: 9px; color: ${dark}; padding: 6px 2px; line-height: 1.45; white-space: pre-wrap; border-bottom: 2px solid ${orange};">${data.shipToName || ''}\n${data.businessName || ''}\n${data.shipToAddress || data.senderAddress || ''}\nPhone: ${data.senderPhone || ''}</div>
        </div>
      </div>

      <!-- Logistics / Shipping Terms Bar -->
      <div style="margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 9px;">
          <thead>
            <tr style="background: ${orange}; color: #ffffff; font-weight: 800;">
              <th style="padding: 5px; width: 33.33%;">SHIPPING TERMS</th>
              <th style="padding: 5px; width: 33.33%;">SHIPPING METHOD</th>
              <th style="padding: 5px; width: 33.34%;">DELIVERY DATE</th>
            </tr>
          </thead>
          <tbody>
            <tr style="background: #f8fafc; font-weight: 600; color: ${dark}; border-bottom: 1px solid #cbd5e1;">
              <td style="padding: 6px;">${data.shippingTerms || ''}</td>
              <td style="padding: 6px;">${data.shipVia || ''}</td>
              <td style="padding: 6px;">${data.dueDate || ''}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Table & Dark Totals Column Container -->
      <div style="display: flex; flex: 1; min-height: 280px; margin-bottom: 20px;">

        <!-- Left Table Area (Items + Bottom Notes + Subtotal Labels) -->
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: space-between; padding-right: 0;">
          <div>
            <!-- Item Table Header -->
            <table style="width: 100%; border-collapse: collapse; font-size: 9px;">
              <thead>
                <tr style="background: ${orange}; color: #ffffff; font-weight: 800;">
                  <th style="padding: 6px 8px; text-align: left; width: 22%;">ITEM #</th>
                  <th style="padding: 6px 8px; text-align: left; width: 48%;">DESCRIPTION</th>
                  <th style="padding: 6px 8px; text-align: center; width: 15%;">QTY</th>
                  <th style="padding: 6px 8px; text-align: right; width: 15%;">UNIT PRICE</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, idx) => `
                  <tr style="border-bottom: 1px solid #e2e8f0; height: 24px;">
                    <td style="padding: 5px 8px; text-align: left; color: ${dark}; font-weight: 600;">${12345478 + idx * 100}</td>
                    <td style="padding: 5px 8px; text-align: left; color: ${dark}; font-weight: 600;">${item.description}</td>
                    <td style="padding: 5px 8px; text-align: center; color: ${dark};">${item.quantity}</td>
                    <td style="padding: 5px 8px; text-align: right; color: ${dark};">${data.currencySymbol || ''}${formatDocumentMoney(item.unitPrice,data)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>

          <!-- Bottom Row: Comments Left + Totals Labels Right -->
          <div style="display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-top: 24px;">
            <!-- Comments Box -->
            <div style="flex: 1;">
              <div style="background: ${orange}; color: #ffffff; font-size: 8.5px; font-weight: 800; padding: 4px 8px;">
                Comments or Special Instructions
              </div>
              <div style="background: ${darkCol}; color: #ffffff; font-size: 8.5px; padding: 8px; line-height: 1.45; min-height: 44px; box-sizing: border-box;">
                ${formatMarkdownHTML(data.notesAndTerms || '') || ''}
              </div>
            </div>

            <!-- Subtotal / Tax / Shipping Labels -->
            <div style="width: 110px; text-align: right; white-space: nowrap; font-size: 9px; font-weight: 700; color: ${dark}; line-height: 1.8;">
              <div>SUBTOTAL</div>
              <div>TAX</div>
              <div>SHIPPING</div>
              <div style="font-size: 10px; font-weight: 900; margin-top: 4px;">TOTAL</div>
            </div>
          </div>

        </div>

        <!-- Dark Column on the Right (Header TOTAL + Line Totals + Total Amount) -->
        <div style="width: 110px; background: ${darkCol}; color: #ffffff; display: flex; flex-direction: column; justify-content: space-between; box-sizing: border-box;">

          <!-- Column Header & Line Item Totals -->
          <div>
            <div style="background: ${darkCol}; color: #ffffff; font-size: 9px; font-weight: 800; padding: 6px 8px; text-align: right; border-bottom: 2px solid ${orange};">
              TOTAL
            </div>
            <div>
              ${items.map((item) => `
                <div style="padding: 5px 8px; text-align: right; white-space: nowrap; font-size: 9px; font-weight: 700; height: 24px; box-sizing: border-box;">
                  ${data.currencySymbol || ''}${formatDocumentMoney(item.total,data)}
                </div>
              `).join('')}
            </div>
          </div>

          <!-- Bottom Breakdown Values -->
          <div style="padding: 0 8px 8px 8px; text-align: right; white-space: nowrap; font-size: 9px; line-height: 1.8;">
            <div style="font-weight: 700;">${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}</div>
            <div style="font-weight: 600;">${taxRate ?? 0}%</div>
            <div style="font-weight: 700;">${data.currencySymbol || ''}${formatDocumentMoney(shippingCost,data)}</div>
            <div style="font-size: 11px; font-weight: 900; color: ${orange}; margin-top: 4px;">${data.currencySymbol || ''}${formatDocumentMoney(grandTotal,data)}</div>
          </div>

        </div>

      </div>

      <!-- Footer Bottom Link & Decorative Waves -->
      <div style="margin-top: auto; padding-bottom: 60px; text-align: right; white-space: nowrap; font-size: 8.5px; color: ${muted}; font-weight: 500;">
        <a href="#" style="color: ${muted}; text-decoration: underline;">Templatelab.com</a>
      </div>

      <!-- Bottom Decorative Vector Wave Graphic -->
      <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 75px; pointer-events: none; overflow: hidden;">
        <svg viewBox="0 0 595 75" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; display: block;">
          <!-- Cyan / Teal Wave accent -->
          <path d="M-20 75 C150 10, 420 85, 615 20 L615 75 Z" fill="#00a896" opacity="0.85"/>
          <!-- Orange Primary Wave -->
          <path d="M-20 75 C100 0, 380 90, 615 50 L615 75 Z" fill="${orange}"/>
          <!-- Dark Slate Accent Overlay Wave -->
          <path d="M-20 75 C200 40, 480 95, 615 65 L615 75 Z" fill="${darkCol}"/>
        </svg>
      </div>

    </div>
  `;
};

// ── Purchase Order 5 (Clean Teal / Yellow Logo Badge) ──
const renderPurchaseOrderCyanClean: (data: InvoiceData, accentOverride: string, _layoutState?: LayoutState | null) => string = (data, accentOverride) => {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);


  const dark = '#1e293b';
  const muted = '#64748b';
  const cyanAccent = accentOverride || '#00a8b5';
  const yellowBadge = '#f5a623';
  const items = lineItems.length > 0 ? lineItems : [];

  return `
    <div style="font-family: 'Arial', 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 36px 40px 32px 40px; background: #ffffff; display: flex; flex-direction: column; position: relative;">

      <!-- Top Header Row with Cyan Title and Yellow Logo -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
        <h1 style="font-size: 32px; font-weight: 800; color: ${cyanAccent}; margin: 0; letter-spacing: -0.5px;">Purchase Order</h1>
        <div style="width: 54px; height: 54px; border-radius: 50%; background: ${yellowBadge}; display: flex; align-items: center; justify-content: center; color: #ffffff; font-weight: 700; font-size: 13px;">
          Logo
        </div>
      </div>

      <!-- Cyan Divider Line -->
      <div style="height: 2px; background: ${cyanAccent}; width: 100%; margin-bottom: 24px;"></div>

      <!-- Company/Ship-to Left & Metadata Card Right -->
      <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px;">

        <!-- Left Side: Company Name & Address + Ship To -->
        <div style="flex: 1;">
          <div style="margin-bottom: 18px;">
            <h3 style="font-size: 12px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">${data.businessName || ''}</h3>
            <p style="font-size: 10px; font-style: italic; color: ${muted}; margin: 0; line-height: 1.45; white-space: pre-wrap;">${data.senderAddress || ''}</p>
            <p style="font-size: 10px; font-style: italic; color: ${muted}; margin: 2px 0 0 0;">Phone: ${data.senderPhone || ''}</p>
          </div>

          <div>
            <h4 style="font-size: 11px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">Ship to</h4>
            <p style="font-size: 10px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.shipToName || ''}</p>
            <p style="font-size: 10px; font-style: italic; color: ${muted}; margin: 0; line-height: 1.45; white-space: pre-wrap;">Attn: ${data.shipToContact || ''}\n${data.shipToAddress || ''}</p>
            <p style="font-size: 10px; font-style: italic; color: ${muted}; margin: 2px 0 0 0;">Phone: ${data.shipToPhone || ''}</p>
          </div>
        </div>

        <!-- Right Side: Grey Boxed Metadata -->
        <div style="width: 220px; background: #f8fafc; border-radius: 4px; padding: 14px 16px; font-size: 10px; box-sizing: border-box;">
          <table style="width: 100%; border-collapse: collapse; line-height: 1.8;">
            <tr>
              <td style="color: ${muted}; width: 60%;">PO no:</td>
              <td style="font-weight: 600; color: ${dark}; text-align: right;">${data.poNumber || data.invoiceNumber || ''}</td>
            </tr>
            <tr>
              <td style="color: ${muted};">Purchase Order Status:</td>
              <td style="font-weight: 600; color: ${dark}; text-align: right;">${data.poStatus || ''}</td>
            </tr>
            <tr>
              <td style="color: ${muted};">Date:</td>
              <td style="font-weight: 600; color: ${dark}; text-align: right;">${data.issueDate || ''}</td>
            </tr>
            <tr>
              <td style="color: ${muted};">Requested By:</td>
              <td style="font-weight: 600; color: ${dark}; text-align: right;">${data.requisitioner || ''}</td>
            </tr>
            <tr>
              <td style="color: ${muted};">Approved By:</td>
              <td style="font-weight: 600; color: ${dark}; text-align: right;">${data.approvedBy || ''}</td>
            </tr>
            <tr>
              <td style="color: ${muted};">Department:</td>
              <td style="font-weight: 600; color: ${dark}; text-align: right;">${data.department || ''}</td>
            </tr>
          </table>
        </div>

      </div>

      <!-- Supplier & Terms Row -->
      <div style="display: flex; justify-content: space-between; gap: 24px; margin-bottom: 24px;">
        <div style="flex: 1;">
          <h4 style="font-size: 11px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">Supplier</h4>
          <p style="font-size: 10px; font-weight: 700; color: ${dark}; margin: 0 0 2px 0;">${data.clientName || ''}</p>
          <p style="font-size: 10px; font-style: italic; color: ${muted}; margin: 0; line-height: 1.45; white-space: pre-wrap;">${data.clientAddress || ''}</p>
          <p style="font-size: 10px; font-style: italic; color: ${muted}; margin: 2px 0 0 0;">Phone: ${data.clientPhone || ''}</p>
          <p style="font-size: 10px; font-style: italic; color: ${muted}; margin: 1px 0 0 0;">Email: ${data.clientEmail || ''}</p>
          <p style="font-size: 10px; font-style: italic; color: ${dark}; font-weight: 600; margin: 4px 0 0 0;">Terms: ${data.paymentTerms || ''}</p>
        </div>

        <div style="width: 220px;">
          <h4 style="font-size: 11px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">Terms of sale and other comments</h4>
          <p style="font-size: 9.5px; color: ${muted}; margin: 0; line-height: 1.45;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
      </div>

      <!-- Items Table -->
      <div style="flex: 1; margin-bottom: 18px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 9.5px;">
          <thead>
            <tr style="border-top: 2.5px solid ${cyanAccent}; border-bottom: 1px solid #e2e8f0; font-weight: 800; color: ${dark};">
              <th style="padding: 8px 4px; text-align: left; width: 18%;">Item #</th>
              <th style="padding: 8px 4px; text-align: left; width: 34%;">Description</th>
              <th style="padding: 8px 4px; text-align: center; width: 12%;">Qty</th>
              <th style="padding: 8px 4px; text-align: center; width: 12%;">Unit</th>
              <th style="padding: 8px 4px; text-align: right; width: 12%;">Unit Price</th>
              <th style="padding: 8px 4px; text-align: right; width: 12%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr style="border-bottom: 1px solid #f1f5f9; height: 32px;">
                <td style="padding: 6px 4px; color: ${muted}; font-weight: 500;">${123456789 + idx * 100}</td>
                <td style="padding: 6px 4px; color: ${dark}; font-weight: 600;">${item.description}</td>
                <td style="padding: 6px 4px; text-align: center; color: ${muted};">${item.quantity}</td>
                <td style="padding: 6px 4px; text-align: center; color: ${muted};">${idx === 0 ? 'kg' : 'l'}</td>
                <td style="padding: 6px 4px; text-align: right; color: ${muted};">${data.currencySymbol || ''}${formatDocumentMoney(item.unitPrice,data)}</td>
                <td style="padding: 6px 4px; text-align: right; color: ${dark}; font-weight: 600;">${data.currencySymbol || ''}${formatDocumentMoney(item.total,data)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Totals Breakdown Right -->
      <div style="display: flex; justify-content: flex-end; margin-bottom: 24px;">
        <table style="border-collapse: collapse; font-size: 10px; line-height: 1.8;">
          <tr>
            <td style="font-weight: 700; color: ${dark}; padding-right: 24px; text-align: right;">Subtotal</td>
            <td style="font-weight: 800; color: ${dark}; text-align: right;">${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}</td>
          </tr>
          <tr>
            <td style="font-weight: 700; color: ${dark}; padding-right: 24px; text-align: right;">Tax</td>
            <td style="font-weight: 800; color: ${dark}; text-align: right;">${data.currencySymbol || ''}${taxAmount > 0 ? formatDocumentMoney(taxAmount,data) : '0'}</td>
          </tr>
          <tr>
            <td style="font-weight: 700; color: ${dark}; padding-right: 24px; text-align: right;">Shipping</td>
            <td style="font-weight: 800; color: ${dark}; text-align: right;">£ 0</td>
          </tr>
          <tr>
            <td style="font-weight: 700; color: ${dark}; padding-right: 24px; text-align: right;">Other</td>
            <td style="font-weight: 800; color: ${dark}; text-align: right;">£ 0</td>
          </tr>
          <tr>
            <td style="font-weight: 800; color: ${cyanAccent}; padding-right: 24px; text-align: right; white-space: nowrap; font-size: 11px; padding-top: 8px;">Total</td>
            <td style="font-weight: 800; color: ${cyanAccent}; text-align: right; white-space: nowrap; font-size: 11px; padding-top: 8px;">${data.currencySymbol || ''}${formatDocumentMoney(totalDue,data)}</td>
          </tr>
        </table>
      </div>

      <!-- Solid Bottom Cyan Bar -->
      <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 14px; background: ${cyanAccent};"></div>

    </div>
  `;
};

// ── Purchase Order 6 (Minimalist Black & White Grid Order Form) ──
const renderPurchaseOrderMinimalGrid: (data: InvoiceData, accentOverride: string, _layoutState?: LayoutState | null) => string = (data, accentOverride) => {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);


  const dark = accentOverride || '#0f172a';
  const muted = '#475569';
  const items = lineItems.length > 0 ? lineItems : [];

  // Fill up grid rows to 12 rows minimum like the printed order form sheet
  const totalRows = Math.max(12, items.length);
  const gridRows = Array.from({ length: totalRows }).map((_, i) => items[i] || null);

  return `
    <div style="font-family: 'Arial', 'Inter', sans-serif; color: #000000; width: 595px; min-height: 842px; box-sizing: border-box; padding: 36px 40px; background: #ffffff; display: flex; flex-direction: column;">

      <!-- Top Title & Company Address Row -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px;">
        <h1 style="font-size: 30px; font-weight: 900; color: #000000; margin: 0; letter-spacing: -0.5px;">Purchase Order</h1>
        <div style="text-align: right; white-space: nowrap; font-size: 10px; color: ${muted}; line-height: 1.45;">
          <div style="font-weight: 700; color: #000000; font-size: 11px;">${data.businessName || ''}</div>
          <div style="white-space: pre-wrap;">${data.senderAddress || ''}</div>
          <div>${data.senderPhone || ''}</div>
        </div>
      </div>

      <!-- PO # and Date Underline Row -->
      <div style="display: flex; justify-content: space-between; font-size: 11px; font-weight: 700; margin-bottom: 16px;">
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <span>Purchase Order #</span>
          <span style="border-bottom: 1.5px solid #000000; display: inline-block; width: 180px; padding-bottom: 2px; font-weight: 600; color: #000000;">${data.poNumber || data.invoiceNumber || ''}</span>
        </div>
        <div style="display: flex; align-items: baseline; gap: 8px;">
          <span>Date</span>
          <span style="border-bottom: 1.5px solid #000000; display: inline-block; width: 140px; padding-bottom: 2px; font-weight: 600; color: #000000;">${data.issueDate || ''}</span>
        </div>
      </div>

      <!-- Vendor / Ship To Boxed Banner -->
      <div style="border: 1.5px solid #000000; margin-bottom: 16px;">
        <div style="display: flex; background: ${dark}; color: #ffffff; font-size: 10px; font-weight: 800; border-bottom: 1.5px solid #000000;">
          <div style="flex: 1; padding: 6px 10px; border-right: 1.5px solid #ffffff;">VENDOR</div>
          <div style="flex: 1; padding: 6px 10px;">SHIP TO</div>
        </div>
        <div style="display: flex; font-size: 10px; color: #000000; line-height: 1.45;">
          <div style="flex: 1; padding: 8px 10px; border-right: 1.5px solid #000000;">
            <div style="font-weight: 700;">${data.clientName || ''}</div>
            <div style="white-space: pre-wrap;">${data.clientAddress || ''}</div>
            <div>${data.clientPhone || ''}</div>
          </div>
          <div style="flex: 1; padding: 8px 10px;">
            <div style="font-weight: 700;">${data.shipToName || data.businessName || ''}</div>
            <div style="white-space: pre-wrap;">${data.shipToAddress || data.senderAddress || ''}</div>
            <div>${data.senderPhone || ''}</div>
          </div>
        </div>
      </div>

      <!-- Products or Services Header Bar -->
      <div style="background: ${dark}; color: #ffffff; font-size: 10px; font-weight: 800; padding: 6px 10px; border: 1.5px solid #000000; border-bottom: none;">
        PRODUCTS OR SERVICES
      </div>

      <!-- Full Grid Table -->
      <div style="flex: 1; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; border: 1.5px solid #000000; font-size: 10px;">
          <thead>
            <tr style="border-bottom: 1.5px solid #000000; font-weight: 700;">
              <th style="padding: 6px 8px; text-align: left; width: 50%; border-right: 1.5px solid #000000;">Description</th>
              <th style="padding: 6px 8px; text-align: center; width: 16%; border-right: 1.5px solid #000000;">Unit Price</th>
              <th style="padding: 6px 8px; text-align: center; width: 16%; border-right: 1.5px solid #000000;">Quantity</th>
              <th style="padding: 6px 8px; text-align: right; width: 18%;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${gridRows.map((row) => `
              <tr style="border-bottom: 1px solid #000000; height: 26px;">
                <td style="padding: 4px 8px; border-right: 1.5px solid #000000; vertical-align: middle;">${row ? row.description : ''}</td>
                <td style="padding: 4px 8px; border-right: 1.5px solid #000000; text-align: center; vertical-align: middle;">${row ? (data.currencySymbol || '') + formatDocumentMoney(row.unitPrice,data) : ''}</td>
                <td style="padding: 4px 8px; border-right: 1.5px solid #000000; text-align: center; vertical-align: middle;">${row ? row.quantity : ''}</td>
                <td style="padding: 4px 8px; text-align: right; vertical-align: middle; font-weight: 600;">${row ? (data.currencySymbol || '') + formatDocumentMoney(row.total,data) : ''}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Bottom Notes Box Left & Totals Right -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 24px;">

        <!-- Notes Box -->
        <div style="flex: 1; border: 1.5px solid #000000; min-height: 80px; padding: 8px 10px; box-sizing: border-box;">
          <div style="font-size: 9.5px; font-weight: 700; color: #000000; margin-bottom: 4px;">Notes</div>
          <div style="font-size: 9.5px; color: ${muted}; line-height: 1.4;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</div>
        </div>

        <!-- Totals Underline List -->
        <div style="width: 200px; font-size: 10px; font-weight: 700; color: #000000;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <span>Sub Total</span>
            <span style="border-bottom: 1.5px solid #000000; width: 100px; text-align: right; padding-bottom: 2px;">${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <span>Other</span>
            <span style="border-bottom: 1.5px solid #000000; width: 100px; text-align: right; padding-bottom: 2px;">$0.00</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px;">
            <span>Taxes</span>
            <span style="border-bottom: 1.5px solid #000000; width: 100px; text-align: right; padding-bottom: 2px;">${data.currencySymbol || ''}${formatDocumentMoney(taxAmount,data)}</span>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: baseline;">
            <span>Grand Total</span>
            <span style="border-bottom: 1.5px solid #000000; width: 100px; text-align: right; padding-bottom: 2px; font-weight: 900;">${data.currencySymbol || ''}${formatDocumentMoney(totalDue,data)}</span>
          </div>
        </div>

      </div>

    </div>
  `;
};

// ── Purchase Order 7 (Global Company Dotted Order Form) ──
const renderPurchaseOrderGlobalCompany: (data: InvoiceData, accentOverride: string, _layoutState?: LayoutState | null) => string = (data, accentOverride) => {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);


  const dark = accentOverride || '#111827';
  const muted = '#6b7280';
  const items = lineItems.length > 0 ? lineItems : [];

  // Fill up table rows with dotted grid lines
  const totalRows = Math.max(10, items.length);
  const gridRows = Array.from({ length: totalRows }).map((_, i) => items[i] || null);

  const calcTax = taxAmount;
  const otherCost = 0;
  const calcTotal = totalDue;

  return `
    <div style="font-family: 'Arial', 'Inter', sans-serif; color: #000000; width: 595px; min-height: 842px; box-sizing: border-box; padding: 32px 36px; background: #ffffff; display: flex; flex-direction: column;">

      <!-- Header Row: Title & Dotted Metadata Left, Company Logo & Contact Right -->
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <div>
          <h1 style="font-size: 26px; font-weight: 800; color: #000000; margin: 0 0 10px 0;">Purchase Order</h1>
          <div style="font-size: 10px; line-height: 1.8;">
            <div style="border-bottom: 1px dotted #000000; width: 280px; display: flex; justify-content: space-between;">
              <span style="font-weight: 700;">Date:</span>
              <span>${data.issueDate || ''}</span>
            </div>
            <div style="border-bottom: 1px dotted #000000; width: 280px; display: flex; justify-content: space-between;">
              <span style="font-weight: 700;">Customer ID:</span>
              <span>${data.clientId || ''}</span>
            </div>
            <div style="border-bottom: 1px dotted #000000; width: 280px; display: flex; justify-content: space-between;">
              <span style="font-weight: 700;">PO. No:</span>
              <span>${data.poNumber || data.invoiceNumber || ''}</span>
            </div>
          </div>
        </div>

        <div style="text-align: right; white-space: nowrap; font-size: 9px; color: ${muted}; line-height: 1.4;">
          <div style="font-size: 14px; font-weight: 800; color: #000000; display: flex; align-items: center; justify-content: flex-end; gap: 4px; margin-bottom: 4px;">
            <span style="color: #475569; font-size: 16px;">🌐</span> ${data.businessName || ''}
          </div>
          <div>${data.senderAddress || ''}</div>
          <div>Phone: ${data.senderPhone || ''}, Fax: ${data.senderFax || ''}</div>
          <div>Email: ${data.senderEmail || ''}</div>
          <div>${data.businessWebsite || ''}</div>
        </div>
      </div>

      <!-- Solid Black Top Bar Divider -->
      <div style="height: 6px; background: #000000; width: 100%; margin-bottom: 14px;"></div>

      <!-- 3-Column Boxed Header Bar (Vendor, Ship To, Other Information) -->
      <div style="border: 1px solid #000000; margin-bottom: 14px;">
        <div style="display: flex; background: #1a1a1a; color: #ffffff; font-size: 9.5px; font-weight: 700; border-bottom: 1px solid #000000;">
          <div style="flex: 1; padding: 5px 8px; border-right: 1px solid #ffffff;">Vendor</div>
          <div style="flex: 1; padding: 5px 8px; border-right: 1px solid #ffffff;">Ship To</div>
          <div style="flex: 1; padding: 5px 8px;">Other Information</div>
        </div>
        <div style="display: flex; font-size: 9px; font-style: italic; line-height: 1.45; color: #000000;">
          <div style="flex: 1; padding: 6px 8px; border-right: 1px solid #000000;">
            <div style="font-weight: 700; font-style: normal;">${data.clientName || ''}</div>
            <div>${data.clientCompany || ''}</div>
            <div style="white-space: pre-wrap;">${data.clientAddress || ''}</div>
            <div>Phone: ${data.clientPhone || ''}</div>
            <div>Fax: ${data.clientFax || ''}</div>
            <div>Email: ${data.clientEmail || ''}</div>
          </div>
          <div style="flex: 1; padding: 6px 8px; border-right: 1px solid #000000;">
            <div style="font-weight: 700; font-style: normal;">${data.shipToName || ''}</div>
            <div style="white-space: pre-wrap;">${data.shipToAddress || ''}</div>
            <div>Phone: ${data.shipToPhone || ''}</div>
            <div>Fax: ${data.shipToFax || ''}</div>
            <div>Email: ${data.shipToEmail || ''}</div>
          </div>
          <div style="flex: 1; padding: 6px 8px;">
            <div><strong style="font-style: normal;">Ship Via:</strong> ${data.shipVia || ''}</div>
            <div><strong style="font-style: normal;">Shipping Method:</strong> ${data.shippingMethod || ''}</div>
            <div><strong style="font-style: normal;">Shipping Terms:</strong> ${data.shippingTerms || ''}</div>
            <div><strong style="font-style: normal;">Payment Terms:</strong> ${data.paymentTerms || ''}</div>
            <div><strong style="font-style: normal;">Delivery Date:</strong> ${data.dueDate || ''}</div>
            <div><strong style="font-style: normal;">F.O.B:</strong> ${data.fob || ''}</div>
          </div>
        </div>
      </div>

      <!-- Item Table Header Bar -->
      <div style="display: flex; background: #000000; color: #ffffff; font-size: 9.5px; font-weight: 700; border: 1px solid #000000; border-bottom: none;">
        <div style="width: 12%; padding: 5px 8px; border-right: 1px dotted #ffffff;">Item #</div>
        <div style="flex: 1; padding: 5px 8px; border-right: 1px dotted #ffffff;">Product Name/Description</div>
        <div style="width: 12%; padding: 5px 8px; text-align: center; border-right: 1px dotted #ffffff;">Qty</div>
        <div style="width: 14%; padding: 5px 8px; text-align: right; border-right: 1px dotted #ffffff;">Unit Price</div>
        <div style="width: 14%; padding: 5px 8px; text-align: right;">Total</div>
      </div>

      <!-- Dotted Item Grid Rows -->
      <div style="border: 1px solid #000000; border-top: none; flex: 1; margin-bottom: 16px;">
        ${gridRows.map((row, i) => `
          <div style="display: flex; font-size: 9px; font-style: italic; border-bottom: 1px dotted #000000; height: 22px; align-items: center;">
            <div style="width: 12%; padding: 2px 8px; border-right: 1px dotted #000000; text-align: center; font-style: normal;">${row ? '00' + (i + 1) : ''}</div>
            <div style="flex: 1; padding: 2px 8px; border-right: 1px dotted #000000; font-style: normal; font-weight: 500;">${row ? row.description : ''}</div>
            <div style="width: 12%; padding: 2px 8px; border-right: 1px dotted #000000; text-align: center;">${row ? row.quantity : ''}</div>
            <div style="width: 14%; padding: 2px 8px; border-right: 1px dotted #000000; text-align: right;">${row ? (data.currencySymbol || '') + row.unitPrice.toFixed(0) : ''}</div>
            <div style="width: 14%; padding: 2px 8px; text-align: right; font-weight: 600;">${row ? (data.currencySymbol || '') + row.total.toFixed(0) : ''}</div>
          </div>
        `).join('')}
      </div>

      <!-- Notes Left & Dark Totals Right -->
      <div style="display: flex; justify-content: space-between; gap: 20px; margin-bottom: 24px;">

        <!-- Notes Left -->
        <div style="flex: 1;">
          <h4 style="font-size: 10px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">Notes & Description:</h4>
          <p style="font-size: 9px; font-style: italic; color: ${muted}; margin: 0; line-height: 1.4; white-space: pre-wrap;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>

        <!-- Dark Totals Right -->
        <div style="width: 210px; border: 1.5px solid #000000; background: #333333; font-size: 9.5px; box-sizing: border-box;">
          <div style="display: flex; border-bottom: 1px solid #ffffff; padding: 3px 6px;">
            <div style="flex: 1; color: #ffffff; font-weight: 700; font-style: italic; text-align: right; padding-right: 8px;">Sub Total:</div>
            <div style="width: 75px; background: #ffffff; color: #000000; font-weight: 700; font-style: italic; text-align: right; padding-right: 4px;">${data.currencySymbol || ''}${formatDocumentMoney(subtotal,data)}</div>
          </div>
          <div style="display: flex; border-bottom: 1px solid #ffffff; padding: 3px 6px;">
            <div style="flex: 1; color: #ffffff; font-weight: 700; font-style: italic; text-align: right; padding-right: 8px;">Discount:</div>
            <div style="width: 75px; background: #ffffff; color: #000000; font-weight: 700; font-style: italic; text-align: right; padding-right: 4px;">$0.00</div>
          </div>
          <div style="display: flex; border-bottom: 1px solid #ffffff; padding: 3px 6px;">
            <div style="flex: 1; color: #ffffff; font-weight: 700; font-style: italic; text-align: right; padding-right: 8px;">Sales Tax Rate:</div>
            <div style="width: 75px; background: #ffffff; color: #000000; font-weight: 700; font-style: italic; text-align: right; padding-right: 4px;">${taxRate ?? 0}%</div>
          </div>
          <div style="display: flex; border-bottom: 1px solid #ffffff; padding: 3px 6px;">
            <div style="flex: 1; color: #ffffff; font-weight: 700; font-style: italic; text-align: right; padding-right: 8px;">Sales Tax:</div>
            <div style="width: 75px; background: #ffffff; color: #000000; font-weight: 700; font-style: italic; text-align: right; padding-right: 4px;">${data.currencySymbol || ''}${formatDocumentMoney(calcTax,data)}</div>
          </div>
          <div style="display: flex; border-bottom: 1px solid #ffffff; padding: 3px 6px;">
            <div style="flex: 1; color: #ffffff; font-weight: 700; font-style: italic; text-align: right; padding-right: 8px;">Other Cost:</div>
            <div style="width: 75px; background: #ffffff; color: #000000; font-weight: 700; font-style: italic; text-align: right; padding-right: 4px;">${data.currencySymbol || ''}${formatDocumentMoney(otherCost,data)}</div>
          </div>
          <div style="display: flex; padding: 4px 6px; background: #262626;">
            <div style="flex: 1; color: #ffffff; font-weight: 800; font-style: italic; text-align: right; padding-right: 8px;">Grand Total:</div>
            <div style="width: 75px; background: #ffffff; color: #000000; font-weight: 900; font-style: italic; text-align: right; padding-right: 4px;">${data.currencySymbol || ''}${formatDocumentMoney(calcTotal,data)}</div>
          </div>
        </div>

      </div>

      <!-- Signatures Dotted Underlines -->
      <div style="display: flex; justify-content: space-between; font-size: 9px; color: ${muted}; margin-bottom: 16px;">
        <div style="width: 220px;">
          <div style="border-bottom: 1px dotted #000000; padding-bottom: 2px; font-weight: 700; color: #000000;">Date</div>
          <div style="margin-top: 4px;">${data.issueDate || ''}</div>
        </div>
        <div style="width: 260px;">
          <div style="border-bottom: 1px dotted #000000; padding-bottom: 2px; font-weight: 700; font-style: italic; color: ${muted};">Authorized Signature</div>
        </div>
      </div>

      <!-- Customer Support Disclaimer Note -->
      <div style="font-size: 8.5px; font-style: italic; color: ${muted}; text-align: center; margin-bottom: 16px;">
        If you have any questions, concerns or queries regarding this PO, please feel free to contact with MR. ABC at 111-222-4455
      </div>

      <!-- Footer Company Logo & Details -->
      <div style="text-align: center; font-size: 8px; color: ${muted}; line-height: 1.35;">
        <div style="font-size: 11px; font-weight: 800; color: #000000; display: flex; align-items: center; justify-content: center; gap: 4px; margin-bottom: 2px;">
          <span style="color: #475569; font-size: 13px;">🌐</span> ${data.businessName || ''}
        </div>
        <div>${data.senderAddress || ''}</div>
        <div>Phone: ${data.senderPhone || ''}, Fax: ${data.senderFax || ''}</div>
        <div>Email: ${data.senderEmail || ''} | ${data.businessWebsite || ''}</div>
      </div>

    </div>
  `;
};

// ── Invoice 8 (Grid Bordered / Figma Design) — Warm off-white, dark grid borders, boxed invoice num, black total banner ──
const renderInvoice2023_08: (data: InvoiceData, _accent: string, _layoutState?: LayoutState | null) => string = (data) => {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a1a1a';
  const muted = '#555555';
  const borderCol = '#2d2d2d';
  const items = lineItems.length > 0 ? lineItems : [];

  // Format invoice number as array of digits for boxed display
  const rawNum = data.invoiceNumber || '';
  const digits = [rawNum];

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 20px; background: #f7f6f0; display: flex; flex-direction: column;">
      <div style="border: 2px solid ${borderCol}; display: flex; flex: 1; min-height: 798px;">

        <!-- LEFT COLUMN -->
        <div style="width: 215px; border-right: 2px solid ${borderCol}; display: flex; flex-direction: column;">

          <!-- Header: INVOICE -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 14px 12px;">
            <h1 style="font-size: 34px; font-weight: 900; letter-spacing: -0.5px; color: ${dark}; margin: 0; text-transform: uppercase;">INVOICE</h1>
          </div>

          <!-- ISSUED ON -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">ISSUED ON</p>
            <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
          </div>

          <!-- PAYABLE TO -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">PAYABLE TO</p>
            <p style="font-size: 10px; font-weight: 800; color: ${dark}; margin: 0;">${data.businessName || ''}</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 1px 0 3px 0;">Entity Name</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 0; line-height: 1.3; white-space: pre-wrap;">${data.senderAddress || ''}</p>
            <p style="font-size: 8.5px; color: ${dark}; margin: 4px 0 0 0;">${data.senderEmail || ''}</p>
          </div>

          <!-- BILLED TO -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">BILLED TO</p>
            <p style="font-size: 10px; font-weight: 800; color: ${dark}; margin: 0;">${data.clientName || ''}</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 1px 0 2px 0;">Entity Name</p>
            <p style="font-size: 8.5px; color: ${dark}; text-decoration: underline; margin: 0 0 3px 0;">website.com</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 0; line-height: 1.3; white-space: pre-wrap;">${data.clientAddress || ''}</p>
            <p style="font-size: 8.5px; color: ${dark}; margin: 4px 0 0 0;">${data.clientEmail || ''}</p>
          </div>

          <!-- PAYMENT INFORMATION -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 10px 12px;">
            <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 6px 0; text-transform: uppercase;">PAYMENT INFORMATION</p>
            <p style="font-size: 9.5px; font-weight: 800; color: ${dark}; margin: 0 0 2px 0;">${data.paymentMethod || ''}</p>




            <p style="font-size: 9.5px; font-weight: 800; color: ${dark}; margin: 0 0 2px 0;"></p>


            <p style="font-size: 9.5px; font-weight: 800; color: ${dark}; margin: 0 0 2px 0;">UPI</p>
            <p style="font-size: 8px; color: ${dark}; margin: 0 0 6px 0;">UPI ID: </p>

            <div style="display: flex; flex-direction: column; align-items: flex-start; margin-top: 4px;">
              <div style="width: 48px; height: 48px; border: 1px solid ${borderCol}; background: #ffffff; display: flex; align-items: center; justify-content: center;">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="${dark}" stroke-width="1.5">
                  <path d="M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM14 14h2v2h-2zM18 14h3v3h-3zM14 18h3v3h-3zM19 19h2v2h-2z" />
                </svg>
              </div>
              <p style="font-size: 7px; color: ${muted}; margin: 4px 0 0 0;">Scan to pay with any UPI app</p>
            </div>
          </div>

          <!-- GOT ANY QUESTIONS? -->
          <div style="padding: 10px 12px; flex: 1;">
            <p style="font-size: 10px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0; text-transform: uppercase;">GOT ANY QUESTIONS?</p>
            <p style="font-size: 8px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">CONTACT DETAILS</p>
            <p style="font-size: 9px; font-weight: 700; color: ${dark}; margin: 0;">FIRST LAST</p>
            <p style="font-size: 8px; color: ${muted}; margin: 1px 0;">Entity Name</p>
            <p style="font-size: 8px; color: ${dark}; text-decoration: underline; margin: 1px 0;">website.com</p>
            <p style="font-size: 8px; color: ${dark}; margin: 1px 0;">you@gmail.com</p>
            <p style="font-size: 8px; color: ${dark}; margin: 1px 0 6px 0;">+1 98765 43210</p>
            <div style="display: flex; gap: 8px; font-size: 10px; color: ${dark};">
              <span>📷</span> <span>𝕏</span> <span>in</span>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div style="flex: 1; display: flex; flex-direction: column;">

          <!-- Top Row: INVOICE TO & INVOICE NUMBER -->
          <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${borderCol}; padding: 12px 14px;">
            <div>
              <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">INVOICE TO</p>
              <p style="font-size: 13px; font-weight: 800; color: ${dark}; margin: 0;">${data.clientName || ''}</p>
            </div>
            <div style="text-align: right;">
              <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">INVOICE NUMBER</p>
              <div style="display: flex; gap: 2px; justify-content: flex-end;">
                ${digits.map((d) => `<span style="width: 14px; height: 16px; border: 1px solid ${borderCol}; background: #ffffff; display: inline-flex; align-items: center; justify-content: center; font-size: 9px; font-weight: 700;">${d}</span>`).join('')}
              </div>
            </div>
          </div>

          <!-- PROJECT DESCRIPTION -->
          <div style="border-bottom: 2px solid ${borderCol}; padding: 12px 14px;">
            <p style="font-size: 10.5px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0; text-transform: uppercase;">PROJECT DESCRIPTION</p>
            <p style="font-size: 8.5px; color: ${muted}; margin: 0; line-height: 1.4;">${formatMarkdownHTML(data.notesAndTerms || '') || data.subject || ''}</p>
          </div>

          <!-- BILLABLE ITEMS TABLE -->
          <div style="flex: 1; display: flex; flex-direction: column;">
            <table style="width: 100%; border-collapse: collapse; border-bottom: 2px solid ${borderCol};">
              <thead>
                <tr style="background: #dcdbd6; border-bottom: 2px solid ${borderCol};">
                  <th style="text-align: left; padding: 8px 10px; font-size: 9.5px; font-weight: 800; color: ${dark}; border-right: 2px solid ${borderCol}; uppercase;">BILLABLE ITEMS</th>
                  <th style="text-align: center; padding: 8px 6px; font-size: 9.5px; font-weight: 800; color: ${dark}; width: 45px; border-right: 2px solid ${borderCol}; uppercase;">QTY.</th>
                  <th style="text-align: right; padding: 8px 10px; font-size: 9.5px; font-weight: 800; color: ${dark}; width: 95px; uppercase;">AMOUNT</th>
                </tr>
              </thead>
              <tbody>
                ${items.map((item, idx) => `
                  <tr style="border-bottom: 1px solid ${borderCol};">
                    <td style="padding: 8px 10px; border-right: 2px solid ${borderCol};">
                      <p style="font-size: 9.5px; font-weight: 700; color: ${dark}; margin: 0;">${item.description}</p>
                      ${idx === 2 ? `<p style="font-size: 8px; color: ${muted}; margin: 2px 0 0 8px;">• extra details</p>` : ''}
                      ${idx === 4 ? `<p style="font-size: 8px; color: ${muted}; margin: 2px 0 0 8px;">• extra details<br/>• breakup details<br/>• tax included details</p>` : ''}
                    </td>
                    <td style="padding: 8px 6px; text-align: center; font-size: 9.5px; font-weight: 700; color: ${dark}; border-right: 2px solid ${borderCol};">
                      ${String(item.quantity).padStart(2, '0')}
                    </td>
                    <td style="padding: 8px 10px; text-align: right; white-space: nowrap; font-size: 9.5px; font-weight: 700; color: ${dark};">
                      ${m(item.total)}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <!-- Spacer -->
            <div style="flex: 1; min-height: 40px;"></div>

            <!-- SUBTOTAL -->
            <div style="border-top: 2px solid ${borderCol}; border-bottom: 1px solid ${borderCol}; padding: 7px 12px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 9px; font-weight: 800; color: ${dark}; text-transform: uppercase;">SUBTOTAL</span>
              <span style="font-size: 10px; font-weight: 800; color: ${dark};">${m(subtotal)}</span>
            </div>

            <!-- GST AND TAXES -->
            <div style="border-bottom: 2px solid ${borderCol}; padding: 7px 12px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <span style="font-size: 9px; font-weight: 800; color: ${dark}; text-transform: uppercase;">GST AND TAXES</span>
                <span style="font-size: 8px; color: ${muted}; margin-left: 6px;">• ${taxRate}% of Subtotal</span>
              </div>
              <span style="font-size: 10px; font-weight: 800; color: ${dark};">${m(taxAmount)}</span>
            </div>

            <!-- TOTAL BANNER -->
            <div style="background: ${dark}; color: #ffffff; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-size: 12px; font-weight: 900; letter-spacing: 0.5px; text-transform: uppercase;">TOTAL</span>
              <span style="font-size: ${autoFontSize(m(totalDue), 14)}px; font-weight: 900; white-space: nowrap;">${m(totalDue)}</span>
            </div>

            <!-- PAYMENT TERMS -->
            <div style="padding: 10px 12px;">
              <p style="font-size: 8.5px; font-weight: 700; color: ${muted}; margin: 0 0 3px 0; text-transform: uppercase;">PAYMENT TERMS</p>
              <p style="font-size: 8px; color: ${muted}; margin: 0; line-height: 1.35;">Please make the payment within 14 days from receiving the invoice without any deductions.</p>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
};

// ── Invoice 2 (Odoo Community Design) — Teal sidebar, Recipient & Sender blocks, Teal column headers, ACCOUNT DATA banner ──
function renderInvoiceOdooCommunity(data: InvoiceData, accentOverride: string, layoutState?: LayoutState | null): string {
  const { lineItems, subtotal, taxRate, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#1a202c';
  const muted = '#4a5568';
  const tealAccent = accentOverride || '#0097b2';
  const items = lineItems.length > 0 ? lineItems : [];

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; background: #ffffff; display: flex; position: relative;">
      <!-- Left Accent Sidebar Bar -->
      <div style="width: 24px; background: ${tealAccent}; min-height: 842px; flex-shrink: 0;"></div>

      <!-- Main Content Container -->
      <div style="flex: 1; padding: 32px 32px 32px 40px; display: flex; flex-direction: column; box-sizing: border-box;">

        ${showSection(layoutState, 'showHeader') ? `
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px;">
          <div style="display: flex; align-items: center; gap: 10px;">
            ${renderLogoMark(layoutState, 28, '6px')}
            <h1 style="font-size: 24px; font-weight: 800; color: ${tealAccent}; margin: 0; display: flex; align-items: center; gap: 8px;">
              <span>${data.businessName || ''}</span>
              <span style="color: #cbd5e0; font-weight: 300;">|</span>
              <span style="color: ${dark}; font-weight: 700;">Invoice</span>
            </h1>
          </div>
          <div style="text-align: right; white-space: nowrap; font-size: 11px;">
            <p style="font-size: 9.5px; font-weight: 800; color: #718096; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 2px 0;">INVOICE NO.</p>
            <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0 0 8px 0;">${data.invoiceNumber || ''}</p>
            <p style="font-size: 9.5px; font-weight: 800; color: #718096; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 2px 0;">INVOICE DATE</p>
            <p style="font-size: 11px; font-weight: 700; color: ${dark}; margin: 0;">${data.issueDate || ''}</p>
          </div>
        </div>
        ` : ''}

        <!-- Recipient & Sender Row -->
        <div style="display: flex; justify-content: space-between; margin-bottom: 32px; gap: 24px;">
          <!-- Recipient -->
          <div style="flex: 1;">
            <p style="font-size: 9.5px; font-weight: 800; color: #718096; letter-spacing: 0.5px; text-transform: uppercase; margin: 0 0 6px 0;">RECIPIENT</p>
            <p style="font-size: 12px; font-weight: 800; color: ${dark}; margin: 0 0 4px 0;">${data.clientName || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.45; white-space: pre-wrap;">${data.clientAddress || ''}</p>
            ${data.taxId ? `<p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">VAT no.: ${data.taxId}</p>` : ''}
            ${data.clientEmail ? `<p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">${data.clientEmail}</p>` : ''}
            ${data.clientPhone ? `<p style="font-size: 10px; color: ${muted}; margin: 1px 0 0 0;">${data.clientPhone}</p>` : ''}
          </div>

          <!-- Sender -->
          <div style="flex: 1; text-align: right;">
            <p style="font-size: 12px; font-weight: 800; color: ${dark}; margin: 18px 0 4px 0;">${data.businessName || ''}</p>
            <p style="font-size: 10px; color: ${muted}; margin: 0; line-height: 1.45; white-space: pre-wrap;">${data.senderAddress || ''}</p>
            ${data.senderTaxId ? `<p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">VAT no.: ${data.senderTaxId}</p>` : ''}
            ${data.senderEmail ? `<p style="font-size: 10px; color: ${muted}; margin: 4px 0 0 0;">${data.senderEmail}</p>` : ''}
            ${data.senderPhone ? `<p style="font-size: 10px; color: ${muted}; margin: 1px 0 0 0;">${data.senderPhone}</p>` : ''}
          </div>
        </div>

        <!-- Billable Items Table -->
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="border-bottom: 2px solid #e2e8f0;">
              <th style="text-align: left; padding: 8px 0; font-size: 10px; font-weight: 800; color: ${tealAccent}; text-transform: uppercase; letter-spacing: 0.5px;">DESCRIPTION</th>
              <th style="text-align: center; padding: 8px 0; font-size: 10px; font-weight: 800; color: ${tealAccent}; text-transform: uppercase; letter-spacing: 0.5px; width: 50px;">QTY</th>
              <th style="text-align: right; padding: 8px 0; font-size: 10px; font-weight: 800; color: ${tealAccent}; text-transform: uppercase; letter-spacing: 0.5px; width: 110px;">UNIT PRICE</th>
              <th style="text-align: right; padding: 8px 0; font-size: 10px; font-weight: 800; color: ${tealAccent}; text-transform: uppercase; letter-spacing: 0.5px; width: 108px;">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item) => `
              <tr style="border-bottom: 1px solid #edf2f7;">
                <td style="padding: 10px 0; font-size: 10px; font-weight: 600; color: ${dark};">${item.description}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted}; text-align: center;">${item.quantity}</td>
                <td style="padding: 10px 0; font-size: 10px; color: ${muted}; text-align: right;">${m(item.unitPrice)}</td>
                <td style="padding: 10px 0; font-size: 10px; font-weight: 700; color: ${dark}; text-align: right; white-space: nowrap;">${m(item.total)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        ${showSection(layoutState, 'showTotalDetails') ? `
        <!-- Totals Summary -->
        <div style="display: flex; justify-content: flex-end; margin-bottom: 28px;">
          <div style="width: 220px;">
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${muted}; padding: 3px 0;">
              <span>SUBTOTAL</span><span style="font-weight: 600; color: ${dark};">${m(subtotal)}</span>
            </div>
            ${taxRate > 0 ? `
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: ${tealAccent}; padding: 3px 0; font-weight: 600;">
              <span>TAX (${taxRate}%)</span><span>${m(taxAmount)}</span>
            </div>` : ''}
            <div style="display: flex; justify-content: space-between; font-size: 15px; font-weight: 800; color: ${tealAccent}; padding-top: 6px; margin-top: 4px;">
              <span>TOTAL</span><span>${m(totalDue)}</span>
            </div>
          </div>
        </div>
        ` : ''}

        <!-- ACCOUNT DATA Banner Box -->
        <div style="margin-bottom: 24px;">
          <div style="background: ${tealAccent}; color: #ffffff; font-size: 9.5px; font-weight: 800; letter-spacing: 0.5px; padding: 6px 10px; text-transform: uppercase; margin-bottom: 8px;">
            ACCOUNT DATA
          </div>
          <div style="font-size: 9.5px; color: ${muted}; line-height: 1.45; white-space: pre-wrap;">
            <p style="margin: 0 0 4px 0;">${data.accountDetails ? data.accountDetails : ''}</p>
          </div>
        </div>

        <div style="flex: 1;"></div>

        ${showSection(layoutState, 'showNotes') ? `
        <!-- Notes Section -->
        <div style="margin-bottom: 28px;">
          <p style="font-size: 10px; font-weight: 800; color: ${dark}; text-transform: uppercase; margin: 0 0 4px 0;">NOTES</p>
          <p style="font-size: 9.5px; color: ${muted}; margin: 0; line-height: 1.45; white-space: pre-wrap;">${formatMarkdownHTML(data.notesAndTerms || '') || ''}</p>
        </div>
        ` : ''}

        <!-- Footer -->
        <div style="border-top: 1px solid #e2e8f0; padding-top: 14px; display: flex; justify-content: space-between; font-size: 8.5px; color: #718096; line-height: 1.4;">
          <div>
            <p style="font-weight: 700; color: ${dark}; margin: 0;">${data.businessName || ''}</p>
            <p style="margin: 0;">${data.senderAddress ? data.senderAddress.replace(/\n/g, ' | ') : ''}</p>
          </div>
          <div style="text-align: center;">
            <p style="margin: 0;">${data.senderEmail || ''}</p>
            <p style="margin: 0;">${data.senderPhone || ''}</p>
          </div>
          <div style="text-align: right;">
            <p style="font-weight: 700; color: ${dark}; margin: 0;">CO. VAT</p>
            <p style="margin: 0;"></p>
          </div>
        </div>

      </div>
    </div>
  `;
}

// ── Mobile App Receipt (UI Modal Design) — White rounded card, green checkmark badge, item breakdown list, payment meta, purple Get PDF action button ──
const renderReceiptMobileAppUI: (data: InvoiceData, accentOverride: string, _layoutState?: LayoutState | null) => string = (data, accentOverride) => {
  const { lineItems, subtotal, taxAmount, totalDue } = computeTotals(data);
  const m = (n: number) => money(n, data);
  const dark = '#0f172a';
  const muted = '#64748b';
  const labelMuted = '#94a3b8';
  const purpleAccent = accentOverride || '#6366f1';
  const items = lineItems.length > 0 ? lineItems : [];

  return `
    <div style="font-family: 'Inter', sans-serif; color: ${dark}; width: 595px; min-height: 842px; box-sizing: border-box; padding: 40px 48px; background: #f1f5f9; display: flex; flex-direction: column; align-items: center; justify-content: center;">

      <!-- Card Container -->
      <div style="width: 100%; max-width: 440px; background: #ffffff; border-radius: 24px; padding: 32px 28px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08); box-sizing: border-box; display: flex; flex-direction: column; position: relative;">

        <!-- Close button X -->
        <div style="position: absolute; top: 20px; left: 24px; color: ${dark};">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </div>

        <!-- Green Checkmark Circle Badge -->
        <div style="display: flex; justify-content: center; margin-top: 10px; margin-bottom: 12px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: #dcfce7; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(34, 197, 94, 0.2);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
        </div>

        <!-- Title -->
        <h1 style="font-size: 22px; font-weight: 800; color: ${dark}; text-align: center; margin: 0 0 20px 0; letter-spacing: -0.5px;">Your Receipt</h1>
        <p style="text-align:center; margin:0 0 8px;">${data.businessName || ''}</p>

        <!-- Divider -->
        <div style="border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;"></div>

        <!-- Top Meta -->
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 10px;">
          <span style="color: ${labelMuted};">Date</span>
          <span style="font-weight: 700; color: ${dark};">${data.issueDate || ''}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 16px;">
          <span style="color: ${labelMuted};">Receipt ID</span>
          <span style="font-weight: 700; color: ${dark};">${data.receiptNumber || data.invoiceNumber || ''}</span>
        </div>

        <!-- Divider -->
        <div style="border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;"></div>

        <!-- Itemized List & Summation -->
        ${items.map((item) => `
          <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 10px;">
            <span style="color: ${labelMuted};">${item.description} <span style="font-weight: 600; color: ${muted};">x${item.quantity}</span></span>
            <span style="font-weight: 700; color: ${dark};">${m(item.total)}</span>
          </div>
        `).join('')}

        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 10px; margin-top: 4px;">
          <span style="color: ${labelMuted};">Subtotal</span>
          <span style="font-weight: 700; color: ${dark};">${m(subtotal)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 10px;">
          <span style="color: ${labelMuted};">Tax</span>
          <span style="font-weight: 700; color: ${dark};">${m(taxAmount ?? 0)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 800; color: ${dark}; margin-bottom: 16px; margin-top: 2px;">
          <span>Total</span>
          <span>${m(totalDue)}</span>
        </div>

        <!-- Divider -->
        <div style="border-bottom: 1px solid #f1f5f9; margin-bottom: 16px;"></div>

        <!-- Payment & Delivery Details -->
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 10px;">
          <span style="color: ${labelMuted};">Payment Method</span>
          <span style="font-weight: 700; color: ${dark};">${data.paymentMethod || ''}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 10px;">
          <span style="color: ${labelMuted};">Receipt ID</span>
          <span style="font-weight: 700; color: ${dark};">${data.receiptNumber || data.invoiceNumber || ''}</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11.5px; margin-bottom: 24px;">
          <span style="color: ${labelMuted};">Delivery day</span>
          <span style="font-weight: 700; color: ${dark};">${data.deliveryEstimate || ''}</span>
        </div>

        <!-- Thank you note -->
        <p style="font-size: 12px; font-weight: 700; color: ${dark}; text-align: center; margin: 0 0 20px 0;">Thank you for your purchase!</p>

        <!-- Purple Get PDF Action Button -->
        <div style="display: flex; justify-content: center;">
          <div style="width: 100%; background: ${purpleAccent}; color: #ffffff; font-size: 13px; font-weight: 800; padding: 12px 24px; border-radius: 12px; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35); box-sizing: border-box;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Get PDF Receipt</span>
          </div>
        </div>

      </div>
    </div>
  `;
};

interface TemplateConfig {
  name: string;
  accent: string;
  render: (data: InvoiceData, accent: string, layoutState?: LayoutState | null) => string;
}

// ── TEMPLATE REGISTRY ──
export const TEMPLATES: Record<string, TemplateConfig> = {
  // Invoice Templates
  tmpl_invoice_odoo_community: { name: 'Invoice 2 (Odoo Community)', accent: '#0097b2', render: renderInvoiceOdooCommunity },
  tmpl_invoice_2023_01: { name: 'Invoice 1 (2023)', accent: '#e87117', render: renderInvoice2023_01 },
  tmpl_invoice_2023_02: { name: 'Invoice 2 (2023)', accent: '#1f82de', render: renderInvoice2023_02 },
  tmpl_invoice_2023_03: { name: 'Invoice 3 (2023)', accent: '#4c63ed', render: renderInvoice2023_03 },
  tmpl_invoice_2023_52: { name: 'Invoice 5.2 (2023 Digital)', accent: '#eb296a', render: renderInvoice2023_52 },
  tmpl_invoice_2018_01: { name: 'Invoice 1 (2018 Legacy)', accent: '#8d19e2', render: renderInvoice2018_01 },
  tmpl_invoice_2018_02: { name: 'Invoice 2 (2018 Legacy)', accent: '#7a0fc8', render: renderInvoice2018_02 },
  tmpl_invoice_2023_04: { name: 'Invoice 4 (2023)', accent: '#ed1b99', render: renderInvoice2023_04 },
  tmpl_invoice_2023_06: { name: 'Invoice 6 (2023)', accent: '#7241fa', render: renderInvoice2023_06 },
  tmpl_invoice_2023_03_1: { name: 'Invoice 3.1 (2023 Full height)', accent: '#4c63ed', render: renderInvoice2023_03_1 },
  tmpl_invoice_2023_02_1: { name: 'Invoice 2.1 (2023 w/ Payment details)', accent: '#1f82de', render: renderInvoice2023_02_1 },
  tmpl_invoice_2023_05_1: { name: 'Invoice 5.1 (2023 Digital)', accent: '#d2255f', render: renderInvoice2023_05_1 },
  tmpl_invoice_2023_07: { name: 'Invoice 7 (2023)', accent: '#6735f4', render: renderInvoice2023_07 },
  tmpl_invoice_2023_08: { name: 'Invoice 8 (Grid Bordered)', accent: '#1a1a1a', render: renderInvoice2023_08 },
  tmpl_invoice_2018_03: { name: 'Invoice 3 (2018 Legacy)', accent: '#8d19e2', render: renderInvoice2018_03 },
  tmpl_invoice_2018_04: { name: 'Invoice 4 (2018 Legacy)', accent: '#8d19e2', render: renderInvoice2018_04 },


  // Quotation Templates
  tmpl_quotation_modern: { name: 'Modern Quotation', accent: '#0d9488', render: renderQuotationModern },
  tmpl_quotation_executive: { name: 'Executive Price Quote', accent: '#0f172a', render: renderQuotationExecutive },

  // Proposal Templates
  tmpl_proposal_corporate: { name: 'Corporate Project Proposal', accent: '#e11d48', render: renderProposalCorporate },
  tmpl_proposal_modern: { name: 'Modern Scope & Proposal', accent: '#2563eb', render: renderProposalModern },

  // Receipt Templates
  tmpl_receipt_mobile_app_ui: { name: 'Mobile App Receipt (Modal UI)', accent: '#6366f1', render: renderReceiptMobileAppUI },
  tmpl_receipt_purchase_ui: { name: 'Purchase Receipt (UI Design)', accent: '#1d61d1', render: renderReceiptPurchaseUI },
  tmpl_receipt_grid_bordered: { name: 'Grid Bordered Receipt', accent: '#1a1a1a', render: renderReceiptGridBordered },
  tmpl_receipt_official: { name: 'Official Payment Receipt', accent: '#059669', render: renderReceiptOfficial },
  tmpl_receipt_compact: { name: 'Compact Receipt Slip', accent: '#4f46e5', render: renderReceiptCompact },

  // Purchase Order Templates
  tmpl_purchase_order_global_company: { name: 'Global Company Dotted Purchase Order', accent: '#111827', render: renderPurchaseOrderGlobalCompany },
  tmpl_purchase_order_minimal_grid: { name: 'Minimalist Grid Purchase Order', accent: '#0f172a', render: renderPurchaseOrderMinimalGrid },
  tmpl_purchase_order_cyan_clean: { name: 'Clean Teal Purchase Order', accent: '#00a8b5', render: renderPurchaseOrderCyanClean },
  tmpl_purchase_order_templatelab: { name: 'Modern Orange Purchase Order', accent: '#e0531c', render: renderPurchaseOrderOrangeWave },
  tmpl_purchase_order_classic: { name: 'Classic Purchase Order (Grid Table)', accent: '#3b5998', render: renderPurchaseOrderClassic },
  tmpl_purchase_order_standard: { name: 'Standard Purchase Order', accent: '#0284c7', render: renderPurchaseOrderStandard },
  tmpl_purchase_order_corporate: { name: 'Corporate P.O. Format', accent: '#0f172a', render: renderPurchaseOrderCorporate },
};

export const DOCUMENT_TYPE_TEMPLATES: Record<string, Array<{ template_id: string; name: string; thumbnail_url: string; tier: 'free' | 'pro' }>> = {
  invoice: [
    { template_id: 'tmpl_invoice_odoo_community', name: 'Invoice 2 (Odoo Community)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_08', name: 'Invoice 8 (Grid Bordered)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_01', name: 'Invoice 1 (2023)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_02', name: 'Invoice 2 (2023)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_03', name: 'Invoice 3 (2023)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_52', name: 'Invoice 5.2 (2023 Digital)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2018_01', name: 'Invoice 1 (2018 Legacy)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2018_02', name: 'Invoice 2 (2018 Legacy)', thumbnail_url: '', tier: 'free' },
  ],
  proposal: [
    {template_id:'tmpl_proposal_corporate',name:'Corporate Project Proposal',thumbnail_url:'',tier:'free'},
    {template_id:'tmpl_proposal_modern',name:'Modern Scope & Proposal',thumbnail_url:'',tier:'free'},
  ],
  quotation: [
    { template_id: 'tmpl_invoice_2023_01', name: 'Quotation 1 (2023)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_odoo_community', name: 'Quotation 2 (Odoo Community)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_08', name: 'Quotation 8 (Grid Bordered)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_02', name: 'Quotation 2 (2023)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_03', name: 'Quotation 3 (2023)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2023_52', name: 'Quotation 5.2 (2023 Digital)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2018_01', name: 'Quotation 1 (2018 Legacy)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_invoice_2018_02', name: 'Quotation 2 (2018 Legacy)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_quotation_modern', name: 'Modern Quotation', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_quotation_executive', name: 'Executive Price Quote', thumbnail_url: '', tier: 'free' },
  ],
  receipt: [
    { template_id: 'tmpl_receipt_mobile_app_ui', name: 'Mobile App Receipt (Modal UI)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_receipt_purchase_ui', name: 'Purchase Receipt (UI Design)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_receipt_grid_bordered', name: 'Grid Bordered Receipt', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_receipt_official', name: 'Official Payment Receipt', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_receipt_compact', name: 'Compact Receipt Slip', thumbnail_url: '', tier: 'free' },
  ],
  purchase_order: [
    { template_id: 'tmpl_purchase_order_global_company', name: 'Global Company Dotted Purchase Order', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_purchase_order_minimal_grid', name: 'Minimalist Grid Purchase Order', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_purchase_order_cyan_clean', name: 'Clean Teal Purchase Order', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_purchase_order_templatelab', name: 'Modern Orange Purchase Order', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_purchase_order_classic', name: 'Classic Purchase Order (Grid Table)', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_purchase_order_standard', name: 'Standard Purchase Order', thumbnail_url: '', tier: 'free' },
    { template_id: 'tmpl_purchase_order_corporate', name: 'Corporate P.O. Format', thumbnail_url: '', tier: 'free' },
  ],
};

export function transformDocTypeText(text: string, docType: string): string {
  if (!text || typeof text !== 'string') return text;
  const dt = docType ? docType.toLowerCase() : 'invoice';

  if (dt === 'quotation' || dt === 'quote') {
    return text
      .replace(/\bTax Invoice\b/gi, 'Quotation')
      .replace(/\bTAX INVOICE\b/g, 'QUOTATION')
      .replace(/\bInvoice number\b/gi, 'Quotation number')
      .replace(/\bInvoice Date\b/gi, 'Quotation Date')
      .replace(/\bInvoice date\b/gi, 'Quotation date')
      .replace(/\bInvoice of\b/gi, 'Quotation of')
      .replace(/\bInvoice #\b/gi, 'Quotation #')
      .replace(/\bINVOICE NO\.\b/g, 'QUOTATION NO.')
      .replace(/\bINVOICE DATE\b/g, 'QUOTATION DATE')
      .replace(/\bINVOICE NO\b/g, 'QUOTATION NO')
      .replace(/\bINVOICE #\b/g, 'QUOTATION #')
      .replace(/\bINVOICE\b/g, 'QUOTATION')
      .replace(/\bInvoice\b/g, 'Quotation')
      .replace(/\binvoice\b/g, 'quotation');
  }

  if (dt === 'receipt') {
    return text
      .replace(/\bTax Invoice\b/gi, 'Receipt')
      .replace(/\bTAX INVOICE\b/g, 'RECEIPT')
      .replace(/\bInvoice number\b/gi, 'Receipt number')
      .replace(/\bInvoice Date\b/gi, 'Payment Date')
      .replace(/\bInvoice date\b/gi, 'Payment date')
      .replace(/\bInvoice of\b/gi, 'Receipt of')
      .replace(/\bInvoice #\b/gi, 'Receipt #')
      .replace(/\bINVOICE NO\.\b/g, 'RECEIPT NO.')
      .replace(/\bINVOICE DATE\b/g, 'PAYMENT DATE')
      .replace(/\bINVOICE NO\b/g, 'RECEIPT NO')
      .replace(/\bINVOICE #\b/g, 'RECEIPT #')
      .replace(/\bBilled to\b/gi, 'Received from')
      .replace(/\bBILLED TO\b/g, 'RECEIVED FROM')
      .replace(/\bRECIPIENT\b/g, 'CUSTOMER / PAYER')
      .replace(/\bINVOICE\b/g, 'RECEIPT')
      .replace(/\bInvoice\b/g, 'Receipt')
      .replace(/\binvoice\b/g, 'receipt');
  }

  if (dt === 'purchase_order' || dt === 'po') {
    return text
      .replace(/\bTax Invoice\b/gi, 'Purchase Order')
      .replace(/\bTAX INVOICE\b/g, 'PURCHASE ORDER')
      .replace(/\bInvoice number\b/gi, 'PO Number')
      .replace(/\bInvoice Date\b/gi, 'PO Date')
      .replace(/\bInvoice date\b/gi, 'PO Date')
      .replace(/\bDue date\b/gi, 'Delivery Date')
      .replace(/\bDue Date\b/gi, 'Delivery Date')
      .replace(/\bInvoice of\b/gi, 'Purchase Order of')
      .replace(/\bInvoice #\b/gi, 'PO #')
      .replace(/\bINVOICE NO\.\b/g, 'PO NO.')
      .replace(/\bINVOICE DATE\b/g, 'PO DATE')
      .replace(/\bINVOICE NO\b/g, 'PO NO')
      .replace(/\bINVOICE #\b/g, 'PO #')
      .replace(/\bBilled to\b/gi, 'Vendor / Supplier')
      .replace(/\bBILLED TO\b/g, 'VENDOR / SUPPLIER')
      .replace(/\bRECIPIENT\b/g, 'VENDOR')
      .replace(/\bINVOICE\b/g, 'PURCHASE ORDER')
      .replace(/\bInvoice\b/g, 'Purchase Order')
      .replace(/\binvoice\b/g, 'purchase order');
  }

  if (dt === 'proposal') {
    return text
      .replace(/\bTax Invoice\b/gi, 'Proposal')
      .replace(/\bTAX INVOICE\b/g, 'PROPOSAL')
      .replace(/\bInvoice number\b/gi, 'Proposal Ref')
      .replace(/\bInvoice Date\b/gi, 'Submission Date')
      .replace(/\bInvoice date\b/gi, 'Submission date')
      .replace(/\bDue date\b/gi, 'Valid Until')
      .replace(/\bDue Date\b/gi, 'Valid Until')
      .replace(/\bInvoice of\b/gi, 'Proposal for')
      .replace(/\bInvoice #\b/gi, 'Proposal #')
      .replace(/\bINVOICE NO\.\b/g, 'PROPOSAL REF.')
      .replace(/\bINVOICE DATE\b/g, 'SUBMISSION DATE')
      .replace(/\bINVOICE NO\b/g, 'PROPOSAL REF')
      .replace(/\bINVOICE #\b/g, 'PROPOSAL #')
      .replace(/\bBilled to\b/gi, 'Prepared for')
      .replace(/\bBILLED TO\b/g, 'PREPARED FOR')
      .replace(/\bRECIPIENT\b/g, 'PROSPECT')
      .replace(/\bINVOICE\b/g, 'PROPOSAL')
      .replace(/\bInvoice\b/g, 'Proposal')
      .replace(/\binvoice\b/g, 'proposal');
  }

  return text;
}

export function renderTemplate(
  templateId: string,
  data: Record<string, unknown>,
  layoutState: LayoutState | null,
  accentColorOverride: string,
  documentType: string = 'invoice'
): string {
  let cfg = TEMPLATES[templateId];
  if (!cfg) {
    const list = DOCUMENT_TYPE_TEMPLATES[documentType] || DOCUMENT_TYPE_TEMPLATES.invoice;
    cfg = TEMPLATES[list[0].template_id] || TEMPLATES.tmpl_invoice_2023_01;
  }
  const accent = /^#[a-f0-9]{3,8}$/i.test(accentColorOverride) ? accentColorOverride : cfg.accent;
  const bound = bindDocumentText(data);
  const safeLayout=layoutState ? {...layoutState,logoUrl:/^(?:https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(layoutState.logoUrl||'')?escapeDocumentText(layoutState.logoUrl||''):''} : null;
  let html = cfg.render(bound.data as InvoiceData, accent, safeLayout);

  const effectiveDocType = typeof data.documentType === 'string' ? data.documentType : documentType;
  if (effectiveDocType !== 'invoice') {
    html = transformDocTypeText(html, effectiveDocType);
  }

  return bound.restore(html, true);
}

export function getTemplateAccent(templateId: string): string {
  return (TEMPLATES[templateId] || TEMPLATES.tmpl_invoice_2023_01).accent;
}

export const INVOICE_TEMPLATE_IDS = Object.keys(TEMPLATES);
export const INVOICE_TEMPLATE_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(TEMPLATES).map(([id, cfg]) => [id, cfg.name])
);
