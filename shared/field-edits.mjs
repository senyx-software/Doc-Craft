import {possibleTypo} from './field-processing.mjs';
import {canonicalKey, contract} from './document-contract.mjs';

// Schema aliases identify targets; these parsers cover explicit commands only.
// Arbitrary prose continues through structured provider extraction and validation.
export function fieldTarget(label, state = {}) {
    const owner = /^(?:my|our)\b/i.test(label) ? 'sender' : undefined;
    label = label.trim().replace(/^(?:my|our|the)\s+/i, '').replace(/(?:phone|contact) number$/i, 'phone');
    if (/^(?:phone|email|address|contact)$/i.test(label)) {
        const suffix = /contact/i.test(label) ? 'Phone' : label[0].toUpperCase() + label.slice(1).toLowerCase();
        if (owner) return owner + suffix;
        return state.nextAction?.field?.endsWith(suffix) ? state.nextAction.field : undefined;
    }
    const exact=canonicalKey(label)||Object.entries(contract.fields).find(([,def])=>(def.editLabels||[]).some(alias=>alias.toLowerCase()===label.toLowerCase()))?.[0];
    if(exact)return exact;
    const text=label.toLowerCase().replace(/[^a-z]/g,'');
    if(text.length<5)return undefined;
    const candidates=Object.entries(contract.fields).flatMap(([field,def])=>[field,def.label,...def.aliases,...(def.editLabels||[])].map(alias=>({field,alias:alias.toLowerCase().replace(/[^a-z]/g,'')})))
        .filter(candidate=>possibleTypo(text,[candidate.alias]));
    const unique=[...new Set(candidates.map(candidate=>candidate.field))];
    if(unique.length!==1)return undefined;
    const field=unique[0];
    if(candidates.some(candidate=>['phone','email','address'].includes(candidate.alias))&&contract.fields[field].party&&!owner&&!state.nextAction?.field?.endsWith(field.endsWith('Phone')?'Phone':field.endsWith('Email')?'Email':'Address'))return undefined;
    return field;
}
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const labels = [...new Set(Object.entries(contract.fields).flatMap(([key, def]) => [key.replace(/([A-Z])/g,' $1'), def.label, ...def.aliases, ...(def.editLabels || [])]))].sort((a,b)=>b.length-a.length);
export function explicitFieldEdits(message, state) {
    const command = new RegExp('\\b(add|append|enter|set|change|update|replace|correct|edit|remove|delete|clear)\\s+(?:(my|our|the)\\s+)?('+labels.map(escape).join('|')+')(?![\\p{L}\\p{N}])(?:\\s*(?:(?:is|are|to|with|as)\\b|:|=)\\s*|\\s+|(?=$|[,.!;]))','giu');
    const matches = [...message.matchAll(command)], updates = [];
    // Recognize unique, one-edit typos in schema field labels, never in values.
    // Unrecognized clauses still go to the semantic provider.
    const boundaries=[...message.matchAll(/\b(add|append|enter|set|change|update|replace|correct|edit|remove|delete|clear)\s+(?:(my|our|the)\s+)?/gi)];
    for(let index=0;index<boundaries.length;index++) {
        const start=boundaries[index];if(matches.some(match=>match.index===start.index))continue;
        const rest=message.slice(start.index+start[0].length,boundaries[index+1]?.index??message.length);
        for(let words=5;words>=1;words--) {
            const phrase=rest.match(new RegExp('^\\S+(?:\\s+\\S+){'+(words-1)+'}'))?.[0];
            if(!phrase||!fieldTarget((start[2]?start[2]+' ':'')+phrase,state))continue;
            const delimiter=rest.slice(phrase.length).match(/^(?:\s*(?:(?:is|are|to|with|as)\b|:|=)\s*|\s+|$)/i)?.[0];
            if(delimiter===undefined)continue;
            const match=[start[0]+phrase+delimiter,start[1],start[2],phrase];match.index=start.index;matches.push(match);break;
        }
    }
    matches.sort((a,b)=>a.index-b.index);
    for (let index=0;index<matches.length;index++) {
        const match=matches[index], field=fieldTarget((match[2]?match[2]+' ':'')+match[3],state);
        if (!field || ![...contract.documents[state.documentType].required,...contract.documents[state.documentType].optional].includes(field)) continue;
        const end=matches[index+1]?.index ?? message.length;
        let value=message.slice(match.index+match[0].length,end).trim().replace(/[,;\s]+(?:and\s*)?$|\s+and$/i,'').trim();
        if(/^(?:and|then)$/i.test(value))value='';
        const remove=/remove|delete|clear/i.test(match[1]);
        if (remove && value && !/^[.!]$/.test(value)) continue;
        if (!remove && !value) continue;
        // Do not consume a subsequent conversational question as a field value.
        const boundary=value.search(/(?:[,.!;]\s*|\s+and\s+)(?:tell|explain|what|why|how|generate|review|show|add|change|update|remove|clear|delete)\b|\s+(?:add|change|update|remove|clear|delete)\b/i);
        const valueEnd=boundary<0?end:match.index+match[0].length+message.slice(match.index+match[0].length,end).indexOf(value)+boundary;
        if(boundary>=0)value=value.slice(0,boundary).trim().replace(/[,;]$/,'');
        updates.push({field,value,remove,append:/append/i.test(match[1])||field==='notesAndTerms'&&/^add$/i.test(match[1]),correction:/set|change|update|replace|correct|edit/i.test(match[1]),span:[match.index,valueEnd]});
    }
    return updates;
}

// Ownership is decided near the evidenced value, not from the order of fields
// or the presence of an unrelated party elsewhere in a compound message.
export function contactOwner(message, evidence, state, historical = false) {
    const index=message.toLowerCase().indexOf(String(evidence).toLowerCase());
    const preceding=index<0?'':message.slice(0,index);
    const labels=[...preceding.matchAll(/\b(my|our|sender|business|company|client|customer|recipient)(?:'s)?\s+(?:(?:phone|contact)(?:\s+number)?|email|address)\s*(?:(?:is|are|to|with|as)\b|:|=)?\s*/gi)];
    const nearest=labels.at(-1);
    if(nearest && preceding.slice(nearest.index+nearest[0].length).trim().length===0) return /client|customer|recipient/i.test(nearest[1])?'recipient':'sender';
    if(nearest&&/(?:,|\band\b)\s*(?:email|phone|address)\s*(?:(?:is|as|to)\b|:|=)?\s*$/i.test(preceding.slice(nearest.index+nearest[0].length)))return /client|customer|recipient/i.test(nearest[1])?'recipient':'sender';
    if (historical) return undefined; // Older bare contacts have no trustworthy owner.
    const pending=state.nextAction?.field;
    return ['senderPhone','clientPhone','senderEmail','clientEmail','senderAddress','clientAddress'].includes(pending) ? contract.fields[pending].party : undefined;
}
