import { expect, it } from 'vitest';
import { prepareTemplateUpload } from '../templateUpload';

it('encodes PDF bytes without treating binary content as HTML', async () => {
  const bytes = new Uint8Array([37, 80, 68, 70, 45, 255, 0, 128]);
  const payload = await prepareTemplateUpload(new File([bytes], 'Company.PDF'), 'quotation');
  expect(payload).toEqual({name:'Company', document_type:'quotation', pdf_base64:btoa(String.fromCharCode(...bytes))});
});

it('accepts uppercase JSON extensions and fills omitted template metadata', async () => {
  const payload = await prepareTemplateUpload(new File(['{"html":"<p>{{businessName}}</p>","assets":{}}'], 'Company.JSON'), 'proposal');
  expect(payload).toMatchObject({name:'Company', document_type:'proposal', html:'<p>{{businessName}}</p>', assets:{}});
});

it('keeps explicit bundle metadata and HTML uploads supported', async () => {
  const bundle = {name:'Invoice', document_type:'invoice', html:'<p>Test</p>'};
  expect(await prepareTemplateUpload(new File([JSON.stringify(bundle)], 'Company.json'), 'quotation')).toEqual(bundle);
  expect(await prepareTemplateUpload(new File(['<p>Test</p>'], 'Company.HTML'), 'receipt')).toEqual({name:'Company', document_type:'receipt', html:'<p>Test</p>', assets:{}});
});

it('explains invalid bundles, unsupported files and excessive PDF sizes', async () => {
  await expect(prepareTemplateUpload(new File(['{'], 'bad.json'), 'invoice')).rejects.toThrow('invalid JSON');
  await expect(prepareTemplateUpload(new File(['{}'], 'bad.json'), 'invoice')).rejects.toThrow('html string');
  await expect(prepareTemplateUpload(new File(['test'], 'bad.docx'), 'invoice')).rejects.toThrow('PDF, HTML, or JSON');
  await expect(prepareTemplateUpload(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.pdf'), 'invoice')).rejects.toThrow('5 MB');
});
