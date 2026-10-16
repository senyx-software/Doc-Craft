import {parseAmount,resolveItemTarget,suggestItemTargets} from './amounts.mjs';
import { canonicalKey, contract, documentType } from './document-contract.mjs';

export function requestedField(text, state = {}) {
    const label = text.trim().replace(/^(?:my|our|the)\s+/i, '').replace(/[.!]$/, '');
    if (/^(?:address|email|phone)$/i.test(label)) return state.nextAction?.field?.endsWith(label[0].toUpperCase() + label.slice(1)) ? state.nextAction.field : canonicalKey(label);
    return canonicalKey(label);
}

// Deterministic routing does not claim to understand arbitrary data: unresolved text goes to
// semantic extraction. Questions and action requests never become a short pending-field answer.
export function identifyIntent(message, state = {}) {
    const text = message.trim();
    const intents = [];
    if (/(?:^|[,.!;]|\band\b)\s*(?:(?:please|can you|could you|I want to)\s+)?(?:summari[sz]e|summary|review|show (?:me )?(?:the |my )?document|show what we have so far|what we have so far|what is (?:the |my )?document summary)\b/i.test(text)) intents.push('summary');
    if (/(?:^|[,.!;]|\band\b)\s*(?:(?:please|can you|could you|I want to)\s+)?(?:generate|create|export|download)\b.*\b(?:document|invoice|quotation|receipt|proposal|pdf|purchase order)\b/i.test(text) && !/\b(?:don't|do not|never|not ready to)\s+(?:generate|create|export|download)\b/i.test(text)) intents.push('generate');
    if (/(?:^|[,.!;]|\band\b)\s*(?:(?:please|can you|could you|I want to)\s+)?(?:change|switch|convert)\b.*\b(?:document type|this to|to (?:an? )?(?:invoice|quotation|receipt|proposal|purchase order))\b/i.test(text)) intents.push('change_type');
    if (/^(?:please\s+)?(?:use|reuse|copy|bring)\b.*(?:\b(?:same|previous|before|earlier)\b.*\b(?:company|business)\b|\b(?:company|business)\b.*\b(?:same|previous|before|earlier)\b)/i.test(text)) intents.push('reuse');
    if (/^(?:cancel|never mind|nevermind|no changes needed|stop (?:that|this) edit)\b/i.test(text)) intents.push('cancel');
    if (/^(?:yes|no)[.!]?$/i.test(text) && state.pendingIntent?.kind==='operation') return {kind:'resolve_operation',intents:['resolve_operation'],allowsMutation:true};
    if (/^yes[.!]?$/i.test(text) && state.nextAction?.kind==='offer_optional')return {kind:'collect_optional',intents:['collect_optional'],allowsMutation:true};
    if (/^(?:yes|no)[.!]?$/i.test(text)) intents.push(state.nextAction?.kind==='confirm_document' ? text.toLowerCase().startsWith('yes')?'confirm_document':'cancel_finalization' : state.nextAction?.kind==='clarify'&&['conflicting','awaiting_confirmation'].includes(state.fieldStates?.[state.nextAction.field]?.status)?'resolve':'acknowledge');
    if (/^(?:confirm|approve|finalize)(?: (?:the |these |my )?(?:document|invoice|quotation|receipt|proposal|details))?[.!]?$/i.test(text)) intents.push('confirm_document');
    if (/^(?:thank(?:s| you)|okay|ok|hello|hi|hey)[.!]?$/i.test(text)) intents.push('acknowledge');
    if (/^(?:skip)\b/i.test(text)) intents.push('skip');
    if (/^(?:remove|delete|clear)\b/i.test(text)) intents.push('remove');
    if (/(?:^|[,.!;]|\band\b)\s*(?:(?:please|can you|could you)\s+)?(?:change|update|replace|correct|edit|rename|append|apply|set)\b|\binstead[.!]?$/i.test(text)) intents.push('correct');
    if (/^(?:please\s+)?(?:add|enter|set|append|apply)\b/i.test(text)) intents.push('add');
    if (/[?]$/.test(text) || /(?:[,.!;]|\band\b)\s*(?:explain|what|why|how|tell me|can you|could you)\b/i.test(text) || /^(?:what|why|how|when|where|which|can|could|would|explain|tell|help|show)\b/i.test(text)) intents.push('question');
    if(/\b(?:don't|do not|never)\s+(?:generate|create|export|download)\b/i.test(text))intents.push('acknowledge');
    if (!intents.length) intents.push('provide');
    const typeClause=text.match(/(?:^|[,.!;]|\band\b)\s*(?:(?:please|can you|could you|I want to)\s+)?(?:change|switch|convert)\b[^,.!;]*?\bto\s*(?:an?\s+)?(invoice|quotation|receipt|proposal|purchase order)\b/i);
    const generationClause=text.match(/(?:^|[,.!;]|\band\b)\s*(?:(?:please|can you|could you|I want to)\s+)?(?:generate|create|export|download)\s+(?:(?:an?|the|my)\s+)?(invoice|quotation|receipt|proposal|purchase order)\b/i);
    const requestedType=typeClause||generationClause;
    if(intents.includes('generate')&&requestedType&&state.documentType&&documentType(requestedType[1])!==state.documentType)intents.push('change_type');
    const responseKinds = ['summary', 'change_type', 'generate', 'confirm_document','cancel_finalization','reuse', 'cancel', 'acknowledge', 'question'];
    return { ...(requestedType?{targetType:documentType(requestedType[1])}:{}), kind: responseKinds.find(kind => intents.includes(kind)) || intents[0], intents,
        acceptsPendingAnswer: intents.every(kind => kind === 'provide'),
        allowsMutation: intents.some(kind => ['provide', 'add', 'correct', 'remove', 'skip', 'cancel'].includes(kind)) };
}

export const ITEM_VALUE_LINK = String.raw`(?:(?:should|must)\s+(?:now\s+)?be|ought\s+to\s+be|needs?\s+to\s+be|has\s+to\s+be|is\s+(?:now\s+)?(?:to\s+be\s+)?|to|as|at|:|=)`;

export function explicitItemOperation(message, state) {
    const text = message.trim().replace(/^actually,?\s*/i, '');
    const items = state.slots?.lineItems || [];
    const proposal=(label,operation,item)=>{
        const matches=resolveItemTarget(label,items);
        if(matches.length===1)return {itemOperations:[{operation,id:matches[0].id||'item-'+items.indexOf(matches[0]),...(item?{item}:{})}]};
        const suggestions=matches.length?[]:suggestItemTargets(label,items);
        if(suggestions.length)return {pendingItemEdit:{label,operation,item,confirmTarget:true,candidateIds:suggestions.map(entry=>entry.id||'item-'+items.indexOf(entry))},clarification:'Please confirm the saved item you mean.'};
        return {pendingItemEdit:{label,operation,item,candidateIds:(matches.length?matches:items).map(entry=>entry.id||'item-'+items.indexOf(entry))},clarification:matches.length?'Several saved items match. Which item should I change?':'Which saved item do you mean?'};
    };
    const rename=text.match(/^(?:rename|change (?:the )?name of)\s+(.+?)\s+to\s+(.+?)[.!]?$/i);
    if(rename)return proposal(rename[1],'update',{description:rename[2]});
    const edit=text.match(/^(?:(?:change|update|set|correct|apply)\s+)?(?:the\s+)?(.+?)\s+((?:quantity|qty|unit price|price|rate|cost per (?:one|unit)|discount(?: rate)?)[\s\S]+)$/i);
    if(edit&&(/^(?:change|update|set|correct|apply)\s+/i.test(text)||resolveItemTarget(edit[1],items).length||suggestItemTargets(edit[1],items).length)&&!/^(?:what|why|how|when|where|which|can|could|would|do|does|is|are)\b|\?$/i.test(text)&&!canonicalKey(edit[1])) {
        const changes={};
        // A declaration about a known item is an edit. Unrecognized prose or
        // questions must still go through semantic interpretation.
        for(const clause of edit[2].split(/\s+and\s+|\s*,\s*(?=(?:quantity|qty|unit price|price|rate|cost per (?:one|unit)|discount(?: rate)?)\b)/i)) {
            const part=clause.match(new RegExp(String.raw`^(quantity|qty|unit price|price|rate|cost per (?:one|unit)|discount(?: rate)?)\s*(?:${ITEM_VALUE_LINK}\s*)?(.+?)[.!]?$`,'i'));
            if(!part){Object.keys(changes).forEach(key=>delete changes[key]);break;}
            const rawValue=part[2].replace(/\s+(?:now|please|instead)$/i,'');
            const value=parseAmount(/discount/i.test(part[1])?rawValue.replace(/\s*(?:%|percent)$/i,''):rawValue);if(value===undefined){Object.keys(changes).forEach(key=>delete changes[key]);break;}
            changes[/quantity|qty/i.test(part[1])?'quantity':/discount/i.test(part[1])?'discountRate':'unitPrice']=value;
        }
        if(Object.keys(changes).length)return proposal(edit[1],'update',changes);
    }
    const remove=text.match(/^(?:remove|delete)\s+(?:the\s+)?(.+?)[.!]?$/i);
    if(remove&&(resolveItemTarget(remove[1],items).length||/\b(?:item|service)\b/i.test(remove[1])&&!canonicalKey(remove[1])))return proposal(remove[1],'remove');
    const add = text.match(/^(?:add\s+(?:another\s+)?(?:a\s+)?)?(.+?)\s*,?\s*(?:quantity|qty)\s*(?:is|:|=)?\s*([\d.]+)\s*,?\s*(?:unit\s+)?price\s*(?:is|:|=)?\s*(?:LKR|USD|Rs\.?|[$€£])?\s*([\d,]+(?:\.\d+)?\s*(?:lakhs?|laks?|lacs?|k)?)[.!]?$/i)
        || text.match(/^(.+?)\s+(\d+(?:\.\d+)?)\s+(?:LKR|USD|Rs\.?|[$€£])\s*([\d,]+(?:\.\d+)?\s*(?:lakhs?|laks?|lacs?|k)?)[.!]?$/i);
    if (add && !/^(?:change|remove|delete|what|why|how|tell)\b/i.test(add[1])) return { itemOperations: [{ operation: 'add', item: { description: add[1].replace(/[, ]+$/, ''), quantity: Number(add[2]), unitPrice: parseAmount(add[3]) } }] };
    const partial = text.match(/^add\s+(?:another\s+)?(.+?)\s+(?:for|at)\s+(?:LKR|USD|Rs\.?|[$€£])?\s*([\d,]+(?:\.\d+)?\s*(?:lakhs?|laks?|lacs?|k)?)[.!]?$/i);
    if (partial) return { itemOperations: [{ operation: 'add', item: { ...(/^(?:a )?(?:service|item)$/i.test(partial[1]) ? {} : { description: partial[1] }), unitPrice: parseAmount(partial[2]) } }] };
    return undefined;
}

export const supportsField = (type, field) => [...contract.documents[type].required, ...contract.documents[type].optional].includes(field);
