import { canonicalKey, contract, documentType } from './document-contract.mjs';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
export function validateToolProposal(type, proposal) {
    const spec=contract.documents[documentType(type)], fields=new Set([...spec.required,...spec.optional]);
    const item=value=>object(value)&&!Object.keys(value).some(key=>!['id','description','quantity','unitPrice','discountRate'].includes(key))&&Object.entries(value).every(([key,v])=>['quantity','unitPrice','discountRate'].includes(key)?typeof v==='number':typeof v==='string');
    const invalid=()=>{throw Object.assign(new Error('Invalid document operation schema'),{code:'TOOL_SCHEMA_INVALID',statusCode:422,retryable:false});};
    if(!object(proposal)||Object.keys(proposal).some(key=>!['slots','evidence','evidenceSource','skip','clear','itemOperations','requestField','clarifications','fieldOperations','confirmBeforeApply','confirmationQuestion'].includes(key)))invalid();
    if(proposal.confirmBeforeApply!==undefined&&typeof proposal.confirmBeforeApply!=='boolean'||proposal.confirmBeforeApply&&(typeof proposal.confirmationQuestion!=='string'||!proposal.confirmationQuestion.trim()))invalid();
    if(proposal.fieldOperations!==undefined){if(!Array.isArray(proposal.fieldOperations)||proposal.fieldOperations.length>100)invalid();for(const op of proposal.fieldOperations){const field=canonicalKey(op.field),def=contract.fields[field];if(!object(op)||!fields.has(field)||Object.keys(op).some(key=>!['operation','field','value','evidence'].includes(key))||!['set','append','clear','skip'].includes(op.operation)||(op.evidence!==undefined&&typeof op.evidence!=='string'))invalid();if(['set','append'].includes(op.operation)&&(def.type==='items'?!Array.isArray(op.value)||!op.value.every(item):def.type==='number'?typeof op.value!=='number':typeof op.value!=='string'))invalid();if(op.operation==='append'&&!def.appendable)invalid();}}
    if(proposal.clarifications!==undefined&&(!Array.isArray(proposal.clarifications)||proposal.clarifications.length>10||proposal.clarifications.some(value=>!object(value)||!fields.has(value.field)||Object.keys(value).some(key=>!['field','rawValue','suggestedValue','reason'].includes(key))||!['rawValue','suggestedValue','reason'].every(key=>typeof value[key]==='string'&&value[key].trim()))))invalid();
    if(proposal.requestField!==undefined&&(typeof proposal.requestField!=='string'||!fields.has(proposal.requestField)))invalid();
    for(const key of ['slots','evidence','evidenceSource']) {
        if(proposal[key]===undefined)continue;
        if(!object(proposal[key]))invalid();
        for(const [alias,value]of Object.entries(proposal[key])) {
            const field=canonicalKey(alias);
            if(!fields.has(field))invalid();
            if(key!=='slots'&&typeof value!=='string')invalid();
            if(key==='slots') {
                const kind=contract.fields[field].type;
                if(kind==='items'&&(!Array.isArray(value)||!value.every(entry=>item(entry)&&typeof entry.description==='string'))||kind==='number'&&typeof value!=='number'||!['items','number'].includes(kind)&&typeof value!=='string')invalid();
            }
        }
    }
    for(const key of ['skip','clear'])if(proposal[key]!==undefined&&(!Array.isArray(proposal[key])||proposal[key].some(value=>typeof value!=='string'||!fields.has(canonicalKey(value)))))invalid();
    if(proposal.slots?.lineItems&&!proposal.slots.lineItems.every(item))invalid();
    if(proposal.itemOperations!==undefined) {
        if(!Array.isArray(proposal.itemOperations)||proposal.itemOperations.length>100)invalid();
        for(const op of proposal.itemOperations)if(!object(op)||Object.keys(op).some(key=>!['operation','id','item'].includes(key))||!['add','update','remove'].includes(op.operation)||(op.id!==undefined&&typeof op.id!=='string')||(op.operation!=='add'&&typeof op.id!=='string')||(op.item?.id!==undefined)||(op.operation!=='remove'&&!item(op.item)))invalid();
    }
    return proposal;
}
