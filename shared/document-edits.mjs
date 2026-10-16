import {parseAmount} from './amounts.mjs';
import {contract,validField} from './document-contract.mjs';

export function documentEdits(message,state) {
    const slots={},evidence={},spans=[],correctionFields=[],fieldOperations=[];
    // Explicit note ownership wins over a date-looking phrase in its text.
    const note=message.trim().match(/^(add|append|replace|change|update|set)\s+(?:a\s+)?(?:note|notes)(?:\s+(?:as|to|is|with)|\s*:)?\s+([\s\S]+)$/i)
        ||message.trim().match(/^(add|append|replace|change|update|set)\s+([\s\S]+?)\s+(?:in|to)\s+(?:the\s+)?notes?[.!]?$/i);
    if(note&&!/\b(?:add|append|change|update|set|remove|delete|clear)\s+\S+/i.test(note[2])){const value=note[2].trim();fieldOperations.push({operation:/add|append/i.test(note[1])?'append':'set',field:'notesAndTerms',value,evidence:value});spans.push([0,message.length]);if(!/add|append/i.test(note[1]))correctionFields.push('notesAndTerms');}
    const discount=message.trim().match(/^(?:add|apply|set|change|update)\s+(?:a\s+|the\s+)?(?:(?:document\s+)?discount\s*(?:to|as|is|of|:)?\s*)?(.+?)\s*(?:document\s+)?discount[.!]?$/i)
        ||message.trim().match(/^(?:add|apply|set|change|update)\s+(?:a\s+|the\s+)?discount\s*(?:to|as|is|of|:)?\s*(.+?)[.!]?$/i);
    let pendingDiscountCurrency,pendingDiscountMode;
    if(discount){
        const raw=discount[1].trim(),percentage=/%|\bpercent\b/i.test(raw),value=parseAmount(raw.replace(/\s*(?:%|percent|fixed(?: amount)?)\s*/gi,''));
        if(value!==undefined){
            const namedCurrency=raw.match(/\b([A-Z]{3})\b/i)?.[1]?.toUpperCase();const explicitCurrency=validField('currency',namedCurrency)?namedCurrency:undefined;
            const explicitFixed=/\bfixed\b|\b(?:lakh|lak|lac|k)\b|Rs\.?|[$€£₹]/i.test(raw)||!!explicitCurrency||value>100;
            const existingRate=state.slots.discountRate!==undefined,existingFixed=state.slots.discountFixedAmount!==undefined;
            const field=percentage||!explicitFixed&&existingRate&&!existingFixed?'discountRate':'discountFixedAmount';
            if(!percentage&&!explicitFixed&&!existingRate&&!existingFixed)pendingDiscountMode={value};
            else if(explicitCurrency&&validField('currency',state.slots.currency)&&explicitCurrency!==state.slots.currency)pendingDiscountCurrency={value,field,currency:explicitCurrency};
            else{slots[field]=value;evidence[field]=raw;correctionFields.push(field);if(explicitCurrency&&!validField('currency',state.slots.currency)){slots.currency=explicitCurrency;evidence.currency=explicitCurrency;}}
            spans.push([0,message.length]);
        }
    }
    const tax=message.trim().match(/^(?:add|apply|set|change|update)\s+(?:the\s+)?tax(?: rate)?\s*(?:to|as|is|of|:)?\s*(\d+(?:\.\d+)?)\s*(?:%|percent)?[.!]?$/i);
    if(tax){slots.taxRate=Number(tax[1]);evidence.taxRate=tax[1];correctionFields.push('taxRate');spans.push([0,message.length]);}
    // Contacts may inherit an owner from the previous entity-specific clause,
    // but never from the order of required fields.
    const owners=[...message.matchAll(/\b(business|company|sender|my|our|client|customer|recipient)\s+(?:name|address|email|phone|contact)\b/gi)];
    const contacts=[...message.matchAll(/(?:^|[,;]\s*|\band\s+)(?:(?:add|change|update|set)\s+)?(?:(?:my|our)\s+)?(?:(business|company|sender|my|our|client|customer|recipient)\s+)?(email|phone)(?: number)?\s*(?:(?:is|as|to)\b|:|=)?\s*([^,;]+?)(?=\s+and\s+|[,;]|$)/gi)];
    for(const match of contacts){const owner=match[1]||owners.filter(owner=>owner.index<=match.index+match[0].length-match[3].length).at(-1)?.[1];if(!owner)continue;const field=(/client|customer|recipient/i.test(owner)?'client':'sender')+(match[2].toLowerCase()==='email'?'Email':'Phone');const value=match[3].trim().replace(/[.!]$/,'');slots[field]=value;evidence[field]=value;spans.push([match.index,match.index+match[0].length]);if(/change|update|set/i.test(match[0]))correctionFields.push(field);}
    return {slots,evidence,spans,correctionFields,fieldOperations,...(pendingDiscountCurrency?{pendingDiscountCurrency}:{}),...(pendingDiscountMode?{pendingDiscountMode}:{}),...(slots.discountFixedAmount!==undefined&&!validField('currency',state.slots.currency)&&!validField('currency',slots.currency)?{requestField:'currency'}:{})};
}
