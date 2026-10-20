/** Persist only supported canvas presentation. Semantic fields stay server-owned. */
const numbers = new Set(['x','y','w','h','rotation','zIndex','opacity','shadowBlur','shadowOffsetX','shadowOffsetY','fontSize','fontWeight','lineHeight','strokeWidth','radius','headerHeight','rowHeight']);
const booleans = new Set(['locked','hidden','shadowEnabled','flipH','flipV','italic','strikethrough','underline']);
const strings = new Set(['id','type','section','groupId','color','align','fontFamily','stroke','fill','shadowColor','lineStyle','headerBg','headerColor','cellColor','borderColor','rowStripeColor']);
const types = new Set(['text','rect','ellipse','line','image','table']);
function element(value, custom, identity='') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid canvas element');
  const result = {};
  for (const [key,item] of Object.entries(value)) {
    if (numbers.has(key) && typeof item === 'number' && Number.isFinite(item) && Math.abs(item) <= 20000) result[key] = item;
    else if (booleans.has(key) && typeof item === 'boolean') result[key] = item;
    else if (strings.has(key) && typeof item === 'string' && item.length <= 160 && !/[<>\x00-\x1f]/.test(item)) result[key] = item;
    else if ((custom || /^upl_static_[a-zA-Z0-9_]+$/.test(identity)) && key === 'text' && typeof item === 'string' && item.length <= 4000) result[key] = item;
    else if (custom && key === 'src' && typeof item === 'string' && item.length <= 65536 && /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(item)) result[key] = item;
    else if (custom && ['rows','columns','cellFormats'].includes(key) && JSON.stringify(item).length <= 12000 && !/__proto__|constructor|prototype/.test(JSON.stringify(item))) result[key] = structuredClone(item);
    // Semantic text on built-in elements is never accepted through a layout.
    else if (key === 'text' || key === 'semanticField') continue;
    else throw new Error('Unsupported canvas property: '+key);
  }
  if (custom && (typeof result.id !== 'string' || !types.has(result.type) || !['x','y','w','h','zIndex'].every(key => typeof result[key] === 'number'))) throw new Error('Incomplete custom canvas element');
  return result;
}
export function canvasLayout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || JSON.stringify(input).length > 80000) throw new Error('Invalid canvas layout');
  const {elementOverrides = {},customElements = [],pageWidth = 595,pageHeight = 842,pageBackgroundColor = '#ffffff'} = input;
  if (!elementOverrides || typeof elementOverrides !== 'object' || Array.isArray(elementOverrides) || Object.keys(elementOverrides).length > 200 || !Array.isArray(customElements) || customElements.length > 100) throw new Error('Canvas limit exceeded');
  if (![pageWidth,pageHeight].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 100 && value <= 5000) || typeof pageBackgroundColor !== 'string' || !/^#[a-f0-9]{3,8}$/i.test(pageBackgroundColor)) throw new Error('Invalid canvas page');
  const overrides = Object.fromEntries(Object.entries(elementOverrides).map(([id,value]) => {
    if (!/^[a-zA-Z0-9_-]{1,160}$/.test(id) || ['__proto__','constructor','prototype'].includes(id)) throw new Error('Invalid canvas ID');
    return [id, element(value,false,id)];
  }));
  return {elementOverrides:overrides,customElements:customElements.map(value => element(value,true)),pageWidth,pageHeight,pageBackgroundColor};
}
