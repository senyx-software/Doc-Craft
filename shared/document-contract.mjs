import {parseAmount} from './amounts.mjs';
import contract from './document-contract.json' with { type: 'json' };
import templateRegistry from './template-schemas.json' with { type: 'json' };
import { currencyDigits, unresolvedStatuses,formatMoney } from './field-processing.mjs';
export { contract };
export const templates = templateRegistry.templates;
export function templateSchema(type, templateId, documentSchema = []) {
    const kind = documentType(type), base = contract.documents[kind], template = templates[templateId];
    if (template && !template.documentTypes.includes(kind)) throw Object.assign(new Error('Template does not support this document type'), { statusCode: 422, code: 'VALIDATION_FAILED' });
    const schema = template?.schema || {};
    const declared = Array.isArray(documentSchema) ? documentSchema : documentSchema?.fields || Object.entries(documentSchema?.properties||{}).map(([name,definition])=>({name,...definition,required:documentSchema?.required?.includes(name)}));
    for(const field of declared.filter(field=>field.required===true||field.requiredWhen))if(!canonicalKey(field.name||field.key))throw Object.assign(new Error('Required template field is unsupported'),{code:'TOOL_SCHEMA_INVALID',statusCode:422});
    const required = [...new Set([...base.required, ...(schema.required || []), ...declared.filter(field => field.required === true).map(field => canonicalKey(field.name || field.key)).filter(Boolean)])];
    const conditional = [...(base.conditional || []), ...(schema.conditional || []), ...declared.filter(field => field.requiredWhen).map(field => ({field:canonicalKey(field.name||field.key), ...field.requiredWhen}))];
    return { ...base, templateId: templateId || null, required, optional: base.optional.filter(key => !required.includes(key)), conditional, questions: {...base.questions, ...schema.questions} };
}
export function documentType(value) {
    const v = String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
    if (contract.documents[v])
        return v;
    if (/quotation|quote|estimate/.test(v))
        return 'quotation';
    if (/purchase|order/.test(v))
        return 'purchase_order';
    if (/proposal/.test(v))
        return 'proposal';
    if (/receipt/.test(v))
        return 'receipt';
    if (/invoice/.test(v))
        return 'invoice';
    throw new Error('Unsupported document type');
}
const keyIndex = new Map();
for (const [key, def] of Object.entries(contract.fields))
    for (const alias of [key, ...def.aliases])
        keyIndex.set(alias.replace(/[^a-z0-9]/gi, '').toLowerCase(), key);
