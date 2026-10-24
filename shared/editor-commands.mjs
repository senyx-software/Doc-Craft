import { canvasLayout } from './canvas-layout.mjs';
import { canvasField } from './canvas-fields.mjs';

const colors = {blue:'#0000ff',red:'#ff0000',green:'#008000',black:'#000000',white:'#ffffff',purple:'#800080',orange:'#ffa500',yellow:'#ffff00',gray:'#808080',grey:'#808080',teal:'#008080',navy:'#000080'};
const safeId = value => typeof value==='string'&&/^[a-zA-Z0-9_-]{1,160}$/.test(value)&&!['__proto__','constructor','prototype'].includes(value);
function invalid(message='Please clarify which element and property to change.') { throw Object.assign(new Error(message),{code:'EDITOR_CLARIFICATION',statusCode:422,retryable:false}); }

export function editorContext(input) {
  if(!input||typeof input!=='object'||Array.isArray(input)||JSON.stringify(input).length>160000||Object.keys(input).some(key=>!['elements','selectedIds'].includes(key))||!Array.isArray(input.elements)||input.elements.length>1000||!Array.isArray(input.selectedIds)||input.selectedIds.length>100)invalid('Invalid editor context');
  const elements=input.elements.map(item=>{
    if(!item||!safeId(item.id)||!['text','rect','ellipse','line','image','table'].includes(item.type))invalid('Invalid editor element');
    const result={id:item.id,type:item.type,label:String(item.label||'').slice(0,120)};
    for(const key of ['x','y','w','h','fontSize','fontWeight','rotation','opacity'])if(item[key]!==undefined){if(typeof item[key]!=='number'||!Number.isFinite(item[key])||Math.abs(item[key])>20000)invalid('Invalid editor geometry');result[key]=item[key];}
    return result;
  });
  if(new Set(elements.map(el=>el.id)).size!==elements.length||input.selectedIds.some(id=>!safeId(id)||!elements.some(el=>el.id===id)))invalid('Editor selection is unavailable');
  return {elements,selectedIds:[...new Set(input.selectedIds)]};
}

function targetElements(target,context) {
  if(!target||!['selected','heading','element'].includes(target.kind))invalid();
  let found;
  if(target.kind==='selected')found=context.elements.filter(el=>context.selectedIds.includes(el.id));
  else if(target.kind==='heading')found=context.elements.filter(el=>el.type==='text'&&(/^(?:header_title|title_quote|title_receipt|title_po|receipt_title)$/.test(el.id)||/^(?:invoice|quotation|proposal|receipt|purchase order)$/i.test(el.label.trim())));
  else found=context.elements.filter(el=>el.id===target.id);
  if(!found.length||target.kind==='heading'&&found.length!==1)invalid('Which element should I change? Select it in the preview or name its label.');
  return found;
}

const patchProperties=new Set(['x','y','w','h','rotation','opacity','fontSize','fontWeight','fontFamily','color','fill','stroke','strokeWidth','align','italic','underline','hidden','text','scale']);
export const editorToolSchema={type:'object',properties:{operations:{type:'array',minItems:1,maxItems:12,items:{type:'object',properties:{operation:{type:'string',enum:['update','remove','add']},target:{type:'object',properties:{kind:{type:'string',enum:['selected','heading','element']},id:{type:'string',maxLength:160}},required:['kind'],additionalProperties:false},patch:{type:'object',properties:Object.fromEntries([...patchProperties].map(key=>[key,['x','y','w','h','rotation','opacity','fontSize','fontWeight','strokeWidth','scale'].includes(key)?{type:'number'}:['italic','underline','hidden'].includes(key)?{type:'boolean'}:{type:'string',maxLength:key==='text'?1000:160}])),additionalProperties:false},element:{type:'object',properties:{type:{type:'string',enum:['text','rect','ellipse','line']},text:{type:'string',maxLength:1000},x:{type:'number'},y:{type:'number'},w:{type:'number'},h:{type:'number'},fill:{type:'string'},color:{type:'string'},fontSize:{type:'number'}},required:['type','x','y','w','h'],additionalProperties:false},evidence:{type:'string',minLength:1,maxLength:4000}},required:['operation','evidence'],additionalProperties:false}}},required:['operations'],additionalProperties:false};

