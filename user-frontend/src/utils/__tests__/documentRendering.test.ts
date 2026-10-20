import {it,expect} from 'vitest';
import {renderTemplate,INVOICE_TEMPLATE_IDS,DOCUMENT_TYPE_TEMPLATES,formatMarkdownHTML} from '../templateRenderer';
import {getElementsForTemplate} from '../invoiceElements';
const ready={businessName:'Invoice Solutions',clientName:'Acme',invoiceNumber:'INV-1',issueDate:'2026-10-13',dueDate:'2026-11-13',currency:'LKR',taxRate:0,paymentMethod:'Cash',subject:'Project',lineItems:[{description:'Invoice integration',quantity:1,unitPrice:120000}]};
it.each([['quotation','quoteNumber'],['receipt','receiptNumber'],['purchase_order','poNumber']])('renders %s previews with matching document-number aliases', (type,alias)=>{
 for(const template of DOCUMENT_TYPE_TEMPLATES[type]) {
  const data={...ready,documentType:type,[alias]:ready.invoiceNumber};
  const html=renderTemplate(template.template_id,data,null,'#0097b2',type);
  expect(html,template.template_id).toContain(ready.businessName);
  expect(html).not.toContain('__DOCCRAFT_VALUE_');
 }
});
it('rejects conflicting document numbers before rendering',()=>{
 expect(()=>renderTemplate(DOCUMENT_TYPE_TEMPLATES.quotation[0].template_id,{...ready,quoteNumber:'OTHER'},null,'#0097b2','quotation')).toThrow('Conflicting aliases for invoiceNumber');
});
for(const type of ['invoice','quotation','proposal','receipt','purchase_order'])it('T39-T41 literal values and absent contacts preserved for every '+type+' template',()=>{
 for(const template of DOCUMENT_TYPE_TEMPLATES[type]) {
  const html=renderTemplate(template.template_id,{...ready,documentType:type},null,'#0097b2',type);
  expect(html,template.template_id).toContain('Invoice Solutions');expect(html,template.template_id).not.toContain('Quotation Solutions');
  expect(html,template.template_id).not.toContain('4945 Forest Avenue');expect(html).not.toContain('email@gmail.com');expect(html).not.toContain('BANK: PENTOS');
  const elements=getElementsForTemplate(template.template_id,{...ready,documentType:type},'#0097b2');
  if(elements) {const text=elements.filter(el=>el.type==='text').map(el=>el.type==='text'?el.text:'').join('\n');expect(text,template.template_id).toContain('Invoice Solutions');expect(text).not.toContain('Quotation Solutions');}
 }
});
it('T40 all HTML templates escape arbitrary text values and attribute markup',()=>{
 const input='<img src=x onerror="audit()">Invoice & Sons';
 for(const id of INVOICE_TEMPLATE_IDS) {
  const html=renderTemplate(id,{...ready,businessName:input,senderAddress:input,notesAndTerms:input,lineItems:[{description:input,quantity:1,unitPrice:2}]},null,'#000','invoice');
  expect(html,id).not.toContain('<img src=x onerror');expect(html,id).toContain('&lt;img');expect(html).toContain('&amp; Sons');
 }
 expect(formatMarkdownHTML('<img src=x onerror=alert(1)> **safe**')).toContain('&lt;img');expect(formatMarkdownHTML('**safe**')).toContain('<strong>safe</strong>');
});
it('T02/T41 HTML and canvas show exactly the committed address and item values',()=>{
 const address='No 40/20, Sagabo Mawatha, Diggala, Keselwatta, Panadura';
 const data={...ready,senderAddress:address,documentType:'quotation'};
 expect(renderTemplate('tmpl_invoice_2023_01',data,null,'#000','quotation')).toContain(address);
 const text=getElementsForTemplate('tmpl_invoice_2023_01',data,'#000')!.filter(el=>el.type==='text').map(el=>el.type==='text'?el.text:'').join('\n');
 expect(text).toContain(address);expect(text).toContain('Invoice integration');expect(text).toContain('120,000');
});

it('T39 totals never invent tax, shipping, or a different currency',()=>{
 for(const template of DOCUMENT_TYPE_TEMPLATES.purchase_order) {
  const data={...ready,documentType:'purchase_order'};const html=renderTemplate(template.template_id,data,null,'#000','purchase_order');
  expect(html,template.template_id).not.toContain('18% of Subtotal');expect(html).not.toContain('120010.00');expect(html).not.toContain('121000.00');expect(html).not.toContain('£ 120000');
  const text=getElementsForTemplate(template.template_id,data,'#000')!.filter(el=>el.type==='text').map(el=>el.type==='text'?el.text:'').join(' ');
  expect(text,template.template_id).not.toContain('18% of Subtotal');expect(text).not.toContain('120010.00');expect(text).not.toContain('121000.00');expect(text).not.toContain('$120000');expect(text).not.toContain('£ 120000');
 }
});
it('field-specific locale and date formatting is consistent in HTML and canvas',()=>{
 const data={...ready,currency:'EUR',locale:'de-DE',dateFormat:'DD/MM/YYYY'};
 const html=renderTemplate('tmpl_invoice_odoo_community',data,null,'#0097b2','invoice');expect(html).toContain('120.000,00');expect(html).toContain('13/10/2026');
 const elements=getElementsForTemplate('tmpl_invoice_odoo_community',data,'#0097b2')!;const text=elements.filter(el=>el.type==='text').map(el=>el.type==='text'?el.text:'').join('\n');expect(text).toContain('120.000,00');expect(text).toContain('13/10/2026');expect(text).not.toContain('234W2Q3R');
});
it('empty drafts leave financial amounts blank rather than presenting a completed zero total',()=>{
 const html=renderTemplate('tmpl_invoice_odoo_community',{},null,'#0097b2','invoice');expect(html).not.toContain('0.00');
 const elements=getElementsForTemplate('tmpl_invoice_odoo_community',{},'#0097b2')!;expect(elements.find(el=>el.id==='totals_total_value')).toMatchObject({text:''});
 const free={...ready,lineItems:[{description:'Free consultation',quantity:1,unitPrice:0}]};expect(renderTemplate('tmpl_invoice_odoo_community',free,null,'#0097b2','invoice')).toContain('0.00');
});
