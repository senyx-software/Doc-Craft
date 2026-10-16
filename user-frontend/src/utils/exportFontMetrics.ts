/** html2canvas measures fonts with an invisible inline 1×1 image in the
 * source document. Tailwind's block-image reset moves that measuring image
 * onto a new line, giving every exported text run an incorrect baseline.
 * Restore only that invisible ruler; document images retain their styling.
 */
export async function withExportFontMetrics<T>(capture: () => Promise<T>, owner: Document = document): Promise<T> {
  const style = owner.createElement('style');
  style.textContent = 'body > div[style*="visibility: hidden"] > img[width="1"][height="1"] { display: inline !important; }';
  owner.head.appendChild(style);
  try { return await capture(); }
  finally { style.remove(); }
}