export const canonicalKey = key => keyIndex.get(String(key).replace(/[^a-z0-9]/gi, '').toLowerCase());
export function canonicalize(input = {}) {
    const result = {};
    for (const [key, value] of Object.entries(input)) {
        const name = canonicalKey(key);
        if (!name)
            continue;
        const currencyValue = v => ({ '$': 'USD', 'usd': 'USD', 'lkr': 'LKR', 'rs': 'LKR', 'rs.': 'LKR', 'eur': 'EUR', '€': 'EUR', 'gbp': 'GBP', '£': 'GBP', 'inr': 'INR', '₹': 'INR' }[String(v).trim().toLowerCase()] || String(v).trim().toUpperCase());
        if (name in result && JSON.stringify(name === 'currency' ? currencyValue(result[name]) : result[name]) !== JSON.stringify(name === 'currency' ? currencyValue(value) : value))
            throw Object.assign(new Error('Conflicting aliases for ' + name),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        result[name] = value;
    }
    return result;
}
export function calendarDate(time=Date.now(),timezone='UTC') {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
  const part=type=>parts.find(p=>p.type===type).value;
  return new Date(part('year')+'-'+part('month')+'-'+part('day')+'T00:00:00Z');
}
export function resolveDate(value, baseDate = new Date()) {
    if (typeof value !== 'string')
        return value;
    const s = value.trim().toLowerCase();
    let days;
    if (s === 'today' || s === 'now')
        days = 0;
    else if (s === 'tomorrow')
        days = 1;
    else if (s === 'yesterday')
        days = -1;
    else {
        const m = s.match(/^(?:(?:in|net|within|with\s+in)\s+)?(\d+)\s*(days?|weeks?)(?:\s+from\s+(?:issue|now))?[.!]?$/);
        if (m)
            days = Number(m[1]) * (m[2].startsWith('week') ? 7 : 1);
    }
    const weekday=s.match(/^next (sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    if(weekday&&contract.formatting.relativeWeekdayPolicy==='next_occurrence')days=(["sunday","monday","tuesday","wednesday","thursday","friday","saturday"].indexOf(weekday[1])-baseDate.getUTCDay()+7)%7||7;
    if (days !== undefined) {
        const d = new Date(baseDate);
        d.setUTCDate(d.getUTCDate() + days);
        if (Number.isFinite(d.getTime())) {
            const result = d.toISOString().slice(0, 10);
            if (/^\d{4}-\d{2}-\d{2}$/.test(result)) return result;
        }
        return value;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s)
        return s;
    const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
    const named=s.match(/^(\d{1,2}) ([a-z]+) (\d{4})$/)||s.match(/^([a-z]+) (\d{1,2}),? (\d{4})$/);
    if(named) {
      const first=Number(named[1]),day=Number.isNaN(first)?Number(named[2]):first,monthName=Number.isNaN(first)?named[1]:named[2];
      const month=months.findIndex(name=>name===monthName||name.slice(0,3)===monthName);
      if(month>=0){const iso=named[3]+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');if(validField('issueDate',iso))return iso;}
    }
    return value;
}
export function normalizeSlots(input = {}, existing = {}, now = new Date()) {
    const out = canonicalize(input);
    const symbols = contract.formatting.currencyAliases;
    if (out.currency !== undefined)
        out.currency = symbols[String(out.currency).trim().toLowerCase()] || String(out.currency).trim().toUpperCase();
    for (const key of Object.keys(out))
        if (typeof out[key] === 'string')
            out[key] = out[key].trim();
    if (out.issueDate !== undefined)
        out.issueDate = resolveDate(out.issueDate, now);
    const dateFormat=out.dateFormat||existing.dateFormat;
    const configuredDate=value=>{if(['DD/MM/YYYY','MM/DD/YYYY'].includes(dateFormat)&&typeof value==='string'&&/^\d{2}\/\d{2}\/\d{4}$/.test(value)){const [a,b,year]=value.split('/');return year+'-'+(dateFormat==='DD/MM/YYYY'?b:a)+'-'+(dateFormat==='DD/MM/YYYY'?a:b);}return value;};
    if(out.issueDate!==undefined)out.issueDate=configuredDate(out.issueDate);
    if(out.dueDate!==undefined)out.dueDate=configuredDate(out.dueDate);
    const issue = out.issueDate || existing.issueDate;
    if (out.dueDate !== undefined)
        out.dueDate = resolveDate(out.dueDate, /from now$/i.test(String(out.dueDate)) || /^(?:today|now|tomorrow|yesterday|next (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))$/i.test(String(out.dueDate)) ? now : (issue && validField('issueDate', issue) ? new Date(issue) : now));
    for (const key of Object.keys(out)) if (contract.fields[key]?.type === 'number' && typeof out[key] === 'string') {const value=parseAmount(out[key].replace(/[%％]$/,''));if(value!==undefined)out[key]=value;}
    if (Array.isArray(out.lineItems))
        out.lineItems = out.lineItems.map(item => ({ id: item.id, description: item.description ?? item.name, quantity: item.quantity ?? item.qty, unitPrice: item.unitPrice ?? item.unit_price ?? item.price, discountRate:item.discountRate })).map(item => Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined)));
    return out;
}
export function validField(key, value) {
    const def = contract.fields[key];
    if (!def || value === null || value === undefined)
        return false;
    if (def.type === 'items')
        return Array.isArray(value) && value.length > 0 && value.length <= 100 && value.every(item => item && typeof item.description === 'string' && item.description.trim().length > 0 && typeof item.quantity === 'number' && Number.isFinite(item.quantity) && item.quantity > 0 && item.quantity <= def.itemLimits.maxQuantity && typeof item.unitPrice === 'number' && Number.isFinite(item.unitPrice) && item.unitPrice >= 0 && item.unitPrice <= def.itemLimits.maxUnitPrice && item.quantity * item.unitPrice <= def.itemLimits.maxSubtotal && (item.discountRate===undefined||typeof item.discountRate==='number'&&Number.isFinite(item.discountRate)&&item.discountRate>=0&&item.discountRate<=100)) && value.reduce((sum,item)=>sum+item.quantity*item.unitPrice,0)<=def.itemLimits.maxSubtotal;
    if (def.type === 'number')
        return typeof value === 'number' && Number.isFinite(value) && value >= def.min && value <= def.max;
    if (typeof value !== 'string' || !value.trim() || value.length > 4000)
        return false;
    if (def.enum && !def.enum.includes(value)) return false;
    if(['notesAndTerms','paymentTerms'].includes(key)&&/\b(?:date|valid|valide|validity|due|until|expiry)\b/i.test(value)&&[...value.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].some(match=>!validField('issueDate',match[0])))return false;
    if (key === 'locale') return contract.formatting.locales.includes(value);
    if (def.type === 'email')
        return /^[^\s@<>()\[\]:;,"\\]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length<=254 && value.split('@')[0].length<=64 && !value.split('@')[0].startsWith('.') && !value.split('@')[0].endsWith('.') && !value.includes('..') && value.split('@')[1].split('.').every(label=>/^[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?$/u.test(label)&&label.length<=63);
    if (def.type === 'phone')
        return /^\+?[\d ().-]{7,30}$/.test(value) && value.replace(/\D/g, '').length >= 7 && value.replace(/\D/g, '').length <= 15;
    if (def.type === 'date')
        return /^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value) && !isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if (def.type === 'currency')
        return Object.hasOwn(contract.formatting.currencyDigits,value);
    if (key === 'businessName' || key === 'clientName')
        return value.length <= 160 && !/[\n?]/.test(value);
    return true;
}
function decimal(value) {
  const [mantissa,exponent='0']=String(value).toLowerCase().split('e');
  const [whole,fraction='']=mantissa.split('.');
  const coefficient=BigInt(whole+fraction),scale=fraction.length-Number(exponent);
  return scale<0?{coefficient:coefficient*10n**BigInt(-scale),scale:0}:{coefficient,scale};
}
function roundedProduct(first,second,divisor=1,digits=2) {
  const unit=10n**BigInt(digits),a=decimal(first),b=decimal(second),numerator=a.coefficient*b.coefficient*unit,denominator=10n**BigInt(a.scale+b.scale)*BigInt(divisor);
  const cents=(numerator*2n+denominator)/(denominator*2n);
  return Number(cents)/Number(unit);
}
export function documentData(raw = {}) {
    const slots = normalizeSlots(raw);
    for (const key of Object.keys(slots)) if (slots[key]===null || slots[key]===undefined || slots[key]==='') delete slots[key];
    if (validField('lineItems', slots.lineItems)) {
        const digits=currencyDigits(slots.currency),unit=10**digits;
        const minor=value=>BigInt(Math.round(value*unit));
        const evaluate=(expression,context)=>{
            if(typeof expression==='number')return expression;
            if(expression.ref){const value=context[expression.ref];return expression.validated&&!validField(expression.ref,value)?expression.fallback:value??expression.fallback;}
            const args=expression.args||[];
            if(expression.op==='coalesce'){const value=evaluate(args[0],context);return value??evaluate(args[1],context);}
            if(expression.op==='sumItems')return Number(slots.lineItems.reduce((sum,item)=>sum+minor(item[expression.field]),0n))/unit;
            const values=args.map(arg=>evaluate(arg,context));
            if(expression.op==='multiply')return roundedProduct(values[0],values[1],1,digits);
            if(expression.op==='percent')return roundedProduct(values[0],values[1],100,digits);
            if(expression.op==='validFixed')return validField('discountFixedAmount',values[0])?(values[0]<=values[1]?roundedProduct(values[0],1,1,digits):0):undefined;
            if(expression.op==='subtract')return Number(minor(values[0])-minor(values[1]))/unit;
            if(expression.op==='add')return Number(minor(values[0])+minor(values[1]))/unit;
            throw new Error('Unsupported financial expression');
        };
        const calculate=(context,definitions)=>{for(const [key,expression]of Object.entries(definitions))context[key]=evaluate(expression,context);return context;};
        slots.lineItems=slots.lineItems.map(item=>{const calculated=calculate({...item},contract.financial.lineItemCalculations);if(item.discountRate===undefined){delete calculated.grossTotal;delete calculated.discountAmount;}return calculated;});
        calculate(slots,contract.financial.documentCalculations);
    }
    if (validField('currency', slots.currency))
        slots.currencySymbol = contract.formatting.currencySymbols[slots.currency] || slots.currency + ' ';
    return slots;
}
export function formatDocumentMoney(value,data) {return validField('lineItems',data.lineItems)&&validField('currency',data.currency)?formatMoney(value,data.currency,data.locale):'';}
export function workflow(type, raw = {}, fields = {}, schema, collection = {}) {
    const kind = documentType(type), spec = schema || templateSchema(type), slots = documentData(raw);
    fields={...fields};
    for(const key of [...spec.required,...spec.optional]) if(slots[key]!==undefined&&!validField(key,slots[key])&&!fields[key]) fields[key]={status:'uncertain',source:'validation'};
    const required = [...spec.required];
    for (const rule of spec.conditional || [])
        if (rule.values.includes(String(slots[rule.whenField] || '').toLowerCase()) && !required.includes(rule.field))
            required.push(rule.field);
    for(const key of ['dueDate','taxRate','discountFixedAmount'])if(fields[key]?.derivedValidation){const {derivedValidation,question,proposed,...previous}=fields[key];fields[key]={...previous,status:validField(key,slots[key])?'confirmed':'missing',validationStatus:validField(key,slots[key])?'valid':'missing'};}
    if (validField('issueDate',slots.issueDate) && validField('dueDate',slots.dueDate) && slots.dueDate < slots.issueDate) fields.dueDate={...fields.dueDate,status:'invalid',validationStatus:'invalid',derivedValidation:'chronology',question:'The due date is before the issue date. Which due date should I use?'};
    if (['exempt','not applicable'].includes(slots.taxStatus) && slots.taxRate > 0) fields.taxRate={...fields.taxRate,status:'conflicting',validationStatus:'ambiguous',proposed:0,derivedValidation:'tax',question:'You marked tax as exempt but supplied a positive tax rate. Should I remove the tax? Reply yes or no.'};
    if(validField('discountFixedAmount',slots.discountFixedAmount)&&slots.discountFixedAmount>slots.subtotal)fields.discountFixedAmount={...fields.discountFixedAmount,status:'invalid',validationStatus:'invalid',derivedValidation:'discount',question:'The fixed discount exceeds the subtotal. What smaller discount should I use?'};
    if(slots.discountFixedAmount>0&&slots.discountRate>0)fields.discountFixedAmount={...fields.discountFixedAmount,status:'conflicting',derivedValidation:'discount_mode',proposed:slots.discountFixedAmount,question:'Both percentage and fixed discounts were supplied. Should I use the fixed amount instead? Reply yes or no.'};
    const missingRequired = required.filter(key => !validField(key, slots[key]) || unresolvedStatuses.includes(fields[key]?.status));
    const pendingOptional = spec.optional.filter(key => !validField(key, slots[key]) && fields[key]?.status !== 'skipped');
    const conflict = Object.keys(fields).find(key => unresolvedStatuses.includes(fields[key]?.status));
    const nextField = conflict || missingRequired[0] || null;
    let nextAction = conflict ? { kind: 'clarify', field: conflict, question: fields[conflict].question || (fields[conflict].status === 'conflicting' ? `You supplied a different ${contract.fields[conflict]?.label || conflict}. Should I replace the saved value? Reply yes or no.` : `Please clarify the ${contract.fields[conflict]?.label || conflict}. ${spec.questions[conflict] || contract.fields[conflict]?.question || ''}`) } : nextField ? { kind: 'ask', field: nextField, question: spec.questions[nextField] || contract.fields[nextField].question } : { kind: 'review', field: null, question: 'All required details are saved and valid. Review the document and confirm these details before finalizing.' };
    const pendingItem=fields.lineItems?.pending?.[0];
    if(conflict==='lineItems'&&pendingItem) {
      const component=!pendingItem.item.description?'description':!Number.isFinite(pendingItem.item.quantity)||pendingItem.item.quantity<=0?'quantity':'unitPrice';
      nextAction={kind:'clarify',field:'lineItems',component,question:`What is the ${component==='unitPrice'?'unit price':component} for ${pendingItem.item.description||'the new line item'}?`};
    }
    const offered=pendingOptional.filter(key=>!required.includes(key)&&contract.fields[key]?.offerWhenComplete&&!fields[key]?.cleared);
    if(!missingRequired.length&&!conflict&&offered.length&&(!collection.optionalOffered||collection.offerPending)&&!collection.optionalDismissed)nextAction={kind:'offer_optional',field:null,fields:offered,question:'The required '+contract.documents[kind].label.toLowerCase()+' details are complete. Would you like to add '+offered.map(key=>contract.fields[key].label).join(', ')+', or skip the optional details and review?'};
    const optional=spec.optional.filter(key=>!required.includes(key));
    return { documentType: kind, slots, fieldStates:fields,missingRequired:[...new Set(missingRequired)], pendingOptional:pendingOptional.filter(key=>!required.includes(key)), nextAction, readyToGenerate: !missingRequired.length && !conflict, stage: conflict ? 'clarifying' : missingRequired.length ? 'collecting' : nextAction.kind==='offer_optional'?'optional':'review', schema: { total_fields: required.length + optional.length, required_fields: required.length, optional_fields: optional.length, required_keys: [...new Set(required)], computed_fields: ['subtotal', 'discountAmount', 'taxableAmount', 'taxAmount', 'totalDue'], templateId:spec.templateId } };
}
export function toolSchema(type) {
    const spec = contract.documents[documentType(type)], properties = {};
    for (const key of [...spec.required, ...spec.optional]) {
        const d = contract.fields[key];
        properties[key] = d.type === 'items' ? { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, description: { type: 'string' }, quantity: { type: 'number' }, unitPrice: { type: 'number' }, discountRate:{type:'number',minimum:0,maximum:100} }, required: ['description'], additionalProperties: false } } : { type: d.type === 'number' ? 'number' : 'string', description: d.label };
    }
    return { type: 'object', properties: { confirmBeforeApply:{type:'boolean',description:'Only when a genuinely ambiguous supported edit needs user approval; persist the validated proposal before asking.'},confirmationQuestion:{type:'string'},fieldOperations:{type:'array',maxItems:100,items:{type:'object',properties:{operation:{enum:['set','append','clear','skip']},field:{type:'string',enum:[...spec.required,...spec.optional]},value:{anyOf:[{type:'string'},{type:'number'},properties.lineItems]},evidence:{type:'string'}},required:['operation','field'],additionalProperties:false}},clarifications:{type:'array',maxItems:10,items:{type:'object',properties:{field:{type:'string',enum:[...spec.required,...spec.optional]},rawValue:{type:'string'},suggestedValue:{type:'string'},reason:{type:'string'}},required:['field','rawValue','suggestedValue','reason'],additionalProperties:false}},requestField:{type:'string',enum:[...spec.required,...spec.optional]},slots: { type: 'object', properties, additionalProperties: false }, evidence: { type: 'object', additionalProperties: { type: 'string' } }, clear: { type:'array', items:{type:'string',enum:[...spec.required,...spec.optional]} }, evidenceSource: { type: 'object', additionalProperties: { type: 'string' } }, skip: { type: 'array', items: { type: 'string' } }, itemOperations: { type: 'array', items: { type: 'object', properties: { operation: { enum: ['add', 'update', 'remove'] }, id: { type: 'string' }, item: { type: 'object', properties: Object.fromEntries(Object.entries(properties.lineItems.items.properties).filter(([key])=>key!=='id')) } }, required: ['operation'], additionalProperties: false } } }, additionalProperties: false };
}