export function applyEditorOperations(layoutInput,contextInput,operations,message,operationId='edit') {
  const context=editorContext(contextInput), layout=canvasLayout(layoutInput||{});
  if(!Array.isArray(operations)||!operations.length||operations.length>12)invalid();
  if(!/\b(?:change|set|make|move|resize|enlarge|shrink|increase|decrease|align|hide|remove|delete|add|insert|rename|bold|italic|colour|color)\b/i.test(message)||/^\s*(?:why|what|how|when|is|does|can you explain)\b/i.test(message))invalid('This message does not request a visual edit.');
  const summaries=[];
  for(const [index,operation] of operations.entries()) {
    if(!operation||typeof operation!=='object'||Object.keys(operation).some(key=>!['operation','target','patch','element','evidence'].includes(key))||typeof operation.evidence!=='string'||!operation.evidence||!message.includes(operation.evidence))invalid('Visual edits need evidence from your current message.');
    if(operation.operation==='add') {
      if(!/\b(add|insert)\b/i.test(message)||!operation.element||!['text','rect','ellipse','line'].includes(operation.element.type))invalid();
      const element={...operation.element,id:'chat_'+operationId.replace(/[^a-zA-Z0-9_]/g,'_').slice(0,70)+'_'+index,zIndex:100+layout.customElements.length};
      if(element.text&&!message.includes(element.text))invalid('Provide the exact text to insert.');
      for(const key of ['x','y','w','h'])if(typeof element[key]!=='number'||!Number.isFinite(element[key]))invalid();
      if(element.w<1||element.h<1)invalid();
      layout.customElements.push(element);summaries.push('Added the '+element.type+' element.');continue;
    }
    const targets=targetElements(operation.target,context);
    if(operation.target.kind==='selected'&&targets.length!==1&&/\b(?:it|selected element|selected text)\b/i.test(operation.evidence))invalid('Which element should I change? Select one element in the preview.');
    if(operation.target.kind==='element'&&!context.selectedIds.includes(operation.target.id)&&!targets.some(el=>message.toLowerCase().includes(el.id.toLowerCase())||el.label.trim().length>2&&message.toLowerCase().includes(el.label.trim().toLowerCase())))invalid('Select the element or specify its label before changing it.');
    if(operation.operation==='remove') {
      if(!/\b(?:remove|hide|delete)\b/i.test(message))invalid();
      for(const target of targets) {
        layout.customElements=layout.customElements.filter(el=>el.id!==target.id);
        layout.elementOverrides[target.id]={...layout.elementOverrides[target.id],hidden:true};
      }
      summaries.push('Removed the selected visual element'+(targets.length>1?'s':'')+'.');continue;
    }
    if(operation.operation!=='update'||!operation.patch||Object.keys(operation.patch).some(key=>!patchProperties.has(key)))invalid();
    const patch={...operation.patch};
    for(const key of ['color','fill','stroke'])if(key in patch) {
      const value=String(patch[key]).toLowerCase(), normalized=colors[value]||value;
      if(!/^#[a-f0-9]{3}(?:[a-f0-9]{3})?$/i.test(normalized)||!message.toLowerCase().includes(value)&&!Object.entries(colors).some(([name,hex])=>hex===normalized&&new RegExp('\\b'+name+'\\b','i').test(message)))invalid('Please specify the color you want.');
      patch[key]=normalized;
    }
    if(['x','y'].some(key=>key in patch)&&! /\b(?:move|position|align|left|right|up|down|top|bottom|center|centre)\b/i.test(message))invalid();
    if(['w','h','fontSize','scale'].some(key=>key in patch)&&! /\b(?:size|resize|bigger|smaller|larger|enlarge|shrink|increase|decrease|width|height|wide|tall)\b/i.test(message))invalid();
    if('fontWeight' in patch&&!/\b(?:bold|weight|regular|normal)\b/i.test(message)||'fontFamily' in patch&&!message.toLowerCase().includes(String(patch.fontFamily).toLowerCase())||'italic' in patch&&!/\bitalic\b/i.test(message)||'underline' in patch&&!/\bunderline\b/i.test(message)||'hidden' in patch&&!/\b(?:hide|show|remove|reveal)\b/i.test(message))invalid();
    for(const target of targets) {
      const update={...patch};
      if('scale' in update) {
        if(typeof update.scale!=='number'||!Number.isFinite(update.scale)||update.scale<.1||update.scale>5)invalid();
        for(const key of target.type==='text'?['fontSize','h']:['w','h']) {const value=layout.elementOverrides[target.id]?.[key]??target[key];if(typeof value!=='number')invalid('Select an element with a known size.');update[key]=value*update.scale;}
        delete update.scale;
      }
      for(const key of ['w','h','fontSize'])if(key in update&&(typeof update[key]!=='number'||update[key]<1||update[key]>(key==='fontSize'?300:5000)))invalid('The requested size is outside the supported range.');
      if('text' in update) {
        if(typeof update.text!=='string'||!message.includes(update.text)||canvasField(target.id)||/^item_/.test(target.id))invalid('Use the document field tool for business data and provide the exact replacement text.');
      }
      const custom=layout.customElements.find(el=>el.id===target.id);
      if(custom)Object.assign(custom,update);
      else layout.elementOverrides[target.id]={...layout.elementOverrides[target.id],...update};
      Object.assign(target,Object.fromEntries(Object.entries(update).filter(([key])=>['x','y','w','h','fontSize','fontWeight'].includes(key))));
    }
    summaries.push('Updated '+(operation.target.kind==='heading'?'the document heading':targets.length===1?'the selected element':'the selected elements')+'.');
  }
  const validated=canvasLayout(layout);
  // Unsupported semantic text never becomes a successful no-op acknowledgement.
  for(const [id,patch] of Object.entries(layout.elementOverrides))if(patch.text!==undefined&&validated.elementOverrides[id]?.text!==patch.text)invalid('That text is a document field. Use a document field edit instead.');
  return {layout:validated,context,response:[...new Set(summaries)].join(' ')};
}

export function resolveEditorCommand(message,state) {
  const context=state.editorContext||{elements:[],selectedIds:[]};
  let text=message;
  if(state.editorClarification&&/^(?:the\s+)?(?:heading|title|selected(?: element)?)[.!]?$/i.test(message.trim()))text=state.editorClarification.message.replace(/\b(?:it|selected(?: element)?)\b/i,message.trim().replace(/[.!]$/,''));
  const target='(?:(?:the|my)\\s+)?(?:(?:invoice|quotation|proposal|receipt|purchase order)\\s+)?(heading|title|selected(?: element| text)?|it)';
  const patterns=[
    {pattern:new RegExp('(?:change|set|make)\\s+'+target+'\\s+(?:(?:color|colour)\\s+)?(?:to\\s+)?(#[a-fA-F0-9]{3}(?:[a-fA-F0-9]{3})?|'+Object.keys(colors).join('|')+')\\b','gi'),patch:match=>({color:colors[match[2].toLowerCase()]||match[2]})},
    {pattern:new RegExp('(?:make|resize|enlarge|shrink)\\s+'+target+'\\s+(?:(?:a little|slightly)\\s+)?(?:to\\s+)?(bigger|larger|smaller|bold|italic)(?=$|[.!;,]|\\s+and\\b)','gi'),patch:match=>match[2].toLowerCase()==='bold'?{fontWeight:700}:match[2].toLowerCase()==='italic'?{italic:true}:{scale:/smaller/i.test(match[2])?.85:1.2}},
  ];
  const operations=[],spans=[];
  for(const rule of patterns)for(const match of text.matchAll(rule.pattern)) {
    const operation={operation:'update',target:{kind:/heading|title/i.test(match[1])?'heading':'selected'},patch:rule.patch(match),evidence:message===text?match[0]:message};
    try{const found=targetElements(operation.target,editorContext(context));if(operation.target.kind==='selected'&&found.length!==1&&/\bit\b/i.test(match[1]))invalid();}catch{return {operations:[],remaining:message,clarification:'Which element should I change? Select it in the preview or specify the heading.',pending:{message:text}};}
    operations.push(operation);spans.push([match.index,match.index+match[0].length]);
  }
  if(!operations.length)return {operations:[],remaining:message};
  let remaining=text;for(const [start,end] of spans.sort((a,b)=>b[0]-a[0]))remaining=remaining.slice(0,start)+' '.repeat(end-start)+remaining.slice(end);
  remaining=remaining.replace(/^(?:\s*(?:and|also|actually)\b|\s*[,.!;])+|(?:\band\s*|[,.!;\s])+$/gi,'').trim();
  return {operations,remaining,effectiveMessage:message===text?message:state.editorClarification.message+'\n'+message};
}

export function historySnapshot(session) {
  const meta=session.slots?._chat||{};
  return {slots:Object.fromEntries(Object.entries(session.slots||{}).filter(([key])=>key!=='_chat')),meta:Object.fromEntries(['fields','canvasLayout','editorContext','pendingField','pendingContact','pendingIntent','pendingAction','collection'].filter(key=>meta[key]!==undefined).map(key=>[key,structuredClone(meta[key])])),templateId:session.templateId,accentColor:session.accentColor};
}
export function recordHistory(meta,session,turnId) {
  const history=structuredClone(meta.documentHistory||{past:[],future:[]});
  if(history.past.at(-1)?.turnId===turnId)return;
  history.past.push({turnId,state:historySnapshot(session)});history.future=[];
  while(history.past.length>10||history.past.length>1&&JSON.stringify(history).length>300000)history.past.shift();
  meta.documentHistory=history;
}
