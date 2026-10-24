import {amountEvidence,parseAmount,resolveItemTarget} from './amounts.mjs';
import {documentAssets} from './document-assets.mjs';
import {documentEdits} from './document-edits.mjs';
import { explicitFieldEdits, fieldTarget, contactOwner } from './field-edits.mjs';
import { extractItemTable } from './item-table.mjs';
import { identifyIntent, requestedField, explicitItemOperation, ITEM_VALUE_LINK, supportsField } from './conversation-intent.mjs';
import { canonicalize, canonicalKey, normalizeSlots, validField, workflow, contract, calendarDate,templateSchema } from './document-contract.mjs';
import { fieldRecord,formatFieldText,formatOrdinaryText,formatMoney,formatDate,unresolvedStatuses,possibleTypo,formatAddress,literalSpan,deriveFieldEvidence,preserveKnownNameCase } from './field-processing.mjs';
export function metadata(raw = {}) { return { version: 1, revision: 0, fields: {}, turns: {}, ...raw._chat, fields: { ...raw._chat?.fields }, turns: { ...raw._chat?.turns } }; }
// PostgreSQL JSONB does not preserve object insertion order. Turn UUID order
// must never determine which message can be retried or supplies the context.
export function latestTurn(meta) {
    if (meta.latestTurnId && meta.turns?.[meta.latestTurnId]) return [meta.latestTurnId, meta.turns[meta.latestTurnId]];
    return Object.entries(meta.turns || {}).sort(([a,x],[b,y]) => (Number(x.startedAt)||0)-(Number(y.startedAt)||0) || a.localeCompare(b)).at(-1);
}
function currentSlots(raw, meta) {
    const values = {};
    for (const [alias, value] of Object.entries(raw || {})) {
        const key = canonicalKey(alias);
        if (!key)
            continue;
        const normalized = normalizeSlots({ [key]: value }, values)[key];
        if (key in values && JSON.stringify(values[key]) !== JSON.stringify(normalized)) {
            if (validField(key, values[key]) && validField(key, normalized)) {
                const canonical = alias === key;
                meta.fields[key] = { status: 'conflicting', source: 'legacy_alias', proposed: canonical ? values[key] : normalized };
                if (canonical)
                    values[key] = normalized;
            }
            else if (!validField(key, values[key]) && validField(key, normalized))
                values[key] = normalized;
        }
        else
            values[key] = normalized;
    }
    const normalized=normalizeSlots(values);
    for(const field of ['senderAddress','clientAddress'])if(typeof normalized[field]==='string'&&meta.fields[field]?.formatting!=='preserve') {
        normalized[field]=formatAddress(normalized[field],[values.businessName,values.clientName,...Object.values(meta.knownNames||{}).flat()]);
        if(meta.fields[field]?.status==='confirmed')meta.fields[field]={...meta.fields[field],normalizedValue:normalized[field]};
    }
    for(const [key,value] of Object.entries(normalized)) {
      if(value===null||value===undefined||value==='') {delete normalized[key];continue;}
      if(contract.fields[key]?.skippable && typeof value==='string' && /^(skip|none|not applicable)$/i.test(value.trim())) {delete normalized[key];meta.fields[key]={status:'skipped',source:'legacy_skip'};continue;}
      if(!validField(key,value)&&!meta.fields[key])meta.fields[key]={status:'uncertain',source:'legacy_validation'};
    }
    return normalized;
}
export function snapshot(session) {
    const meta = metadata(session.slots),kind=meta.documentType || session._resolvedDocumentType || session.documentTypeId;
    const schema=templateSchema(kind,session.templateId||meta.templateId,meta.documentSchema);
    const w = workflow(kind, currentSlots(session.slots, meta), meta.fields,schema,meta.collection);
    const dataValid = w.readyToGenerate;
    if (meta.pendingField && contract.fields[meta.pendingField] && !Object.values(w.fieldStates).some(field=>unresolvedStatuses.includes(field.status))) {
        const label=contract.fields[meta.pendingField].label;
        w.nextAction = {kind: 'ask', field: meta.pendingField, question: validField(meta.pendingField,w.slots[meta.pendingField]) ? `Your ${label} is already saved. What would you like to change it to?` : `Sure, ${contract.fields[meta.pendingField].question.charAt(0).toLowerCase()+contract.fields[meta.pendingField].question.slice(1)}`};
        w.stage = 'collecting';
        w.readyToGenerate = false;
    }
    if(meta.pendingAction){w.nextAction={kind:'confirm_operation',field:null,question:meta.pendingAction.question};w.readyToGenerate=false;w.stage='clarifying';}
    if(meta.pendingContact) {
        w.nextAction={kind:'clarify',field:null,question:`Is ${meta.pendingContact.value} the business phone or the client phone? Please specify the owner.`};
        w.readyToGenerate=false;w.stage='clarifying';
    }
    if(meta.pendingLanguage){w.nextAction={kind:'clarify',field:meta.pendingLanguage.field,question:meta.pendingLanguage.question};w.readyToGenerate=false;w.stage='clarifying';}
    const expired = session.expiresAt && new Date(session.expiresAt).getTime() < Date.now();
    const lifecycle = expired ? 'EXPIRED' : session.status;
    const latest = latestTurn(meta);
    const interrupted = latest && ['running','failure','incomplete','cancelled'].includes(latest[1].status) && latest[1].retryable!==false && !latest[1].flagged;
    const pendingTurn=interrupted && latest[1].message ? {id:latest[0],message:latest[1].message} : null;
    const assets=documentAssets(meta.assets);
    const fingerprint=stableStringify({type:w.documentType,templateId:session.templateId||meta.templateId||null,schema: w.schema.required_keys,slots:w.slots,...(assets.length?{assets:assets.map(({id,role,hash})=>({id,role,hash}))}:{})});
    const confirmed=meta.finalization?.fingerprint===fingerprint && meta.finalization.status==='confirmed';
    const awaitingFinalization=meta.finalization?.fingerprint===fingerprint && meta.finalization.status==='requested';
    if(awaitingFinalization&&w.readyToGenerate)w.nextAction={kind:'confirm_document',field:null,question:'Please confirm the reviewed details to finalize this document, or tell me what to change.'};
    const ready = w.readyToGenerate && !interrupted && ['ACTIVE','COMPLETED'].includes(lifecycle);
    const canGenerate = ready && confirmed;
    const fieldStates={...w.fieldStates};
    for(const key of [...schema.required,...schema.optional])fieldStates[key]={field:key,rawInput:w.slots[key]??null,normalizedValue:w.slots[key]??null,validationStatus:validField(key,w.slots[key])?'valid':'missing',confirmationStatus:validField(key,w.slots[key])?'confirmed':'unconfirmed',status:validField(key,w.slots[key])?'confirmed':'missing',updatedAt:null,...fieldStates[key]};
    return { sessionId: session.id, userId: session.userId, revision: meta.revision, canvasLayout:meta.canvasLayout || null, layoutRevision:meta.layoutRevision || 0, editorContext:meta.editorContext||null,editorClarification:meta.editorClarification||null,pendingLanguage:meta.pendingLanguage||null,canUndo:!!meta.documentHistory?.past?.length,canRedo:!!meta.documentHistory?.future?.length,...w, fieldStates, lifecycle, assets,
        stage: lifecycle === 'ACTIVE' ? interrupted ? 'recovering' : awaitingFinalization?'awaiting_confirmation':w.stage : 'read_only', readOnly: lifecycle !== 'ACTIVE', dataValid, canGenerate, readyToGenerate: ready, pendingTurn, pendingIntent:meta.pendingLanguage?{kind:'language',field:meta.pendingLanguage.field,question:meta.pendingLanguage.question}:meta.pendingAction?{kind:'operation',action:meta.pendingAction.kind,...(meta.pendingAction.kind==='item_choice'?{candidateIds:meta.pendingAction.candidateIds,allowYes:meta.pendingAction.confirmTarget===true&&meta.pendingAction.candidateIds.length===1}:{}),question:meta.pendingAction.question}:meta.pendingContact?{kind:'contact_owner',value:meta.pendingContact.value}:meta.pendingIntent||null, operationResults:meta.lastResults||[],finalization:{status:confirmed?'confirmed':awaitingFinalization?'requested':'unconfirmed',fingerprint,...(confirmed?{confirmedAt:meta.finalization.confirmedAt}:{})},
        timezone:meta.timezone||'UTC',referenceDate:calendarDate(latest?.[1].startedAt||Date.now(),meta.timezone||'UTC').toISOString().slice(0,10),templateId: session.templateId, accentColor: session.accentColor, title: session.title };
}
function numericEvidence(value,text){return amountEvidence(value,text);}
function numericRoles(item,text,description=item.description) {
    const table=extractItemTable(String(text));
    const parsed=explicitItemOperation(String(text),{slots:{lineItems:[]}});
    const candidates=table?.lineItems||parsed?.itemOperations?.map(op=>op.item).filter(Boolean)||[parsed?.pendingItemEdit?.item].filter(Boolean);
    const known=candidates.filter(candidate=>!item.description||!candidate.description||candidate.description.toLowerCase()===item.description.toLowerCase());
    let scoped=String(text);
    const index=description?scoped.toLowerCase().indexOf(description.toLowerCase()):-1;
    if(index>=0)scoped=scoped.slice(index);
    for(const [key,label] of [['quantity','(?:quantity|qty|units)'],['unitPrice','(?:unit price|price|rate|cost per (?:one|unit))'],['discountRate','discount(?: rate)?']]) {
        if(item[key]===undefined)continue;
        if(known.some(candidate=>candidate[key]===item[key]))continue;
        const match=scoped.match(new RegExp(String.raw`\b${label}["']?\s*(?:${ITEM_VALUE_LINK})?\s*(?:LKR|USD|Rs\.?|[$€£])?\s*((?:[0-9]{1,3}(?:[, \u00a0\u202f][0-9]{3})+|[0-9]+)(?:\.[0-9]+)?(?:\s*(?:lakhs?|laks?|lacs?|k))?)`,'i'));
        if(key!=='discountRate'&&match&&/^\s*%/.test(scoped.slice(match.index+match[0].length)))return false;
        const backwards=key==='quantity'?scoped.match(/\b([0-9]+(?:\.[0-9]+)?)\s+units\b/i):key==='unitPrice'?scoped.match(/\b((?:[0-9]{1,3}(?:[, \u00a0\u202f][0-9]{3})+|[0-9]+)(?:\.[0-9]+)?(?:\s*(?:lakhs?|laks?|lacs?|k))?)\s*(?:LKR|USD)?\s+(?:each|per unit)\b/i):undefined;
        if(parseAmount(match?.[1]??backwards?.[1])!==item[key])return false;
    }
    return true;
}
function itemTargetEvidence(index, items, message) {
    if(index<0)return false;
    const parsed=explicitItemOperation(message,{slots:{lineItems:items}});
    if(parsed?.itemOperations?.some(operation=>operation.id===items[index].id))return true;
    const ordinal=message.match(/\b(first|second|third|fourth|\d+)(?:st|nd|rd|th)?\s+(?:item|service)\b/i);
    if(ordinal)return index===({first:0,second:1,third:2,fourth:3}[ordinal[1].toLowerCase()] ?? Number(ordinal[1])-1);
    if(message.toLowerCase().includes(items[index].description.toLowerCase()))return true;
    return items.length===1 && /\b(?:item|service|price|rate|quantity|qty)\b/i.test(message) && !/\b(?:business|company|client)\s+(?:name|address|phone|email)\b/i.test(message);
}
function evidencedItem(item,source,evidence) {
  if(typeof item?.description!=='string'||!item.description.trim())return false;
  if(source.kind!=='model')return true;
  return numericRoles(item,evidence||source.message) && String(evidence||source.message).toLowerCase().includes(item.description.toLowerCase())&&['quantity','unitPrice','discountRate'].every(key=>item[key]===undefined||numericEvidence(item[key],evidence||source.message)||key==='quantity'&&explicitItemOperation(evidence||source.message,{slots:{lineItems:[]}})?.itemOperations?.some(op=>op.item?.quantity===item.quantity&&op.item?.description.toLowerCase()===item.description.toLowerCase()));
}
export function applyCandidates(type, raw, proposal, source) {
    const action=metadata(raw).pendingAction;
    const currentCurrency=currentSlots(raw,metadata(raw)).currency;
    const pricesRequested=proposal.slots?.lineItems||proposal.itemOperations?.some(op=>op.item?.unitPrice!==undefined);
    if(pricesRequested&&!source.verifiedConfirmation&&validField('currency',currentCurrency)) {
        const codes=[...String(source.message).matchAll(/\b(LKR|USD|EUR|GBP|AUD|CAD|NZD|SGD|JPY|CHF|INR)\b/gi)].map(match=>match[1].toUpperCase());
        const conflicting=codes.find(code=>code!==currentCurrency);
        const ambiguousDollar=/\bdollars?\b|\$/.test(source.message)&&!['USD','AUD','CAD','NZD','SGD','HKD'].includes(currentCurrency);
        const symbolConflict=/€/.test(source.message)&&currentCurrency!=='EUR'||/£/.test(source.message)&&currentCurrency!=='GBP';
        if(conflicting||ambiguousDollar||symbolConflict) {
            // Persist the actual proposed operation, rather than interpreting
            // an amount in a different currency or silently relabeling prices.
            const verified=applyCandidates(type,structuredClone(raw),proposal,{...source,verifiedConfirmation:true});
            if(verified.results.some(result=>result.outcome==='rejected'||result.outcome==='needs_value'))return {raw,changed:[],results:verified.results.filter(result=>result.outcome==='rejected'||result.outcome==='needs_value')};
            const next=structuredClone(raw),meta=metadata(next);
            meta.pendingAction={kind:'item_currency',proposal,source:{id:source.id,kind:source.kind,message:source.message,correction:source.correction},question:`Your document uses ${currentCurrency}, but this item specifies ${conflicting||(/€/.test(source.message)?'EUR':/£/.test(source.message)?'GBP':'dollars')}. Which currency code should I use? Reply ${currentCurrency} to keep it, or another currency code to change the whole document. Existing prices will not be converted.`};
            delete meta.finalization;next._chat=meta;
            return {raw:next,changed:[],results:[{field:'currency',outcome:'needs_confirmation'}]};
        }
    }
    if(proposal.resolveOperation&&action) {
        if(source.kind!=='user')throw Object.assign(new Error('Only the user can confirm an operation'),{code:'EVIDENCE_REJECTED',statusCode:422});
        const next=structuredClone(raw);delete next._chat.pendingAction;
        if(!proposal.resolveOperation.accept)return {raw:next,changed:[],results:[{field:'conversation',outcome:'cancelled'}]};
        let update=action.proposal;
        if(action.kind==='item_currency') {
            const currency=proposal.resolveOperation.currency;
            if(!validField('currency',currency))return {raw,changed:[],results:[{field:'currency',outcome:'needs_confirmation'}]};
            update={...update,slots:{...update.slots,currency},evidence:{...update.evidence,currency}};
        }
        if(action.kind==='discount_mode'){const field=proposal.resolveOperation.discountField;if(!contract.financial.discountFields.includes(field))return {raw,changed:[],results:[{field:'discount',outcome:'needs_confirmation'}]};update={slots:{[field]:action.value}};}
        if(action.kind==='note_date'){const date=proposal.resolveOperation.date;if(!validField('issueDate',date))return {raw,changed:[],results:[{field:action.field,outcome:'needs_confirmation'}]};update={fieldOperations:[{operation:action.operation,field:action.field,value:action.value.replace(action.invalidDate,date)}]};}
        if(action.kind==='item_choice') {
            const id=proposal.resolveOperation.itemId;
            if(!action.candidateIds.includes(id))return {raw,changed:[],results:[{field:'lineItems',outcome:'needs_confirmation'}]};
            update={itemOperations:[{operation:action.operation,id,...(action.item?{item:action.item}:{})}]};
        }
        return applyCandidates(type,next,update,{...action.source,...(action.kind==='item_currency'?{message:action.source.message+'\n'+source.message}:{}),kind:['item_choice','note_date','discount_mode'].includes(action.kind)?'user':action.source.kind,verifiedConfirmation:true,correction:true,confirmedBy:source.id,now:source.now});
    }
    if(proposal.confirmBeforeApply) {
        if(source.kind!=='model'||typeof proposal.confirmationQuestion!=='string')throw Object.assign(new Error('Invalid pending operation'),{code:'TOOL_SCHEMA_INVALID',statusCode:422});
        const update={...proposal};delete update.confirmBeforeApply;delete update.confirmationQuestion;
        // Validate a proposal in isolation: confirmation grants permission only
        // to this discarded clone. The saved document stays unchanged until yes.
        const verified=applyCandidates(type,structuredClone(raw),update,{...source,verifiedConfirmation:true});
        if(!verified.results.length||verified.results.some(result=>result.outcome==='rejected'||result.outcome==='needs_value'))throw Object.assign(new Error('Pending operation requires validated user evidence'),{code:'EVIDENCE_REJECTED',statusCode:422});
        const next=structuredClone(raw);next._chat={...metadata(raw),pendingAction:{kind:'confirmation',proposal:update,source:{id:source.id,kind:source.kind,message:source.message,correction:source.correction},question:proposal.confirmationQuestion.slice(0,1000)}};delete next._chat.finalization;
        return {raw:next,changed:[],results:[{field:'conversation',outcome:'needs_confirmation'}]};
    }
    const meta=metadata(raw),current=currentSlots(raw,meta);
    const sets={},operationEvidence={},operationClear=[],operationSkip=[];
    for(const op of proposal.fieldOperations||[]){const field=canonicalKey(op.field);if(!field||!supportsField(type,field)||contract.fields[field].editable===false||!['set','append','clear','skip'].includes(op.operation))throw Object.assign(new Error('Unsupported editable field operation'),{code:'TOOL_SCHEMA_INVALID',statusCode:422});if(op.operation==='set'){sets[field]=op.value;operationEvidence[field]=op.evidence;}if(op.operation==='clear')operationClear.push(field);if(op.operation==='skip')operationSkip.push(field);}
    proposal={...proposal,slots:{...proposal.slots,...sets},evidence:{...proposal.evidence,...Object.fromEntries(Object.entries(operationEvidence).filter(([,value])=>value!==undefined))},clear:[...(proposal.clear||[]),...operationClear],skip:[...(proposal.skip||[]),...operationSkip]};
    const patch=normalizeSlots(proposal.slots||{},current,calendarDate(source.now||Date.now(),meta.timezone||'UTC'));
    meta.fields=workflow(type,current,meta.fields,templateSchema(type,meta.templateId,meta.documentSchema)).fieldStates;
    const changed = [], results = [];
    const record = (field,outcome,code,id) => results.push({field,outcome,...(code?{code}:{}),...(id?{id}:{})});
    const stamp=(field,value,status='confirmed',extra={})=>fieldRecord(field,source.kind==='model'&&typeof evidenceMap[field]==='string'?evidenceMap[field]:canonicalize(proposal.slots||{})[field]??value,value,source,status,extra);
    for (const alias of Object.keys(proposal.slots || {})) {
        const field = canonicalKey(alias);
        if (!field || !supportsField(workflow(type).documentType, field)) throw Object.assign(new Error('Unsupported document field'), {code:'TOOL_SCHEMA_INVALID',statusCode:422});
    }
    if(proposal.skipAllOptional){meta.collection={...meta.collection,optionalDismissed:true};const required=workflow(type,current,meta.fields,templateSchema(type,meta.templateId,meta.documentSchema)).schema.required_keys;if(meta.pendingAction){const action=meta.pendingAction,targets=action.field?[action.field]:[...Object.keys(action.proposal?.slots||{}),...(action.proposal?.fieldOperations||[]).map(op=>op.field)];if(targets.length&&targets.every(key=>!required.includes(key)))delete meta.pendingAction;}proposal.skip=[...new Set([...proposal.skip,...contract.documents[type].optional.filter(key=>!required.includes(key)&&(!validField(key,current[key])||unresolvedStatuses.includes(meta.fields[key]?.status))&&contract.fields[key].skippable)])];}
    if (proposal.cancelField) {delete meta.pendingAction; delete meta.pendingField; delete meta.pendingIntent; record('conversation', 'cancelled'); }
    if (proposal.intent) meta.lastIntent = proposal.intent;
    if(proposal.unassignedContact) {
        meta.pendingContact={value:proposal.unassignedContact,source:source.id};record('phone','needs_confirmation');
    }
    if(proposal.resolveContact)delete meta.pendingContact;
    for (const alias of proposal.clear || []) {
        const field = canonicalKey(alias);
        if (!field || !supportsField(workflow(type).documentType, field)) throw Object.assign(new Error('Unsupported field removal'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        if (source.kind === 'model' && (!/\b(remove|delete|clear)\b/i.test(source.message) || !new RegExp(field.replace(/([A-Z])/g,' $1'),'i').test(source.message) && !extractExplicit(source.message, snapshot({id:'s',status:'ACTIVE',documentTypeId:type,slots:raw})).clear?.includes(field))) throw Object.assign(new Error('Field removal requires explicit evidence'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        if(workflow(type,current,meta.fields,templateSchema(type,meta.templateId,meta.documentSchema)).schema.required_keys.includes(field)) {record(field,'rejected','REQUIRED_FIELD');continue;}
        if (field in current) changed.push(field);
        delete current[field]; meta.fields[field] = fieldRecord(field,null,null,source,'missing',{cleared:true});
        if(meta.pendingField===field) {delete meta.pendingField;delete meta.pendingIntent;}
        record(field,changed.includes(field)?'cleared':'unchanged');
    }
    if(proposal.pendingItemEdit){const pending=proposal.pendingItemEdit;meta.pendingAction={kind:'item_choice',...pending,source:{id:source.id,kind:'user',message:source.message,correction:true},question:pending.confirmTarget&&pending.candidateIds.length===1?`Did you mean ${current.lineItems?.find((item,index)=>(item.id||'item-'+index)===pending.candidateIds[0])?.description}? Apply ${Object.entries(pending.item||{}).map(([key,value])=>`${key==='unitPrice'?'unit price':key==='discountRate'?'discount rate':key} ${value}`).join(', ')} to this saved item? Reply yes or no.`:'Which saved item do you mean? '+pending.candidateIds.map((id,index)=>`${index+1}. ${current.lineItems?.find((item,index)=>(item.id||'item-'+index)===id)?.description||id}`).join('; ')};record('lineItems','needs_confirmation');delete meta.finalization;}
    if(proposal.pendingDiscountMode){meta.pendingAction={kind:'discount_mode',value:proposal.pendingDiscountMode.value,source:{id:source.id,kind:'user',message:source.message},question:`Is ${proposal.pendingDiscountMode.value} a percentage discount, or a fixed amount in ${current.currency||'the document currency'}?`};record('discount','needs_confirmation');delete meta.finalization;}
    if(proposal.pendingDiscountCurrency){const p=proposal.pendingDiscountCurrency;meta.pendingAction={kind:'confirmation',proposal:{slots:{[p.field]:p.value,currency:p.currency}},source:{id:source.id,kind:'user',message:source.message,correction:true},question:`Your document uses ${current.currency}. Change the whole document currency to ${p.currency} and apply this discount, keeping existing prices unchanged? Reply yes, or provide the discount in ${current.currency}.`};record('currency','needs_confirmation');delete meta.finalization;}
    if (proposal.requestField) {
        const spec = contract.documents[workflow(type).documentType];
        if (!['user','model'].includes(source.kind) || ![...spec.required, ...spec.optional].includes(proposal.requestField)) throw Object.assign(new Error('Unsupported field request'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        if(source.kind==='model') {
            const literal=canonicalize(proposal.evidence||{})[proposal.requestField];
            if(typeof literal!=='string' || !source.message.toLowerCase().includes(literal.toLowerCase()) || requestedField(literal)!==proposal.requestField || !/\b(add|enter|set|change|update|edit)\b/i.test(source.message)) throw Object.assign(new Error('Field request needs user intent evidence'),{code:'EVIDENCE_REJECTED',statusCode:422,retryable:false});
        }
        meta.pendingField = proposal.requestField;
        meta.pendingIntent = {kind: validField(proposal.requestField,current[proposal.requestField]) ? 'update' : 'provide', field:proposal.requestField};
    }
    let pendingItems=[...(meta.fields.lineItems?.pending||[])];
    if(proposal.cancelPending) {pendingItems=[];meta.fields.lineItems={status:validField('lineItems',current.lineItems)?'confirmed':'missing',source:source.id};}
    if(proposal.pendingAnswer&&pendingItems[0]) {
      const pending=pendingItems.shift();pending.item={...pending.item,...proposal.pendingAnswer};
      proposal={...proposal,itemOperations:[{...pending,fromPending:true},...(proposal.itemOperations||[])]};
    }
    const evidenceMap=canonicalize(proposal.evidence||{}),sourceMap=canonicalize(proposal.evidenceSource||{});
    for (const [field, candidate] of Object.entries(patch)) {
        let value = candidate;
        const def = contract.fields[field];
        if (!def)
            throw Object.assign(new Error('Unknown field'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        let evidence = evidenceMap[field];
        const historyId=sourceMap[field];
        const historical=historyId&&source.history&&Object.hasOwn(source.history,historyId)?source.history[historyId]:undefined;
        if(historyId&&!historical){record(field,'rejected','EVIDENCE_REJECTED');continue;}
        if(historical&&(validField(field,current[field])||meta.fields[field]?.cleared||meta.fields[field]?.status==='skipped')){record(field,validField(field,current[field])?'unchanged':'retained');continue;}
        const evidenceMessage=historical?.content||source.message;
        if(source.kind==='model'&&!literalSpan(evidenceMessage,evidence)) {
            const derived=deriveFieldEvidence(field,value,evidenceMessage);
            if(derived){evidence=derived;evidenceMap[field]=derived;}
        }

        if(field==='currency'&&/^\s*[$¥]\s*$/.test(String(evidence||canonicalize(proposal.slots||{})[field]))&&!validField('currency',current.currency)) {meta.fields.currency=stamp('currency',undefined,'ambiguous',{question:'Which currency should I use? The symbol alone could mean more than one currency; please give the currency code.'});record(field,'needs_confirmation');continue;}
        const evidenceTime=historical?.createdAt?new Date(historical.createdAt).getTime():source.now||Date.now();
        if(historical)value=normalizeSlots({[field]:candidate},current,calendarDate(evidenceTime,meta.timezone||'UTC'))[field];
        if (source.kind === 'model' && (typeof evidence !== 'string' || !evidence.trim() || !literalSpan(evidenceMessage,evidence))) {
            record(field,'rejected','EVIDENCE_REJECTED'); continue;
        }
        if(source.kind==='model'&&def.party&&['email','phone'].includes(def.type)||source.kind==='model'&&def.format==='address') {
            const owner=contactOwner(evidenceMessage,evidence,snapshot({id:'s',status:'ACTIVE',documentTypeId:type,slots:raw}),!!historical);
            if(owner!==def.party){
                if(!owner&&!historical&&def.type==='phone'&&validField(field,evidence)) {meta.pendingContact={value:evidence.trim(),source:source.id};record(field,'needs_confirmation');}
                else record(field,'rejected',historical?'OWNERSHIP_UNRESOLVED':'EVIDENCE_REJECTED');
                continue;
            }
        }
        if(source.kind==='model'&&def.type==='phone'&&validField(field,evidence))value=evidence.trim();
        if(source.kind==='model'&&def.type==='email'&&typeof value==='string') {
            const start=evidence.toLowerCase().indexOf(value.toLowerCase());
            if(start>=0)value=evidence.slice(start,start+value.length);
        }
        if (source.kind === 'model' && typeof value === 'string' && !['date', 'currency'].includes(def.type) && !evidence.toLowerCase().includes(value.toLowerCase())) {
            if(['notesAndTerms','paymentTerms','accountDetails'].includes(field)) value=evidence.trim();
            else if (['senderAddress','clientAddress'].includes(field) && evidence.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'').includes(value.toLowerCase().replace(/[^\p{L}\p{N}]/gu,''))) value = evidence.trim();
            else {record(field,'rejected','EVIDENCE_REJECTED');continue;}
        }
        if (source.kind === 'model' && def.type === 'number' && !numericEvidence(value, evidence) && !(value === 0 && /\b(no tax|tax exempt|zero)\b/i.test(evidence)))
            { record(field,'rejected','EVIDENCE_REJECTED'); continue; }
        if (source.kind === 'model' && ['date', 'currency'].includes(def.type) && normalizeSlots({ [field]: evidence }, current, calendarDate(evidenceTime,meta.timezone||'UTC'))[field] !== value)
            { record(field,'rejected','EVIDENCE_REJECTED'); continue; }
        if (source.kind === 'model' && ['businessName', 'clientName'].includes(field)) {
            const start = evidence.toLowerCase().indexOf(value.toLowerCase());
            value = evidence.slice(start, start + value.length);
        }
        const preserve = meta.fields[field]?.formatting === 'preserve' || /\b(?:exact(?:ly)?|legal name|preserve (?:the )?(?:case|spelling)|case sensitive)\b/i.test(source.message||'');
        const ordinaryLowercase=typeof value==='string'&&value===value.toLowerCase();
        if(typeof value==='string')value=formatFieldText(field,value,preserve);
        if(def.format==='name'&&ordinaryLowercase&&!/\b(?:exact(?:ly)?|legal name|preserve (?:the )?(?:case|spelling)|case sensitive)\b/i.test(source.message||''))value=preserveKnownNameCase(value,[current[field],...(Array.isArray(meta.knownNames)?meta.knownNames:meta.knownNames?.[field]||[])]);

        if(def.format==='address'&&!preserve)value=formatAddress(value,[current.businessName,current.clientName,...Object.values(meta.knownNames||{}).flat()]);
        if(field==='lineItems'&&Array.isArray(value))value=value.map(item=>({...item,description:typeof item.description==='string'?formatOrdinaryText(item.description.trim().replace(/\s+/g,' ')):item.description}));
        if(field==='lineItems'&&Array.isArray(value)&&value.length&&value.every(item=>evidencedItem(item,source,evidence))&&!validField(field,value)) {
            pendingItems=value.filter(item=>!validField('lineItems',[item])).map((item,index)=>{const known=current.lineItems?.find(old=>old.id===item.id);return {operation:source.correction&&known?'update':'add',id:known?.id||source.id+':pending:'+index,item};});
            meta.fields.lineItems=fieldRecord('lineItems',proposal.slots.lineItems,current.lineItems||[],source,'ambiguous',{pending:pendingItems});record('lineItems','needs_value');continue;
        }
        if (!validField(field, value)) {
            meta.fields[field] = stamp(field,value,'invalid',{...(def.type==='date' ? {question:/^next (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i.test(String(candidate)) ? 'Which date do you mean by “'+candidate+'”? Please give YYYY-MM-DD so I do not choose the wrong week.' : 'Please provide an unambiguous date (YYYY-MM-DD, today, tomorrow, or a number of days).'} : {})});
            record(field,'rejected','VALIDATION_FAILED'); continue;
        }
        if (source.kind === 'model' && def.type === 'items') {
            if(value.some(item=>!evidencedItem(item,source,evidence))) {record(field,'rejected','EVIDENCE_REJECTED');continue;}
        }
        const old = current[field];
        const knownNames=['businessName','clientName'].includes(field)?[old,...(Array.isArray(meta.knownNames)?meta.knownNames:meta.knownNames?.[field]||[])].filter(value=>typeof value==='string'):[];
        const typo=!preserve?possibleTypo(value,knownNames):undefined;
        if(typo&&JSON.stringify(old)!==JSON.stringify(value)&&meta.fields[field]?.status!=='awaiting_confirmation') {
            meta.fields[field]=stamp(field,value,'awaiting_confirmation',{original:value,proposed:typo,question:`Just to confirm, is the ${def.label} “${value}”, or did you mean “${typo}”? You can give either name or say keep the original.`});record(field,'needs_confirmation');continue;
        }
        const correction = source.verifiedConfirmation===true || (source.kind !== 'model' ? source.correction && (!proposal.correctionFields || proposal.correctionFields.includes(field)) : extractExplicit(source.message, snapshot({id:'s',status:'ACTIVE',documentTypeId:type,slots:raw})).correctionFields?.includes(field)) || (source.kind === 'user' && (meta.pendingField === field || unresolvedStatuses.includes(meta.fields[field]?.status)));
        if (validField(field, old) && JSON.stringify(old) !== JSON.stringify(value) && !correction) {
            meta.fields[field] = stamp(field,old,'conflicting',{proposed:value});
            record(field,'conflicting'); continue;
        }
        current[field] = value;
        if(contract.financial.discountFields.includes(field)){const other=contract.financial.discountFields.find(key=>key!==field);if(!(other in patch)){delete current[other];meta.fields[other]=fieldRecord(other,null,null,source,'missing',{cleared:true});}}
        if(['businessName','clientName'].includes(field)){const history=Array.isArray(meta.knownNames)?{}:meta.knownNames||{};meta.knownNames={...history,[field]:[...new Set([...(history[field]||[]),value])].slice(-32)};}
        meta.fields[field] = stamp(field,value,'confirmed',{...(preserve?{formatting:'preserve'}:{}),...(historyId?{evidenceSource:historyId}:{})});
        if (JSON.stringify(old) !== JSON.stringify(value))
            changed.push(field);
        record(field, JSON.stringify(old) === JSON.stringify(value) ? 'unchanged' : 'committed');
        if(meta.pendingField===field) { delete meta.pendingField; delete meta.pendingIntent; }
    }
    for(const op of proposal.fieldOperations||[])if(op.operation==='append') {
        const field=canonicalKey(op.field);
        if(!contract.fields[field].appendable){record(field,'rejected','VALIDATION_FAILED');continue;}
        const fragmentRaw={...current,_chat:{...meta,fields:{...meta.fields}}};delete fragmentRaw[field];delete fragmentRaw._chat.fields[field];
        const fragment=applyCandidates(type,fragmentRaw,{slots:{[field]:op.value},evidence:{[field]:op.evidence||proposal.evidence?.[field]}},{...source,correction:true});
        if(fragment.results.some(result=>result.outcome==='rejected')||!validField(field,fragment.raw[field])){const text=formatFieldText(field,op.value);const date=typeof text==='string'&&[...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)].find(match=>!validField('issueDate',match[0]))?.[0];if(source.kind==='user'&&date){meta.pendingAction={kind:'note_date',operation:'append',field,value:text,invalidDate:date,source:{id:source.id,kind:'user',message:source.message},question:'That date is not valid. Which date should appear in the note? Please give YYYY-MM-DD.'};record(field,'needs_confirmation');}else record(field,'rejected','VALIDATION_FAILED');continue;}
        const value=[current[field],fragment.raw[field]].filter(Boolean).join('\n');
        if(!validField(field,value)){record(field,'rejected','VALIDATION_FAILED');continue;}
        current[field]=value;meta.fields[field]=fieldRecord(field,op.value,value,source);changed.push(field);record(field,'committed');
    }
    for (const clarification of proposal.clarifications || []) {
        const field=canonicalKey(clarification.field),definition=contract.fields[field];
        if(!definition||!supportsField(workflow(type).documentType,field)||typeof clarification.rawValue!=='string'||!source.message.toLowerCase().includes(clarification.rawValue.toLowerCase())||!validField(field,clarification.suggestedValue))throw Object.assign(new Error('Clarification needs literal user evidence and a valid suggestion'),{code:'EVIDENCE_REJECTED',statusCode:422});
        if((raw._chat?.fields?.[field]?.confirmationStatus==='confirmed'||raw._chat?.fields?.[field]?.status==='confirmed') && !source.correction)continue;
        if(source.kind==='model'&&definition.party&&(['email','phone'].includes(definition.type)||definition.format==='address')&&contactOwner(source.message,clarification.rawValue,snapshot({id:'s',status:'ACTIVE',documentTypeId:type,slots:raw}))!==definition.party) {record(field,'rejected','EVIDENCE_REJECTED');continue;}
        const preserve=meta.fields[field]?.formatting==='preserve'||/\b(?:exact(?:ly)?|legal name|preserve (?:the )?(?:case|spelling)|case sensitive)\b/i.test(source.message||'');
        const normalizedOriginal=definition.format==='address'&&!preserve?formatAddress(clarification.rawValue,[current.businessName,current.clientName]):formatFieldText(field,clarification.rawValue,preserve);
        const normalizedSuggestion=definition.format==='address'&&!preserve?formatAddress(clarification.suggestedValue,[current.businessName,current.clientName]):formatFieldText(field,clarification.suggestedValue,preserve);
        if(normalizedOriginal===normalizedSuggestion) {
            // A model cannot turn ordinary deterministic formatting into an
            // unnecessary user decision. Commit only the evidenced original.
            const old=current[field];
            if(validField(field,old)&&old!==normalizedOriginal&&!source.correction) {meta.fields[field]=fieldRecord(field,clarification.rawValue,old,source,'conflicting',{proposed:normalizedOriginal});record(field,'conflicting');continue;}
            current[field]=normalizedOriginal;meta.fields[field]=fieldRecord(field,clarification.rawValue,normalizedOriginal,source);
            if(old!==normalizedOriginal)changed.push(field);
            record(field,old===normalizedOriginal?'unchanged':'committed');continue;
        }
        const original=formatFieldText(field,clarification.rawValue,true),proposed=formatFieldText(field,clarification.suggestedValue,true);
        if(original===proposed)continue;
        // Revert this turn's unconfirmed extraction, never a prior verified fact.
        if(changed.includes(field)) {if(raw[field]!==undefined)current[field]=raw[field];else delete current[field];changed.splice(changed.indexOf(field),1);}
        meta.fields[field]=fieldRecord(field,clarification.rawValue,original,source,'awaiting_confirmation',{original,proposed,reason:clarification.reason,question:`Just to confirm, should I use “${original}” or “${proposed}” for the ${definition.label}?`});
        record(field,'needs_confirmation');
    }
    for (const input of proposal.skip || []) {
        const field = canonicalKey(input);
        if (!field || !supportsField(workflow(type).documentType,field) || !contract.fields[field].skippable)
            throw Object.assign(new Error('Only optional fields can be skipped'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        if(source.kind==='model'&&!/\b(?:skip|not needed|not applicable|none)\b/i.test(source.message))throw Object.assign(new Error('Skipping a field requires user intent'),{code:'EVIDENCE_REJECTED',statusCode:422,retryable:false});
        const required = workflow(type, current, meta.fields,templateSchema(type,meta.templateId,meta.documentSchema)).schema.required_keys;
        if (required.includes(field))
            throw Object.assign(new Error('Required field cannot be skipped'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        if (!validField(field, current[field]))
            meta.fields[field] = { status: 'skipped', source: source.id };
        else if(unresolvedStatuses.includes(meta.fields[field]?.status)&&!meta.fields[field]?.derivedValidation)meta.fields[field]=fieldRecord(field,current[field],current[field],source,'confirmed',{formatting:meta.fields[field]?.formatting});
        if(meta.pendingField===field) {delete meta.pendingField;delete meta.pendingIntent;}
        record(field, validField(field,current[field]) ? 'retained' : 'skipped');
    }
    if (proposal.resolve) {
        const field = canonicalKey(proposal.resolve.field), old = meta.fields[field];
        if (!old || !['conflicting','awaiting_confirmation'].includes(old.status))
            throw Object.assign(new Error('No pending conflict'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        if (proposal.resolve.accept || old.status==='awaiting_confirmation') {
            const selected=proposal.resolve.accept?old.proposed:old.original;
            if(!validField(field,selected))throw Object.assign(new Error('Invalid conflict candidate'),{code:'VALIDATION_FAILED',statusCode:422});
            current[field] = selected;
            if(contract.financial.discountFields.includes(field)){const other=contract.financial.discountFields.find(key=>key!==field);delete current[other];meta.fields[other]={status:'missing',cleared:true};}
            changed.push(field);
        }
        meta.fields[field] = fieldRecord(field,current[field],current[field],source,validField(field,current[field])?'confirmed':'missing',{formatting:'preserve'});
        if(['businessName','clientName'].includes(field)){const history=Array.isArray(meta.knownNames)?{}:meta.knownNames||{};meta.knownNames={...history,[field]:[...new Set([...(history[field]||[]),current[field]])].slice(-32)};}
        record(field,proposal.resolve.accept?'committed':'retained');
    }
    let rejectedItemError;
    const items = Array.isArray(current.lineItems) ? current.lineItems.map((item,i)=>({...item,id:item.id||'item-'+i})) : [];
    for (const op of proposal.itemOperations || []) {
        if(op.operation==='add'&&!validField('lineItems',[op.item]) && op.item && (source.kind !== 'model' || (!op.item.description || String(source.message).toLowerCase().includes(op.item.description.toLowerCase())) && ['quantity','unitPrice','discountRate'].every(key=>op.item[key]===undefined||numericEvidence(op.item[key],source.message)))) {
            const pending={operation:'add',id:op.id||source.id+':pending:'+pendingItems.length,item:op.item};
            if(!pendingItems.some(item=>item.id===pending.id))pendingItems.push(pending);
            meta.fields.lineItems=fieldRecord('lineItems',op.item,current.lineItems||[],source,'ambiguous',{pending:pendingItems});record('lineItems','needs_value');continue;
        }
        const beforeItems=items.map(item=>({...item}));
        try {
        const index = items.findIndex(item => item.id === op.id);
        if (source.kind==='model' && ['remove','update'].includes(op.operation) && !itemTargetEvidence(index,items,source.message))throw Object.assign(new Error('Item target needs explicit user evidence'),{code:'EVIDENCE_REJECTED',statusCode:422,retryable:false});
        if (op.operation === 'remove') {
            if (source.kind === 'model' && !/\b(remove|delete)\b/i.test(source.message))
                throw Object.assign(new Error('Item removal requires an explicit request'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            if (!(source.correction||op.fromPending||source.verifiedConfirmation) || index < 0)
                throw Object.assign(new Error('Item removal requires an explicit correction and known ID'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            items.splice(index, 1);
        }
        else if (op.operation === 'update') {
            if(op.item?.id!==undefined && op.item.id!==op.id) throw Object.assign(new Error('Item identity cannot be changed'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            if(source.kind==='model'&&!numericRoles(op.item,source.message,items[index]?.description))throw Object.assign(new Error('Item numerical roles need evidence'),{code:'EVIDENCE_REJECTED',statusCode:422});
            if (source.kind==='model' && op.item?.description !== undefined && !source.message.toLowerCase().includes(op.item.description.toLowerCase())) throw Object.assign(new Error('Item description needs literal user evidence'), {code:'EVIDENCE_REJECTED',statusCode:422});
            if (source.kind === 'model' && ['quantity', 'unitPrice', 'discountRate'].some(key => op.item?.[key] !== undefined && !numericEvidence(op.item[key], source.message)))
                throw Object.assign(new Error('Item correction needs user evidence'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            const declaredUpdate=explicitItemOperation(source.message,{slots:{lineItems:items}})?.itemOperations?.some(parsed=>parsed.operation==='update'&&parsed.id===op.id&&Object.keys(op.item||{}).every(key=>parsed.item?.[key]===op.item[key]));
            if (!(source.correction||op.fromPending||source.verifiedConfirmation||declaredUpdate) || index < 0)
                throw Object.assign(new Error('Item update requires an explicit correction and known ID'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            if(op.item?.id!==undefined && op.item.id!==items[index].id)throw Object.assign(new Error('Item identity cannot be changed'),{code:'VALIDATION_FAILED',statusCode:422,retryable:false});
            const next = { ...items[index], ...op.item, id: items[index].id };
            if (!validField('lineItems', [next]))
                throw Object.assign(new Error('Invalid item values'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            items[index] = {...next,description:formatOrdinaryText(next.description)};
        }
        else if (op.operation === 'add') {
            const id = op.id || source.id + ':item:' + stableStringify(op.item);
            if (items.some(item => item.id === id))
                continue;
            if (!validField('lineItems', [op.item]))
                throw Object.assign(new Error('Provide description, quantity and unit price'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            if (source.kind === 'model' && !op.fromPending && (!numericRoles(op.item,source.message,items[index]?.description) || !source.message.toLowerCase().includes(op.item.description.toLowerCase()) || ![op.item.quantity, op.item.unitPrice].every(n => numericEvidence(n, source.message))))
                throw Object.assign(new Error('Item data needs user evidence'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
            items.push({ ...op.item,description:formatOrdinaryText(op.item.description.trim().replace(/\s+/g,' ')), id });
        }
        else
            throw Object.assign(new Error('Invalid item operation'),{code:'VALIDATION_FAILED',statusCode:422,phase:'validation',retryable:false});
        if(items.length && !validField('lineItems',items)) { items.splice(0,items.length,...beforeItems);throw Object.assign(new Error('Item count or subtotal exceeds document limits'),{code:'VALIDATION_FAILED',statusCode:422}); }
        pendingItems=pendingItems.filter(pending=>pending.id!==op.id&&!(op.operation==='add'&&pending.item.description?.toLowerCase()===op.item?.description?.toLowerCase()&&!/\b(?:another|second|new item)\b/i.test(source.message)));
        current.lineItems = items;
        meta.fields.lineItems = fieldRecord('lineItems',proposal.itemOperations,current.lineItems,source);
        changed.push('lineItems');record('lineItems',op.operation==='remove'?'cleared':'committed',undefined,op.id||idForResult(items,op));Object.assign(results.at(-1),{operation:op.operation,itemLabel:op.operation==='remove'?beforeItems[index]?.description:items.find(item=>item.id===op.id)?.description||op.item?.description});
        } catch(error){rejectedItemError=error;items.splice(0,items.length,...beforeItems);record('lineItems','rejected',error.code||'VALIDATION_FAILED',op.id);}
    }
    if(rejectedItemError&&!changed.length)throw rejectedItemError;
    if(pendingItems.length)meta.fields.lineItems=fieldRecord('lineItems',pendingItems,current.lineItems||[],source,'ambiguous',{pending:pendingItems});
    if (Array.isArray(current.lineItems))
        current.lineItems = current.lineItems.map((item, i) => ({ ...item, id: item.id || 'item-' + i }));
    if (meta.pendingField && (changed.includes(meta.pendingField) || (proposal.skip || []).includes(meta.pendingField))) delete meta.pendingField;
    if(meta.pendingAction&&changed.some(field=>meta.pendingAction.kind==='item_choice'?field==='lineItems':Object.keys(meta.pendingAction.proposal?.slots||{}).includes(field)||meta.pendingAction.proposal?.fieldOperations?.some(op=>canonicalKey(op.field)===field)||field==='lineItems'&&meta.pendingAction.proposal?.itemOperations?.length))delete meta.pendingAction;
    meta.lastResults = results;
    meta.fields=workflow(type,current,meta.fields,templateSchema(type,meta.templateId,meta.documentSchema)).fieldStates;
    if(changed.length || results.some(result=>['conflicting','needs_confirmation','needs_value','rejected'].includes(result.outcome)))delete meta.finalization;
    return { raw: { ...current, _chat: meta }, changed: [...new Set(changed)], results };
}
function idForResult(items,op){return items.find(item=>item.description===formatOrdinaryText(op.item?.description||''))?.id;}
export function stableStringify(value) {
    return JSON.stringify(value, (_key,v) => v && typeof v==='object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
}
export function extractExplicit(message, state) {
    message = message.replace(/[\u200B-\u200D\uFEFF\u00AD\u2060]/g,'');
    const correctiveIntro=/^actually[, ]+/i.test(message.trim());
    message=message.replace(/^actually[, ]+/i,'').replace(/^(?:please|can you|could you)\s+/i,'');
    const intent = identifyIntent(message,state);
    const slots = {}, evidence = {}, correctionFields = [], spans = [];
    const base = {slots,evidence,intent,correctionFields};
    if(state.pendingIntent?.kind==='operation'&&state.pendingIntent.action==='item_currency'&&validField('currency',message.trim().toUpperCase()))return {...base,resolveOperation:{accept:true,currency:message.trim().toUpperCase()},needsProvider:false};
    // "Invoice for X" alone can name the recipient. Resolve X as the
    // business only when this same message explicitly identifies a customer.
    const creation=message.match(/^create\s+(?:an?\s+)?invoice\s+for\s+([^.!;]+)[.!;]\s*/i);
    if(creation&&/\b(?:customer|client)(?: name)?\s+(?:is|:)\s*\S/i.test(message.slice(creation[0].length))) {
        slots.businessName=creation[1].trim();evidence.businessName=creation[1].trim();spans.push([0,creation[0].length]);
    }
    if(intent.kind==='cancel') return {...base,cancelField:true,cancelPending:true};
    const table=extractItemTable(message);
    if(table&&supportsField(state.documentType,'lineItems')&&intent.allowsMutation!==false) {
        Object.assign(slots,table);
        evidence.lineItems=message;
        if(table.currency)evidence.currency=message.match(new RegExp('\\('+table.currency+'\\)','i'))?.[0]||message;
        return {...base,needsProvider:false};
    }
    if(state.pendingIntent?.kind==='operation'&&state.pendingIntent.action==='discount_mode'&&/^(?:percentage|percent|fixed(?: amount)?)[.!]?$/i.test(message.trim()))return {...base,resolveOperation:{accept:true,discountField:/^percent/i.test(message.trim())?'discountRate':'discountFixedAmount'},needsProvider:false};
    if(state.pendingIntent?.kind==='operation'&&state.pendingIntent.action==='note_date'&&validField('issueDate',message.trim()))return {...base,resolveOperation:{accept:true,date:message.trim()},needsProvider:false};
    if(state.pendingIntent?.kind==='operation'&&state.pendingIntent.candidateIds&&!/^(yes|no)[.!]?$/i.test(message.trim())){const candidates=(state.slots.lineItems||[]).filter(item=>state.pendingIntent.candidateIds.includes(item.id));const selection=resolveItemTarget(message.replace(/^(?:use|the)\s+/i,''),candidates);const ordinal=message.trim().match(/^(first|second|third|fourth|\d+)[.!]?$/i);const chosen=ordinal?candidates[({first:0,second:1,third:2,fourth:3}[ordinal[1].toLowerCase()]??Number(ordinal[1])-1)]:selection.length===1?selection[0]:undefined;if(chosen)return {...base,resolveOperation:{accept:true,itemId:chosen.id},needsProvider:false};}
    if(intent.kind==='resolve_operation')return {...base,resolveOperation:{accept:/^yes/i.test(message.trim()),...(state.pendingIntent?.allowYes?{itemId:state.pendingIntent.candidateIds[0]}:{})},needsProvider:false};
    if(intent.kind==='collect_optional'){const field=state.nextAction.fields?.[0];return field?{...base,requestField:field,needsProvider:false}:{...base,skipAllOptional:true,needsProvider:false};}
    if(/^no[.!]?$/i.test(message.trim())&&state.nextAction.kind==='offer_optional')return {...base,skipAllOptional:true,needsProvider:false};
    if(/^skip (?:all )?(?:optional(?: (?:details|fields|information))?)?[.!]?$/i.test(message.trim())&&(state.nextAction.kind==='offer_optional'||/optional/i.test(message)))return {...base,skipAllOptional:true,needsProvider:false};
    if(/^(?:remove|clear|delete) (?:the )?discount[.!]?$/i.test(message.trim()))return {...base,clear:contract.financial.discountFields,needsProvider:false};
    const direct=documentEdits(message,state);if(direct.pendingDiscountMode||direct.pendingDiscountCurrency)return {...base,pendingDiscountMode:direct.pendingDiscountMode,pendingDiscountCurrency:direct.pendingDiscountCurrency,needsProvider:false};Object.assign(slots,direct.slots);Object.assign(evidence,direct.evidence);spans.push(...direct.spans);correctionFields.push(...direct.correctionFields);if(direct.requestField)base.requestField=direct.requestField;if(direct.fieldOperations.length){base.fieldOperations=direct.fieldOperations;if(direct.spans.some(([a,b])=>a===0&&b===message.length))return {...base,needsProvider:false};}
    if(Object.keys(direct.slots).length&&direct.spans.some(([start,end])=>start===0&&end===message.length))return {...base,needsProvider:false};
    const pendingField=state.nextAction?.field,confirmation=state.fieldStates?.[pendingField];
    if(confirmation?.status==='conflicting'&&/^(?:yes|change it|replace it|use (?:the )?new (?:value|number))?[.!]?$/i.test(message.trim())&&message.trim())return {...base,resolve:{field:pendingField,accept:true},needsProvider:false};
    if(confirmation?.status==='awaiting_confirmation') {
        const answer=message.trim().replace(/[.!]$/,'');
        if(answer.toLowerCase()===String(confirmation.proposed).toLowerCase() || /^(?:yes|change it|use (?:the )?suggestion)$/i.test(answer))return {...base,resolve:{field:pendingField,accept:true}};
        if(answer.toLowerCase()===String(confirmation.original).toLowerCase() || /^(?:no|keep (?:the )?original)$/i.test(answer))return {...base,resolve:{field:pendingField,accept:false}};
    }
    if(['confirm_document','cancel_finalization'].includes(intent.kind))return {...base};
    const contact=state.pendingIntent?.kind==='contact_owner';
    const ownerReply=message.trim().match(/^(?:(?:it(?:'s| is)|this is|the|my|our)\s+)?(business|company|sender|client|customer|recipient)(?:\s+(?:phone|number|phone number))?[.!]?$/i);
    if(contact&&ownerReply) {const field=/client|customer|recipient/i.test(ownerReply[1])?'clientPhone':'senderPhone';return {...base,slots:{[field]:state.pendingIntent.value},evidence:{[field]:state.pendingIntent.value},resolveContact:true,needsProvider:false};}
    if(intent.acceptsPendingAnswer&&validField('senderPhone',message.trim())&&!/^\d{4}-\d{2}-\d{2}$/.test(message.trim())&&!['senderPhone','clientPhone','invoiceNumber','lineItems'].includes(pendingField))return {...base,unassignedContact:message.trim(),needsProvider:false};
    for(const edit of explicitFieldEdits(message,state)) {
        spans.push(edit.span);
        if(edit.remove) (base.clear ||= []).push(edit.field);
        else if(edit.append){(base.fieldOperations||=[]).push({operation:'append',field:edit.field,value:edit.value,evidence:edit.value});}
        else {slots[edit.field]=edit.value.replace(/[.!]$/,'');evidence[edit.field]=edit.value;if(edit.correction)correctionFields.push(edit.field);}
    }
    const item = explicitItemOperation(message,state);
    if(item && !/\b(?:business|company|client)(?: name)?\s*(?:is|to|:|=)/i.test(message)) {const currency=message.match(/\b(LKR|USD|EUR|GBP|AUD|CAD)\b/i);if(currency){slots.currency=currency[1];evidence.currency=currency[1];}return {...base,...item,needsProvider:false};}
    const removal=message.trim().match(/^(?:remove|delete|clear)\s+(.+?)[.!]?$/i);
    if(removal&&!spans.length) {const field=fieldTarget(removal[1],state);if(field&&supportsField(state.documentType,field))return {...base,clear:[field]};}
    const request = message.trim().match(/^(?:please\s+)?(?:add|set|enter|change|update|edit)\s+(?:(?:my|the|our)\s+)?(.+?)[.!]?$/i);
    const requestedAliases = { 'business address': 'senderAddress', 'company address': 'senderAddress', 'sender address': 'senderAddress', 'client address': 'clientAddress', 'customer address': 'clientAddress', 'business email': 'senderEmail', 'company email': 'senderEmail', 'client email': 'clientEmail', 'business phone': 'senderPhone', 'client phone': 'clientPhone', 'notes': 'notesAndTerms', 'terms': 'notesAndTerms', 'tax rate': 'taxRate', 'payment method': 'paymentMethod' };
    const requested = request && (requestedAliases[request[1].toLowerCase()] || canonicalKey(request[1]));
    if (requested && [...contract.documents[state.documentType].required, ...contract.documents[state.documentType].optional].includes(requested)) return {...base, requestField: requested};
    const labels = { businessName: '(?:(?:my|our) )?(?:business|company|agency|store)(?: name)?', clientName: '(?:client|customer|recipient|vendor|supplier)(?: name)?', senderEmail: '(?:(?:my|our|business|sender|company) )?email', clientEmail: '(?:client|customer|recipient) email', senderPhone: '(?:(?:my|our|business|sender|company|contact) )?(?:phone|number)', clientPhone: '(?:client|customer|recipient) (?:phone|number)', senderAddress: '(?:my|our|business|sender|company) address', clientAddress: '(?:client|customer|recipient) address', invoiceNumber: '(?:invoice|quote|receipt|po|document) (?:number|reference)', issueDate: '(?:issue|invoice|payment) date', dueDate: '(?:due|delivery|expiry) date', currency: 'currency', taxRate: 'tax(?: rate)?', discountRate:'discount(?: rate)?',taxStatus:'tax status',locale:'locale',dateFormat:'date format',subject: '(?:subject|project title)', notesAndTerms: '(?:note|notes|terms)',accountDetails:'(?:(?:my|our) )?(?:account|bank|payment) details', paymentTerms:'payment terms',discountFixedAmount:'fixed discount(?: amount)?',paymentMethod: 'payment method', referenceNumber: '(?:transaction )?reference number' };
    const all = Object.values(labels).join('|');
    for (const [key, label] of Object.entries(labels)) {
        const re = new RegExp(String.raw `(?:^|[,.!;]\s*|\band\s+|(?:change|update|replace|correct|edit|set|add)\s+(?:(?:my|the|our)\s+)?)(?:${label})\s*(?:(?:is|are|to|with|as)\b|:|=)\s*([\s\S]+?)(?=(?:(?:[,;.!\n]\s*(?:and\s+)?|\s+and\s+)(?:(?:change|update|replace|correct|edit|set|add)\s+(?:(?:my|the|our)\s+)?)?(?:${all})\s*(?:(?:is|are|to|with|as)\b|:|=))|(?:(?:[,;.!\n]\s*|\s+and\s+)(?:invoice for|bill for|summari[sz]e|show|generate|explain|tell|help|review|add|change|update|remove|delete|clear|explain|what|why|how)\b)|(?:,?\s+and\s+(?:I|we)\s+(?:sold|supplied|provided)\b)|(?:,?\s+and\s+we )|$)`, 'i');
        const match = message.match(re);
        if (match) {
            if(['senderPhone','clientPhone','senderEmail','clientEmail'].includes(key)){const owner=contactOwner(message,match[1].trim(),state);if(owner&&owner!==contract.fields[key].party)continue;}
            spans.push([match.index, match.index+match[0].length]);
            slots[key] = match[1].trim().replace(/[.!]$/, '');
            evidence[key] = match[1].trim();
            if(isCorrection(match[0].slice(0,match[0].indexOf(match[1]))) || correctiveIntro&&match.index===0) correctionFields.push(key);
        }
    }
    const services = message.match(/(?:we specialize in|our services (?:are|include))\s+(.+?)[.!]?$/i);
    if (services) {
        spans.push([services.index,services.index+services[0].length]);
        slots.businessServices = services[1].replace(/[.!]$/, '');
        evidence.businessServices = services[1];
    }
    const pending = state.nextAction?.field;
    // A compact contact answer is scoped to the party the assistant asked about.
    if(['clientName','businessName'].includes(pending)&&!Object.keys(slots).length&&intent.acceptsPendingAnswer) {
        const pieces=message.split(',').map(value=>value.trim()),email=pieces.find(value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
        if(email&&pieces.length>=2&&pieces[0]!==email&&!/\b(?:change|create|generate|add)\b/i.test(pieces[0])) {
            slots[pending]=pieces[0];const party=pending==='clientName'?'client':'sender';slots[party+'Email']=email;
            const location=pieces.slice(1).filter(value=>value!==email&&!/^\+?[\d ().-]+$/.test(value)).join(', ');if(location)slots[party+'Address']=location;
            const phone=pieces.slice(1).find(value=>/^\+?[\d ().-]{7,30}$/.test(value));if(phone)slots[party+'Phone']=phone;
            for(const [field,value] of Object.entries(slots))evidence[field]=value;
        }
    }
    if (['senderAddress', 'clientAddress'].includes(pending) && ['ask', 'clarify'].includes(state.nextAction?.kind) && !Object.keys(slots).length && intent.acceptsPendingAnswer && (message.trim()===state.slots[pending] || /\d+\s*\/\s*\d+|\b(?:road|rd|street|st|mawatha|lane|avenue)\b/i.test(message) || /[,\n]/.test(message)) && message.trim() && !/[?]/.test(message) && !/^(?:add|change|update|create|generate|skip|cancel|why|what|hello|hi)\b/i.test(message.trim())) {
        let address = message.trim().replace(/^(?:(?:my|our|the)\s+)?(?:(?:business|company|client|customer|sender)\s+)?address\s*(?:(?:is|:|=)\s*)?/i, '').trim();
        const party=pending==='clientAddress'?'client':'sender';const parts=address.split(/[,\n]/).map(part=>part.trim());
        const email=parts.find(part=>validField(party+'Email',part)),phone=parts.find(part=>validField(party+'Phone',part));
        if(email){slots[party+'Email']=email;evidence[party+'Email']=email;}if(phone){slots[party+'Phone']=phone;evidence[party+'Phone']=phone;}if(email||phone)address=parts.filter(part=>part!==email&&part!==phone).join(', ');
        if (validField(pending, address)) { slots[pending] = address; evidence[pending] = message.trim(); }
    }
    // Short replies are accepted only against an actual server question and a field-specific parser.
    if (intent.acceptsPendingAnswer && !Object.keys(slots).length && (state.nextAction?.kind === 'ask' || (state.nextAction?.kind === 'clarify' && unresolvedStatuses.includes(state.fieldStates[pending]?.status))) && pending && message.length <= 160 && !/[?\n]/.test(message) && !/^(?:please|create|generate|change|update|actually|client|business name|use|we|i |my |our |can |why |thanks)\b/i.test(message) && !/^(hi|hello|hey|help)[.!]?$/i.test(message) && !/[,;:]/.test(message) && message.trim().split(/\s+/).length <= 8) {
        const def = contract.fields[pending];
        const looksLikeName=/^[\p{L}\p{M}\p{N} &.'’()-]+$/u.test(message.trim()) && /\p{L}/u.test(message) && !/\b(?:invoice|quantity|qty|units|price|rate|currency|date)\b/i.test(message);
        if ((['businessName', 'clientName'].includes(pending) && looksLikeName) || ['email', 'phone', 'date', 'number', 'currency'].includes(def.type)) {
            const normalized = normalizeSlots({ [pending]: message }, state.slots, new Date(state.referenceDate||Date.now()));
            if (validField(pending, normalized[pending]) || !['businessName','clientName'].includes(pending)) {
                slots[pending] = message;
                evidence[pending] = message;
            }
        }
    }
    if (intent.acceptsPendingAnswer && pending === 'invoiceNumber' && !Object.keys(slots).length && /^(?:[A-Za-z][A-Za-z0-9_/-]{0,60}|[0-9]{1,30})$/.test(message.trim())) {
        slots.invoiceNumber = message.trim();
        evidence.invoiceNumber = message.trim();
    }
    const proposal = base;
    const component=state.nextAction?.component;
    if(state.nextAction?.field==='lineItems'&&state.fieldStates.lineItems?.pending?.length) {
      if(/^cancel (?:that |the )?(?:item|addition)$/i.test(message.trim()))proposal.cancelPending=true;
      const number=message.trim().match(/^(?:(?:qty|quantity|price|unit price)\s*(?:is|:|=)?\s*|(?:LKR|USD|Rs\.?|[$€£])\s*)?([0-9]+(?:\.[0-9]+)?)(?:\s+units?)?$/i);
      if(['quantity','unitPrice'].includes(component)&&number)proposal.pendingAnswer={[component]:Number(number[1])};
      if(component==='description'&&intent.acceptsPendingAnswer&&message.trim()&&!/[?]/.test(message))proposal.pendingAnswer={description:message.trim()};
    }
    const skipField = message.trim().match(/^skip (.+)$/i);
    if (skipField && canonicalKey(skipField[1]))
        proposal.skip = [canonicalKey(skipField[1])];
    if (/^skip(?: this)?$/i.test(message.trim()) && pending)
        proposal.skip = [pending];
    if (state.nextAction?.kind === 'clarify' && state.fieldStates?.[pending]?.status === 'conflicting' && /^(yes|no)$/i.test(message.trim()))
        proposal.resolve = { field: pending, accept: message.trim().toLowerCase() === 'yes' };
    // Every parsed labeled span is accounted for. Remaining clauses still need an
    // operation or a semantic answer even when another clause supplied valid data.
    let residual = message;
    if(spans.length) {
        // A command parser and a labeled parser may recognize the same clause.
        const merged=[];for(const span of spans.sort((a,b)=>a[0]-b[0])) {const last=merged.at(-1);if(last&&span[0]<=last[1])last[1]=Math.max(last[1],span[1]);else merged.push([...span]);}
        spans.splice(0,spans.length,...merged);
        for(const [start,end] of spans.sort((a,b)=>b[0]-a[0]))residual=residual.slice(0,start)+residual.slice(end);
        residual=residual.replace(/^[,;.!\s]+|[,;.!\s]+$/g,'').replace(/^(?:and|then)\s+/i,'');
        const remainingItem=explicitItemOperation(residual,state);
        if(remainingItem) {Object.assign(proposal,remainingItem);residual='';}
        if(/^(?:summari[sz]e(?: (?:the |my )?document)?|show (?:me )?(?:the |my )?document summary|review(?: (?:the |my )?document)?|generate (?:the |my )?(?:invoice|document|pdf|quotation|receipt|proposal|purchase order))[.!]?$/i.test(residual))residual='';
    }
    proposal.residual = spans.length ? residual : undefined;
    const billed=(spans.length?residual:message).trim().match(/^(?:invoice|bill)\s+for\s+(.+?)\s+(?:LKR|USD|Rs\.?|[$€£])?\s*([\d,]+(?:\.\d+)?)\s*(LKR|USD|EUR|GBP|JPY)[.!]?$/i);
    if(billed) {proposal.itemOperations=[{operation:'add',item:{description:billed[1],unitPrice:Number(billed[2].replace(/,/g,''))}}];slots.currency=billed[3];evidence.currency=billed[3];residual='';proposal.residual='';}
    proposal.needsProvider = spans.length && !!residual || !Object.keys(slots).length && !proposal.requestField && !proposal.clear && !proposal.itemOperations && !proposal.resolve && !proposal.skip && !proposal.pendingAnswer && !proposal.cancelPending && !proposal.fieldOperations?.length && !proposal.pendingItemEdit && !['summary','generate','change_type','reuse','acknowledge','cancel'].includes(intent.kind);
    if(intent.kind==='generate'&&!spans.length&&!proposal.itemOperations&&!/^(?:(?:please|can you|could you|I want to)\s+)?(?:generate|create|export|download)\s+(?:(?:an?|the|my)\s+)?(?:document|invoice|quotation|receipt|proposal|pdf|purchase order)(?:\s+(?:now|please))?[.!]?$/i.test(message.trim()))proposal.needsProvider=true;
    return proposal;
}
export const isCorrection = message => /\b(?:actually|change|update|replace|correct|remove|delete|instead|set|edit|fix|rename|append|apply)\b/i.test(message);
export function documentSummary(state) {
    const lines = [contract.documents[state.documentType].label + ' summary'];
    for (const [key,value] of Object.entries(state.slots)) {
        if (!contract.fields[key] || key==='lineItems') continue;
        lines.push(`${contract.fields[key].label}: ${contract.fields[key].type==='date'?formatDate(value,state.slots.dateFormat):value}`);
    }
    for (const item of state.slots.lineItems||[]) lines.push(`${item.description}: ${item.quantity} × ${state.slots.currency||''} ${formatMoney(item.unitPrice,state.slots.currency,state.slots.locale)}`);
    if (Number.isFinite(state.slots.totalDue)) lines.push(`Total: ${state.slots.currency||''} ${formatMoney(state.slots.totalDue,state.slots.currency,state.slots.locale)}`);
    if(state.pendingIntent?.kind==='operation')lines.push('Pending operation: '+state.pendingIntent.question);
    if(state.missingRequired.length) lines.push('Still needed: '+state.missingRequired.map(key=>contract.fields[key].label).join(', ')+'.');
    if(state.nextAction.kind==='clarify') lines.push(state.nextAction.question);
    return lines.join('\n');
}

export function effectiveResults(results = []) {
    // Keep the full audit trail in storage, but report the last decision per field.
    // A repaired model extraction must not keep an obsolete failure in its reply.
    const latest=new Map();for(const result of results)latest.set(result.field+(result.id?':'+result.id:''),result);
    return [...latest.values()];
}
export function planResponse(state, changed = [], message = '', options = {}) {
    const intent=options.intent||identifyIntent(message,state);
    const results=effectiveResults(options.results||[]);
    const rejected=results.filter(result=>result.outcome==='rejected');
    const text=options.providerText?.trim();
    if(['generate','confirm_document'].includes(intent.kind))return !state.dataValid||state.pendingIntent?'Before finalizing, '+state.nextAction.question:state.finalization?.status==='confirmed'?'Your document details are confirmed. I’m requesting document generation.':documentSummary(state)+'\nPlease confirm these details to finalize, or tell me what to change.';
    if(intent.kind==='cancel_finalization')return 'You can keep editing. Tell me what you would like to change before finalizing.';
    if(['clarify','confirm_operation'].includes(state.nextAction.kind)&&results.some(result=>['needs_confirmation','conflicting','needs_value'].includes(result.outcome)))return (changed.length?'Saved '+changed.map(key=>contract.fields[key]?.label||key).join(', ')+'. ':'')+state.nextAction.question;
    const unpersistedDecision=text&&state.nextAction.kind!=='clarify'&&/\b(?:replace|confirm|did you mean)\b[^?]*\?/i.test(text);
    const genericCompletion=text && /^All required details are saved and valid/i.test(text);
    const providerQuestion=text?.match(/\bwhat (?:is|are) (?:(?:your|the|my|our) )?([^?]+)\?/i);
    const askedField=providerQuestion&&(canonicalKey(providerQuestion[1])||Object.entries(contract.fields).find(([,definition])=>definition.label.toLowerCase()===providerQuestion[1].trim().toLowerCase())?.[0]);
    const repeatsAcceptedField=askedField&&validField(askedField,state.slots[askedField])&&state.fieldStates?.[askedField]?.status==='confirmed'&&state.pendingIntent?.field!==askedField;
    const redundantCurrencyQuestion=text && /\b(?:what|which)\s+currency\b.*\b(?:use|want|like)\b/i.test(text) && validField('currency',state.slots.currency) && state.pendingIntent?.field!=='currency';
    const wrongTotal=text && [...text.matchAll(/\b(total|subtotal|tax)\s*(?:is|:|=)\s*(?:LKR|USD|EUR|GBP|Rs\.?|[$€£])?\s*([0-9,]+(?:\.[0-9]+)?)/gi)].some(match=>{const key={total:'totalDue',subtotal:'subtotal',tax:'taxAmount'}[match[1].toLowerCase()];return Number.isFinite(state.slots[key])&&Number(match[2].replace(/,/g,''))!==state.slots[key];});
    const claimsSave=text && /^(?:done[!. ]*(?:added|saved|updated|removed)|added|saved|updated|removed|generated)\b|\b(?:I|I've|I have|we have)\s+(?:successfully\s+)?(?:saved|updated|removed|generated)\b|\b(?:was|has been|is now)\s+(?:saved|updated|removed|deleted|generated)\b/i.test(text);
    const firstSentence=text?.match(/^(.+?[.!])(?:\s+|$)/)?.[1] || text;
    const ackMatch=firstSentence?.match(/^(?:(?:I've|I have|I|we have)\s+)?(?:successfully\s+)?(saved|updated|removed|deleted)\s+(?:(?:the|your|my)\s+)?(.+?)(?:\s+successfully)?[.!]?$/i);
    const acknowledgedField=ackMatch && changed.find(field=>(contract.fields[field]?.label||field).toLowerCase()===ackMatch[2].replace(/[.!]$/,'').trim().toLowerCase());
    const supportedAcknowledgement=!changed.includes('lineItems')&&changed.length===1 && acknowledgedField && results.some(result=>result.field===acknowledgedField&&(/removed|deleted/i.test(ackMatch[1])?result.outcome==='cleared':result.outcome==='committed')) && !/\b(saved|updated|removed|deleted|generated)\b/i.test(text.slice(firstSentence.length));
    // Explanations and answers survive unchanged. Mutation acknowledgements are generated from
    // per-operation receipts; supported provider acknowledgements retain their wording.
    // Provider prose cannot make an uncommitted operation look successful.
    // Collection responses follow the validated state, rather than rewriting a
    // model's stale question. Free-form explanations remain provider authored.
    const collection=results.some(result=>['committed','conflicting','needs_value','needs_confirmation'].includes(result.outcome))&&intent.kind!=='question';
    if(text && !unpersistedDecision && !repeatsAcceptedField && (!collection||supportedAcknowledgement) && (!claimsSave || supportedAcknowledgement) && !wrongTotal && !results.some(result=>['rejected','conflicting','needs_value','needs_confirmation'].includes(result.outcome)) && !['cancel','generate','change_type','reuse','acknowledge'].includes(intent.kind) && !genericCompletion && !redundantCurrencyQuestion) return text;
    const removed=changed.filter(field=>results.some(result=>result.field===field&&result.outcome==='cleared')),saved=changed.filter(field=>!removed.includes(field));
    const labels=fields=>fields.map(key=>contract.fields[key]?.label||key).join(', ');
    const scalarSaved=saved.filter(field=>field!=='lineItems'),scalarRemoved=removed.filter(field=>field!=='lineItems');
    const itemReceipts=results.filter(result=>result.field==='lineItems'&&['committed','cleared'].includes(result.outcome));
    const itemAck=itemReceipts.map(result=>{const item=state.slots.lineItems?.find(item=>item.id===result.id);return result.operation==='remove'?`Removed ${result.itemLabel}. `:item?`Updated ${item.description}: quantity ${item.quantity}, unit price ${state.slots.currency||''} ${formatMoney(item.unitPrice,state.slots.currency,state.slots.locale)}, amount ${formatMoney(item.total,state.slots.currency,state.slots.locale)}. `:`Saved ${state.slots.lineItems?.length||0} line items. `;}).join('');
    const ack=(scalarSaved.length?'Saved '+scalarSaved.map(field=>['notesAndTerms','paymentTerms','accountDetails','senderPhone','clientPhone'].includes(field)?`${contract.fields[field].label}: ${String(state.slots[field]).replace(/[.!]$/,'')}`:['discountRate','taxRate'].includes(field)?`${contract.fields[field].label}: ${state.slots[field]}%`:field==='discountFixedAmount'?`${contract.fields[field].label}: ${state.slots.currency||''} ${formatMoney(state.slots[field],state.slots.currency,state.slots.locale)}`:contract.fields[field]?.label||field).join('; ')+'. ':'')+(scalarRemoved.length?'Removed '+labels(scalarRemoved)+'. ':'')+itemAck;

    const rejection=rejected.map(result=>`I couldn't save the ${contract.fields[result.field]?.label||result.field}: ${result.code==='REQUIRED_FIELD'?'this field is required by the selected template; you can replace it instead':result.code==='OWNERSHIP_UNRESOLVED'?'please specify whether this belongs to the business or the client':result.code==='EVIDENCE_REJECTED'?'please provide the value without inferred details':'please provide a valid value'}.`).join(' ');
    if(options.clarification) return ack+state.nextAction.question;
    if(intent.kind==='cancel') return 'Cancelled that edit. Your saved information is unchanged.';
    if(results.some(result=>result.field==='conversation'&&result.outcome==='cancelled'))return 'Cancelled that proposed update. Your saved information is unchanged.';
    if(intent.kind==='acknowledge'&&['clarify','confirm_operation'].includes(state.nextAction.kind))return state.nextAction.question;
    if(intent.kind==='acknowledge') return 'You’re welcome. You can keep editing or review your document.';
    if(intent.intents?.includes('summary')) return ack+documentSummary(state)+(rejection?'\n'+rejection:'');
    if(intent.kind==='generate') return state.dataValid && !state.pendingIntent && !rejected.length ? 'Your document is ready. I’m requesting document generation.' : 'Before generating, '+state.nextAction.question;
    if(intent.kind==='change_type') return intent.targetType===state.documentType&&!options.revisionDraft ? 'This is already a '+contract.documents[state.documentType].label.toLowerCase()+' draft. You can continue editing it.' : options.draftState ? 'Created a new '+contract.documents[options.draftState.documentType].label.toLowerCase()+' draft with compatible saved details. '+planResponse(options.draftState) : options.revisionDraft ? 'Created a revision draft with your saved details. '+(ack||state.nextAction.question).trim() : 'Which document type would you like to use for the new draft?';
    if(intent.kind==='reuse'&&options.reuseResolved) return ack ? 'Reused your saved company details. '+ack.trim() : 'These company details are already saved.';
    if(intent.kind==='reuse') return 'Choose the saved conversation containing the company details you want to reuse, then use “New document with these business details”. I won’t guess which business to use.';
    if(state.readOnly) return 'This conversation is '+state.lifecycle.toLowerCase()+'. You can review its saved information or create a new draft with these business details.';
    if(rejection) return ack+rejection+(state.nextAction.kind==='clarify'?' '+state.nextAction.question:'');
    const knownName=/\b(?:what|which)\b.*\b(?:business|company)\s*name\b/i.test(message) && validField('businessName',state.slots.businessName);
    if(knownName) return 'Your saved business name is '+state.slots.businessName+'.';
    if(/\b(total|subtotal|calculate|calculation)\b/i.test(message) && validField('lineItems',state.slots.lineItems) && validField('currency',state.slots.currency)) return 'Subtotal: '+state.slots.currency+' '+formatMoney(state.slots.subtotal,state.slots.currency,state.slots.locale)+'. Tax: '+state.slots.currency+' '+formatMoney(state.slots.taxAmount,state.slots.currency,state.slots.locale)+'. Total: '+state.slots.currency+' '+formatMoney(state.slots.totalDue,state.slots.currency,state.slots.locale)+'.';
    if(intent.kind==='question') return text&&!unpersistedDecision&&!repeatsAcceptedField&&!claimsSave&&!wrongTotal&&!genericCompletion&&!redundantCurrencyQuestion?text:'I haven’t changed the document. Could you clarify what you would like to know?';
    if(!ack&&results.some(result=>result.outcome==='unchanged'||result.outcome==='retained'))return 'That information is already saved; I’ve kept the existing value.'+(state.nextAction.kind==='offer_optional'?' '+state.nextAction.question:'');
    if(intent.kind==='skip'&&results.some(result=>result.outcome==='skipped'))return 'Skipped those optional details. '+state.nextAction.question;
    if(['ask','clarify','confirm_operation','offer_optional'].includes(state.nextAction.kind)) return ack+state.nextAction.question;
    if(ack) return ack.trim();
    const keptRemoved=results.filter(result=>result.outcome==='retained'&&state.fieldStates[result.field]?.cleared);
    if(keptRemoved.length)return 'I’ve kept the removed '+labels(keptRemoved.map(result=>result.field))+' empty.';
    if(results.some(result=>result.outcome==='unchanged'||result.outcome==='retained')) return 'That information is already saved; I’ve kept the existing value.';
    if(!message) return state.nextAction.question;
    return 'What would you like to add or change?';
}
