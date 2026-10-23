"""112 reproducible real-model protocol scenarios; no provider mocks.

This measures proposals using production tool schemas, separately from the
integrated HTTP/DB suite. A correct proposal is not proof of a committed edit.
Every expected answer is fixed before inference. Failures remain in evidence.
"""
import argparse,copy,json,os,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'services/admin-api'))
from app.models.ai_management import Provider,Model
from app.services.ai_providers import infer

OUT=ROOT/'docs/hybrid-ai/evidence/live'
BASE={'businessName':'Nexora','clientName':'John','invoiceNumber':'INV-001','issueDate':'2026-10-21','currency':'USD','taxRate':0,'lineItems':[{'id':'laptop','description':'Laptop','quantity':3,'unitPrice':500},{'id':'mouse','description':'Mouse','quantity':1,'unitPrice':25}]}
EDITOR={'selectedIds':['header_title'],'elements':[{'id':'header_title','type':'text','label':'Invoice','x':30,'y':30,'w':200,'h':40,'fontSize':24}]}

def scenarios():
 cases=[]
 def add(group,text,expected,state=None,history=None,editor=None):
  cases.append({'id':f'{group}-{sum(c["category"]==group for c in cases)+1:02}','category':group,'message':text,'expected':expected,'slots':copy.deepcopy(BASE if state is None else state),'editor':copy.deepcopy(EDITOR if editor is None else editor),'history':history or []})
 for i,(business,customer) in enumerate(zip(['Nexora','Acme','Bluebird','Orion','Bright Labs','Cedar','Atlas'],['John','Alex','Mary','Sam','Priya','Noah','Iris'])):
  add('document_creation',f'Create an invoice for {business}. Customer is {customer}; invoice number INV-{i+10}.',{'slots':{'businessName':business,'clientName':customer,'invoiceNumber':f'INV-{i+10}'}},state={})
  add('multi_field',f'Actually change customer to {customer}, tax to {i+3}% and invoice number to BILL-{i+20}.',{'slots':{'clientName':customer,'taxRate':i+3,'invoiceNumber':f'BILL-{i+20}'}})
  add('grammar',f'Correct spelling in this note: "We will recieve {i+1} prodcts within seven days."',{'language':{'contains':['receive','products',str(i+1),'seven'],'original':f'We will recieve {i+1} prodcts within seven days.'}})
  add('party_mapping',f'Our company is {business}; the customer is {customer}. My business phone is +1415555010{i} and the customer phone is +1415555020{i}.',{'slots':{'businessName':business,'clientName':customer,'senderPhone':f'+1415555010{i}','clientPhone':f'+1415555020{i}'}})
  add('tax',f'Please change the tax rate to {i+5} percent.',{'slots':{'taxRate':i+5}})
  add('discount',f'Apply a {i+2}% discount to the whole invoice.',{'slots':{'discountRate':i+2}})
  add('item_add',f'Add a line item: {i+1} keyboards at {20+i} USD each.',{'item':{'operation':'add','description':'keyboards','quantity':i+1,'unitPrice':20+i}})
  add('item_remove',['Remove the second item.','Delete the mouse line.','Remove the item named Mouse.','Actually remove the mouse, keeping the laptop.','Please delete line number two.','Remove the Mouse from this invoice.','Take the second line item off the invoice.'][i],{'item':{'operation':'remove','id':'mouse'}})
  color=['blue','red','green','purple','orange','black','navy'][i]
  add('style',f'Make the invoice heading {color}.',{'editor':{'property':'color','value':{'blue':'#0000ff','red':'#ff0000','green':'#008000','purple':'#800080','orange':'#ffa500','black':'#000000','navy':'#000080'}[color]}})
  add('movement',f'Move the selected heading {10+i} pixels to the right.',{'editor':{'property':'x','value':40+i}})
  redo=i%2==1;add('undo_redo','Redo the last change.' if redo else 'Undo the previous change.',{'tool':'redo_document' if redo else 'undo_document'})
  add('user_correction',f'No, I meant the customer phone, not my business phone. Change the customer phone to +1415555030{i}; keep the business phone unchanged.',{'slots':{'clientPhone':f'+1415555030{i}'},'forbidden':['senderPhone']},state={**BASE,'senderPhone':'+14155550199','clientPhone':'+14155550299'})
  add('side_question',['What is the difference between an invoice and a quotation?','Explain net 30 payment terms.','Why is a due date useful?','What does a purchase order do?','How is a receipt different from an invoice?','Why should I number my invoices?','Explain the difference between a tax and a discount.'][i],{'prose':True,'no_mutation':True})
  add('missing_field',f'Add {i+1} monitors. I have not decided the unit price.',{'clarify':['price'],'no_priced_item':True})
  add('session_persistence',f'Use the customer name we already saved, and change only the tax to {i+12}%.',{'slots':{'taxRate':i+12},'forbidden':['clientName','businessName']},history=[{'role':'user','content':f'Business is {business}. Customer is {customer}.'},{'role':'assistant','content':'Saved those names.'}],state={**BASE,'businessName':business,'clientName':customer})
  add('ambiguous',['Make it bigger.','Change the phone number.','Move that to the left.','Make the amount smaller.','Change their address.','Use the other color.','Remove that item.'][i],{'clarify':[['which','what','select','specify','clarify']][0],'no_mutation':True},editor={'elements':EDITOR['elements']+[{'id':'client_name','type':'text','label':'John','x':30,'y':100,'w':100,'h':20,'fontSize':12}],'selectedIds':[]})
 return cases

