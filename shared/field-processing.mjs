import contract from './document-contract.json' with { type: 'json' };

const brands = new Map(contract.formatting.brands.map(value => [value.toLowerCase(), value]));
const acronyms = new Set(contract.formatting.acronyms);
export const unresolvedStatuses = ['uncertain', 'conflicting', 'invalid', 'ambiguous', 'awaiting_confirmation'];

// Format only ordinary lowercase words. Mixed-case branding and uppercase legal
// abbreviations are intentional; names never go through dictionary correction.
export function formatOrdinaryText(value) {
    return value.replace(/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*/gu, word => {
        if (word !== word.toLowerCase()) return word;
        if (brands.has(word.toLowerCase())) return brands.get(word.toLowerCase());
        if (acronyms.has(word.toUpperCase())) return word.toUpperCase();
        return word[0].toLocaleUpperCase() + word.slice(1);
    });
}
export function formatFieldText(field, value, preserve = false) {
    if (typeof value !== 'string') return value;
    const strategy = contract.fields[field]?.format || 'preserve';
    value = value.trim();
    if (strategy === 'email') {
        const at = value.lastIndexOf('@');
        return at > 0 ? value.slice(0, at) + '@' + value.slice(at + 1).toLowerCase() : value;
    }
    if (preserve) return value;
    if (strategy === 'address') return formatAddress(value);
    if (strategy === 'sentence') return formatNote(value);
    if (strategy === 'bank') return formatAccountDetails(value);
    if (strategy === 'lower') return value.toLowerCase();
    if (preserve || strategy === 'preserve') return value;
    return formatOrdinaryText(value.replace(/\s+/g, ' '));
}
// Address boundaries come from the user's separators. A merged locality such as
// "keselwattapanadura" is capitalized, never guessed into two different places.
export function formatAddress(value, knownNames = []) {
    let result = value.split('\n').map(line => line.trim().replace(/[ \t]+/g, ' ')
        .replace(/\b(?:address\s+)?no\.?\s*(?=\d)/gi, 'No. ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/[\p{L}\p{M}][\p{L}\p{M}\p{N}'’/-]*/gu, word => /\d/.test(word) ? word : formatOrdinaryText(word))).join('\n');
    for (const name of knownNames.filter(name => typeof name === 'string')) {
        const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        result = result.replace(new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu'), () => name);
    }
    return result;
}
export function formatNote(value) {
    value = value.trim().replace(/[ \t]+/g, ' ');
    value=value.replace(/\b(\d{4})\s*-\s*(\d{2})\s*-\s*(\d{2})\b/g,'$1-$2-$3');
    value=value.replace(/^last vali(?:d|de) date\s*(?:as|is|:)?\s+(\d{4}-\d{2}-\d{2})[.!]?$/i,'Last valid date: $1');
    value = value.replace(/^valid\s+(\d+\s+days?)$/i, 'Valid for $1');
    value=value.replace(/^([\p{L}\p{M}][\p{L}\p{M}\p{N}'’-]*)(?![\p{L}\p{N}])/u,(word,_capture,offset,text)=>text[word.length]==='@'||/^(?:https?|www)$/i.test(word)||word!==word.toLowerCase()?word:brands.get(word.toLowerCase())||(acronyms.has(word.toUpperCase())?word.toUpperCase():word[0].toLocaleUpperCase()+word.slice(1)));
    return /[.!?:;]$/.test(value) || value.includes('\n') ? value : value + '.';
}
export function formatAccountDetails(value) {
    value = value.trim().replace(/[ \t]+/g, ' ');
    const compact = value.match(/^([\p{L}][\p{L} .’'-]*?)\s+(?:account(?:\s+(?:number|no\.?))?\s*[:=]?\s*)?(\d{4,30})$/iu);
    if (!compact) return formatOrdinaryText(value);
    const text = formatOrdinaryText(compact[1].trim());
    const bank = text.match(/^(BOC)\s+(.+)$/);
    return (bank ? bank[1] + ', ' + bank[2] : text) + ', Account: ' + compact[2];
}
export function fieldRecord(field, rawValue, normalizedValue, source, status = 'confirmed', extra = {}) {
    return {
        field, rawInput: structuredClone(rawValue ?? null), normalizedValue: structuredClone(normalizedValue ?? null),
        status, validationStatus: status === 'invalid' || status === 'uncertain' ? 'invalid' : ['ambiguous','conflicting','awaiting_confirmation'].includes(status) ? 'ambiguous' : status === 'missing' ? 'missing' : 'valid',
        confirmationStatus: status === 'confirmed' ? 'confirmed' : status === 'awaiting_confirmation' || status === 'conflicting' ? 'awaiting' : 'unconfirmed',
        source: source.id, sourceMessage: source.id, sourceExcerpt: (source.message || '').slice(0,256), kind: source.kind,...(source.confirmedBy?{confirmationSource:source.confirmedBy}:{}),
        updatedAt: new Date(source.now || Date.now()).toISOString(), ...extra,
    };
}
export function currencyDigits(currency) { return contract.formatting.currencyDigits[currency] ?? 2; }
export function formatMoney(value, currency = '', locale = contract.formatting.defaultLocale) {
    const digits = currencyDigits(currency);
    return new Intl.NumberFormat(contract.formatting.locales.includes(locale) ? locale : contract.formatting.defaultLocale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}
export function formatDate(value, format = 'YYYY-MM-DD') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return value || '';
    const [year, month, day] = value.split('-');
    return format === 'DD/MM/YYYY' ? `${day}/${month}/${year}` : format === 'MM/DD/YYYY' ? `${month}/${day}/${year}` : value;
}

// Used only as a contextual spelling signal. A near match is a proposal, never
// permission to change an unfamiliar brand. Adjacent swaps count as one typo.
export function possibleTypo(value, knownValues) {
    const text = String(value).toLowerCase();
    if (text.length < 4) return undefined;
    if (knownValues.some(known=>String(known).toLowerCase()===text))return undefined;
    for (const known of knownValues) {
        const other = String(known).toLowerCase();
        if (other === text || Math.abs(other.length - text.length) > 1) continue;
        let differences = 0, i = 0, j = 0;
        while (i < text.length && j < other.length) {
            if (text[i] === other[j]) { i++; j++; continue; }
            differences++;
            if (text[i] === other[j + 1] && text[i + 1] === other[j]) { i += 2; j += 2; }
            else if (text.length > other.length) i++;
            else if (other.length > text.length) j++;
            else { i++; j++; }
        }
        differences += text.length - i + other.length - j;
        if (differences === 1) return known;
    }
}

export function literalSpan(message, snippet) {
    if(typeof snippet!=='string'||!snippet.trim())return undefined;
    const index=message.toLowerCase().indexOf(snippet.toLowerCase());
    if(index<0)return undefined;
    // Never accept a suffix of an account/phone number as the full identifier.
    if(/[\p{L}\p{N}]/u.test(snippet[0])&&/[\p{L}\p{N}]/u.test(message[index-1]||''))return undefined;
    if(/[\p{L}\p{N}]/u.test(snippet.at(-1))&&/[\p{L}\p{N}]/u.test(message[index+snippet.length]||''))return undefined;
    return message.slice(index,index+snippet.length);
}
export function deriveFieldEvidence(field, value, message) {
    if(typeof value!=='string')return undefined;
    const literal=literalSpan(message,value);if(literal)return literal;
    if(!['accountDetails','notesAndTerms','paymentTerms'].includes(field))return undefined;
    const bankFacts=text=>text.toLowerCase().replace(/\b(?:bank(?:\s+name)?|branch|account(?:\s+(?:number|no))?|number)\b/g,'').match(/[\p{L}\p{N}]+/gu)?.join(' ')||'';
    const signature=text=>field==='accountDetails'?bankFacts(text):formatNote(text).toLowerCase();
    const wanted=signature(value);if(!wanted)return undefined;
    const tokens=[...message.matchAll(/[\p{L}\p{N}]+(?:[’'/-][\p{L}\p{N}]+)*/gu)];
    // A bounded comparison against actual user spans allows display labels and
    // sentence formatting. We return the user's words, never the model's rewrite.
    for(let start=0;start<tokens.length;start++)for(let end=start;end<Math.min(tokens.length,start+25);end++) {
        const span=message.slice(tokens[start].index,tokens[end].index+tokens[end][0].length);
        if(signature(span)===wanted)return span;
    }
}

export function preserveKnownNameCase(value, knownNames) {
    const seen=new Set();
    for(const name of knownNames.filter(name=>typeof name==='string'&&name.trim())) {
        if(seen.has(name.toLowerCase()))continue;seen.add(name.toLowerCase());
        const escaped=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        value=value.replace(new RegExp('(?<![\\p{L}\\p{N}])'+escaped+'(?![\\p{L}\\p{N}])','giu'),()=>name);
    }
    return value;
}
