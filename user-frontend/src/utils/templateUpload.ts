const MAX_PDF_BYTES = 5 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 900000;

export async function prepareTemplateUpload(file: File, documentType: string): Promise<Record<string, unknown>> {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (!['pdf', 'html', 'htm', 'json'].includes(extension || '')) {
    throw new Error('Choose a PDF, HTML, or JSON template file.');
  }
  if (file.size > (extension === 'pdf' ? MAX_PDF_BYTES : MAX_BUNDLE_BYTES)) {
    throw new Error(extension === 'pdf' ? 'Choose a PDF no larger than 5 MB.' : 'Choose an HTML or JSON template under 900 KB.');
  }
  const name = file.name.replace(/\.[^.]+$/, '').trim().slice(0, 100) || 'Company template';
  if (extension === 'pdf') {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 32768) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
    }
    return { name, document_type: documentType, pdf_base64: btoa(binary) };
  }
  const text = await file.text();
  if (extension !== 'json') {
    return { name, document_type: documentType, html: text, assets: {} };
  }
  let bundle: unknown;
  try { bundle = JSON.parse(text); }
  catch { throw new Error('This file contains invalid JSON. Upload an HTML file or a JSON template bundle.'); }
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle) || !('html' in bundle) || typeof bundle.html !== 'string') {
    throw new Error('A JSON template bundle must contain an html string, with optional name, document_type, and embedded assets.');
  }
  return { name, document_type: documentType, ...bundle };
}