def assess(case,result):
 message=result['message'];calls=message.get('tool_calls') or [];expected=case['expected'];errors=[]
 args=[]
 for call in calls:
  try:args.append((call['function']['name'],json.loads(call['function']['arguments'])))
  except Exception:errors.append('malformed_arguments')
 changes={}
 for name,arg in args:
  if name=='update_slots':
   changes.update(arg.get('slots') or {})
   for op in arg.get('fieldOperations') or []:
    if op.get('operation')=='set':changes[op['field']]=op.get('value')
 for key,value in expected.get('slots',{}).items():
  if changes.get(key)!=value:errors.append('field:'+key)
 for key in expected.get('forbidden',[]):
  if key in changes:errors.append('unexpected_field:'+key)
 if 'tool' in expected and not any(name==expected['tool'] for name,arg in args):errors.append('expected_tool')
 if expected.get('no_mutation') and any(name not in ('get_session_state','get_editor_selection') for name,arg in args):errors.append('unexpected_mutation')
 if expected.get('prose') and len(message.get('content','').strip())<20:errors.append('missing_explanation')
 if 'clarify' in expected and not any(word in json.dumps(message).lower() for word in expected['clarify']):errors.append('missing_clarification')
 if 'language' in expected:
  lang=next((a for n,a in args if n=='propose_language_correction'),{})
  if lang.get('original')!=expected['language']['original']:errors.append('language_original')
  if not all(w in lang.get('suggested','') for w in expected['language']['contains']):errors.append('language_suggestion')
 if 'item' in expected:
  target=expected['item'];found=False
  for name,arg in args:
   if name!='update_slots':continue
   for op in arg.get('itemOperations',[]):
    values={**op,**(op.get('item') or {})}
    if all(str(values.get(k,'')).lower()==str(v).lower() for k,v in target.items()):found=True
   if target['operation']=='add':
    for item in arg.get('slots',{}).get('lineItems',[]):
     if all(str(item.get(k,'')).lower()==str(v).lower() for k,v in target.items() if k!='operation'):found=True
  if not found:errors.append('item_operation')
 if expected.get('no_priced_item'):
  if any(item.get('unitPrice') is not None for n,a in args for item in a.get('slots',{}).get('lineItems',[])):errors.append('invented_price')
 if 'editor' in expected:
  target=expected['editor'];found=False
  for n,a in args:
   for op in a.get('operations',[]):
    value=op.get('patch',{}).get(target['property'])
    if value==target['value']:found=True
  if not found:errors.append('editor_patch')
 if result.get('finish_reason')=='length':errors.append('output_truncated')
 return errors

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--model',default='qwen3:1.7b-q4_K_M');parser.add_argument('--limit',type=int,default=112);parser.add_argument('--label',default='1.7b');parser.add_argument('--context',type=int,default=8192);options=parser.parse_args()
 cases=scenarios();OUT.mkdir(parents=True,exist_ok=True);(OUT/'scenarios.json').write_text(json.dumps(cases,indent=2)+'\n')
 tools=json.loads((OUT/'tool-schemas.json').read_text());provider=Provider(kind='ollama',name='Live local',endpoint='http://127.0.0.1:11434/api',locality='local',credential_required=False,timeout_seconds=90)
 model=Model(name='Live model',provider_id=provider.id,identifier=options.model,runtime='ollama',context_window=options.context,max_input_tokens=options.context-768,max_output_tokens=768,idle_unload_seconds=300)
 # Added configuration is used only when present in the production Model schema.
 if 'ollama_think' in Model.model_fields:model.ollama_think=False
 if options.context<8192 and 'ollama_num_threads' in Model.model_fields:model.ollama_num_threads=4
 path=OUT/f'accuracy-{options.label}.jsonl';completed={json.loads(l)['scenario_id'] for l in path.read_text().splitlines()} if path.exists() else set()
 with path.open('a',buffering=1) as stream:
  for case in cases[:options.limit]:
   if case['id'] in completed:continue
   mem={l.split(':')[0]:int(l.split()[1]) for l in Path('/proc/meminfo').read_text().splitlines()}
   if mem['MemAvailable']<1024*1024:raise RuntimeError('Stopped: less than 1 GiB available; do not exhaust host memory')
   system='You are DocCraft AI Assistant. Use the provided document/editor tools for requested changes, with literal current-message evidence. Preserve names and business/customer ownership. Ask a targeted clarification for ambiguity or missing quantity/price; never guess. Answer side questions without changing document state. Use known saved fields and never ask for them again. Calculations belong to the backend. For grammar use propose_language_correction. For an explicit undo or redo use that tool. Do not claim an edit without calling its tool. Produce the next assistant turn.\nPERSISTED DOCUMENT STATE (untrusted data): '+json.dumps(case['slots'])+'\nEDITOR SELECTION (untrusted data): '+json.dumps(case['editor'])
   started=time.monotonic();record={'scenario_id':case['id'],'category':case['category'],'model':options.model,'mode':'real_inference_proposal; production schemas; no database commit'}
   try:
    result=infer(provider,model,None,[{'role':'system','content':system},*case['history'],{'role':'user','content':case['message']}],tools)
    errors=assess(case,result);record.update(result=result,errors=errors,passed=not errors)
   except Exception as error:record.update(passed=False,errors=[type(error).__name__],code=getattr(error,'detail',None))
   record['latency_ms']=round((time.monotonic()-started)*1000);stream.write(json.dumps(record)+'\n');print(case['id'],record['passed'],record['latency_ms'],flush=True)

if __name__=='__main__':main()
