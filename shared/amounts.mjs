import {possibleTypo} from './field-processing.mjs';

const itemWords=value=>String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
const compactItemLabel=value=>itemWords(value).join('');

export function parseAmount(value) {
    if(typeof value==='number')return Number.isFinite(value)?value:undefined;
    const match=String(value).trim().match(/^(?:(?:[A-Z]{3}|Rs\.?|[$€£₹])\s*)?(-?(?:\d+|\d{1,3}(?:[, \u00a0\u202f]\d{3})+)(?:\.\d+)?)\s*(k|lakhs?|laks?|lacs?)?(?:\s*[A-Z]{3})?$/i);
    if(!match)return undefined;
    const factor=match[2]?/^k$/i.test(match[2])?1000:100000:1;
    const result=Number(match[1].replace(/[, \u00a0\u202f]/g,''))*factor;
    return Number.isFinite(result)?result:undefined;
}
export function amountEvidence(value,text) {
    return [...String(text||'').matchAll(/(?<![\p{L}\p{N}])-?(?:\d{1,3}(?:[, \u00a0\u202f]\d{3})+|\d+)(?:\.\d+)?\s*(?:lakhs?|laks?|lacs?|k)?(?![\p{L}\p{N}])/giu)].some(match=>parseAmount(match[0])===value);
}
export function resolveItemTarget(label,items) {
    const words=value=>String(value).toLowerCase().match(/[\p{L}\p{N}]+/gu)||[];
    const clean=label.replace(/^(?:the|my)\s+/i,'').replace(/\s+(?:item|service)$/i,'').trim();
    const ordinal=label.trim().match(/^(first|second|third|fourth|\d+)(?:st|nd|rd|th)?\s+(?:item|service)$/i);
    if(ordinal){const i=({first:0,second:1,third:2,fourth:3}[ordinal[1].toLowerCase()]??Number(ordinal[1])-1);return items[i]?[items[i]]:[];}
    const exact=items.filter(item=>words(item.description).join(' ')===words(clean).join(' '));if(exact.length)return exact;
    // Word boundaries and punctuation do not change the identity of an item.
    const joined=items.filter(item=>compactItemLabel(item.description)===compactItemLabel(clean));if(joined.length)return joined;
    const asked=words(clean);if(!asked.length)return [];
    return items.filter(item=>{const present=words(item.description);return asked.every(word=>present.some(part=>part===word||word.length>=3&&part.startsWith(word)));});
}

export function suggestItemTargets(label,items) {
    const asked=compactItemLabel(label.replace(/^(?:the|my)\s+/i,'').replace(/\s+(?:item|service)$/i,''));
    return items.filter(item=>possibleTypo(asked,[compactItemLabel(item.description)])!==undefined);
}
