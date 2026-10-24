import {contract,validField} from './document-contract.mjs';

export const languageToolSchema={type:'object',properties:{field:{type:['string','null'],enum:['notesAndTerms','subject',null]},original:{type:'string',minLength:1,maxLength:4000},suggested:{type:'string',minLength:1,maxLength:4000},reason:{type:'string',minLength:1,maxLength:200}},required:['field','original','suggested','reason'],additionalProperties:false};
const terms={plase:'please',prodcts:'products',delivary:'delivery',recieve:'receive',definately:'definitely',teh:'the'};

export function safeLanguageCorrection(text,knownNames=[]) {
  let corrected=text.replace(/\b(?:plase|prodcts|delivary|recieve|definately|teh)\b/gi,(word,offset)=>{
    if(knownNames.some(name=>typeof name==='string'&&name.toLowerCase().split(/\s+/).includes(word.toLowerCase())))return word;
    const value=terms[word.toLowerCase()];return offset===0?value[0].toUpperCase()+value.slice(1):value;
  });
  corrected=corrected.replace(/\b([Pp]lease) delivery (the|your|our)\b/g,'$1 deliver $2');
  return corrected;
}

export function commonLanguageProposal(message,state) {
  if(!/^\s*plase\s+delivary\b/i.test(message)||message.length>500)return null;
  const suggested=safeLanguageCorrection(message,[state.slots?.businessName,state.slots?.clientName]);
  return suggested!==message?{field:state.nextAction?.field==='notesAndTerms'?'notesAndTerms':null,original:message,suggested,reason:'Correct common spelling and grammar while preserving the delivery instruction.'}:null;
}

export function validateLanguageCorrection(input,state,message,mode='suggest') {
  const invalid=reason=>{throw Object.assign(new Error(reason),{code:'VALIDATION_FAILED',statusCode:422,retryable:false});};
  if(mode==='off')throw Object.assign(new Error('Language corrections are unavailable'),{code:'ENTITLEMENT_DENIED',statusCode:403});
  if(!input||Object.keys(input).some(key=>!['field','original','suggested','reason'].includes(key))||![null,'notesAndTerms','subject'].includes(input.field)||!['original','suggested','reason'].every(key=>typeof input[key]==='string'&&input[key].trim())||input.original.length>4000||input.suggested.length>4000||input.reason.length>200)invalid('Invalid language correction');
  const saved=input.field?state.slots?.[input.field]:undefined;
  const editingSaved=saved===input.original;
  const explicitField=input.field==='notesAndTerms'?/\bnotes?\b/i.test(message):input.field==='subject'?/\bsubject\b/i.test(message):false;
  if(editingSaved?(!explicitField||!/\b(?:fix|correct|proofread|improve|grammar|spelling|rephrase)\b/i.test(message)):!message.includes(input.original))invalid('A correction must refer to your current text or an explicitly requested saved field.');
  const numeric=value=>(value.match(/\b\d[\d.,:/%-]*\b/g)||[]).sort();
  if(JSON.stringify(numeric(input.original))!==JSON.stringify(numeric(input.suggested)))invalid('Language corrections cannot change business numbers or dates.');
  for(const name of [state.slots?.businessName,state.slots?.clientName])if(typeof name==='string'&&input.original.includes(name)&&!input.suggested.includes(name))invalid('Business and customer names must be preserved.');
  for(const token of input.original.match(/[\w.+-]+@[\w.-]+\.[a-z]{2,}|https?:\/\/\S+/gi)||[])if(!input.suggested.includes(token))invalid('Contact details and links must be preserved.');
  if(input.field&&!validField(input.field,input.suggested))invalid('The corrected wording does not fit this document field.');
  const properWords=[...input.original.matchAll(/\b[A-Z][a-zA-Z0-9_-]+\b/g)].filter(match=>match.index>0).map(match=>match[0]);
  const automatic=mode==='safe_apply'&&input.field&&explicitField&&/^\s*(?:please|plase)\s/i.test(input.original)&&properWords.every(word=>input.suggested.includes(word))&&safeLanguageCorrection(input.original,[state.slots?.businessName,state.slots?.clientName])===input.suggested;
  const question=input.field?`Use “${input.suggested}” for the ${contract.fields[input.field].label}?`:`Did you mean “${input.suggested}”? Should I add this to the notes or use it as the subject?`;
  return {...input,editingSaved,previousValue:saved??null,automatic:!!automatic,question};
}
