export const MAX_ASSET_LENGTH = 160000;
export const MAX_DOCUMENT_ASSETS = 6;
export const ASSET_ROLES = ['logo', 'image', 'signature'];

export function validAsset(asset) {
  return !!asset && typeof asset === 'object' && typeof asset.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(asset.id) &&
    ASSET_ROLES.includes(asset.role) && typeof asset.name === 'string' && asset.name.length <= 120 &&
    typeof asset.src === 'string' && asset.src.length <= MAX_ASSET_LENGTH &&
    /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(asset.src) &&
    Number.isInteger(asset.width) && asset.width > 0 && asset.width <= 1024 &&
    Number.isInteger(asset.height) && asset.height > 0 && asset.height <= 1024;
}

export function documentAssets(raw) {
  return Array.isArray(raw) ? raw.filter(validAsset).slice(0, MAX_DOCUMENT_ASSETS) : [];
}

/** Fit artwork into actual free space. Coordinates use the document's own
 * page units; aspect ratio is preserved and content is never displaced.
 * When a crowded page has no suitable space, use a new page.
 */
export function placeAsset(asset, elements, pageWidth = 595, pageHeight = 842) {
  const margin = Math.min(40, pageWidth / 12), gap = 8;
  const limit = asset.role === 'logo' ? [120, 54] : asset.role === 'signature' ? [150, 65] : [260, 180];
  const scale = Math.min(limit[0] * pageWidth / 595 / asset.width, limit[1] * pageWidth / 595 / asset.height, (pageWidth - margin * 2) / asset.width);
  const w = asset.width * scale, h = asset.height * scale;
  const occupied = elements.filter(el => !el.hidden && !(el.type === 'text' && !String(el.text || '').trim()) &&
    // Large template backgrounds and accent bands are decoration, not content.
    !(el.type === 'rect' && (el.w >= pageWidth * .85 && el.h >= pageHeight * .8 || el.w <= margin / 2 && el.h >= pageHeight * .8)));
  const overlaps = box => occupied.some(el => box.x < el.x + el.w + gap && box.x + box.w + gap > el.x && box.y < el.y + el.h + gap && box.y + box.h + gap > el.y);
  const pages = Math.max(1, Math.ceil(Math.max(pageHeight, ...occupied.map(el => el.y + el.h)) / pageHeight));
  const scan = (page, start, end, direction = 1) => {
    const xs = asset.role === 'signature' ? [pageWidth - margin - w, margin, (pageWidth - w) / 2] : [margin, pageWidth - margin - w, (pageWidth - w) / 2];
    for (let y = start; direction > 0 ? y <= end : y >= end; y += direction * 4) {
      for (const x of xs) {
        const box = {x, y:page * pageHeight + y, w, h};
        if (!overlaps(box)) return box;
      }
    }
  };
  if (asset.role === 'logo') {
    const header = scan(0, margin, Math.min(180, pageHeight / 4) - h);
    if (header) return header;
  }
  for (let page = asset.role === 'logo' ? 0 : pages - 1; page < pages; page++) {
    const box = asset.role === 'signature'
      ? scan(page, pageHeight - margin - h, pageHeight / 2, -1)
      : scan(page, asset.role === 'logo' ? margin : pageHeight / 3, pageHeight - margin - h);
    if (box) return box;
  }
  return { x:margin, y:pages * pageHeight + margin, w, h };
}

export function assetElements(assets, base, pageWidth = 595, pageHeight = 842) {
  const placed = [];
  for (const asset of documentAssets(assets)) placed.push({
    id:asset.id, type:'image', src:asset.src, ...placeAsset(asset, [...base, ...placed], pageWidth, pageHeight),
    section:asset.role === 'logo' ? 'header' : asset.role === 'signature' ? 'footer' : 'custom', zIndex:20,
  });
  return placed;
}
