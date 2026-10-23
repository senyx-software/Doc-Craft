"""Actual admin configuration -> signed Chat Service -> Ollama -> SSE acceptance.

Only the owned loopback fixture is used. This does not authorize activation in production.
"""
import json
import sys
import uuid
import time
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
sys.path[:0]=[str(ROOT),str(ROOT/'.local/production-remediation')]
from live_client import Live
l=Live();assert l.context['database'].startswith('doccraft_staging_hybrid_')
assert all(urlsplit(u).hostname=='127.0.0.1' for u in l.urls.values())
OUT=ROOT/'docs/production-remediation/evidence/runtime';OUT.mkdir(parents=True,exist_ok=True)
results=[]
def write(resource,item):
    current=l.admin('GET');return l.admin('POST','/'+resource,{'expected_version':current['version'],'item':item})
provider={'id':'remediation-local','name':'Remediation local inference','kind':'ollama','endpoint':'http://127.0.0.1:11434/api','locality':'local','credential_required':False,'timeout_seconds':90,'max_concurrency':1,'enabled':False}
write('providers',provider)
model={'id':'remediation-small','name':'Remediation candidate','provider_id':provider['id'],'identifier':'qwen3:1.7b-q4_K_M','runtime':'ollama','context_window':16384,'max_input_tokens':15000,'max_output_tokens':768,'max_concurrency':1,'ollama_think':False,'ollama_num_threads':4,'idle_unload_seconds':60,'enabled':False}
write('models',model)
health=l.admin('POST','/models/'+model['id']+'/test')
results.append({'id':'actual-model-connectivity','actual':health,'scope':'Actual Ollama tool inference through authenticated admin API'})
if not health['healthy']:
    (OUT/'live-ai-integration.json').write_text(json.dumps({'status':'FAIL','results':results},indent=2)+'\n');raise SystemExit('Actual model health probe failed')
provider['enabled']=True;write('providers',provider);model['enabled']=True;write('models',model)
snapshot=l.admin('GET');plans=snapshot['data']['plans']
if not plans:
    sys.path.insert(0,str(ROOT/'services/admin-api'))
    from app.models.ai_management import PlanPolicy
    known=l.admin('GET','/api/v1/admin/plans',base='')
    rows=known.get('data',known.get('plans',[])) if isinstance(known,dict) else known
    plans={row['code']:PlanPolicy().model_dump(mode='json') for row in rows if row.get('status','active')=='active'}
for name in plans:
    plans[name]['primary_model']=model['id'];plans[name]['cloud_fallback_enabled']=False;plans[name]['monthly_cloud_usd']=0
l.admin('PUT','/assignments',{'expected_version':snapshot['version'],'plans':plans})
snapshot=l.admin('GET');l.admin('PUT','/routing',{'expected_version':snapshot['version'],'routing':{'enabled':True}})
u=l.user('live-ai-remediation-'+uuid.uuid4().hex[:5]);s=l.session(u);before=l.ledger()
r=l.turn(u,s['sessionId'],'Explain how milestone payments help a freelance design project stay on schedule.')
results.append({'id':'chat-service-actual-inference','http':r['http_status'],'latency_ms':r['latency_ms'],'done':bool(r['done']),'error':r['error'],'ledger_delta':l.ledger()-before,'response':r['done'].get('response') if r['done'] else None,'state_preserved':bool(r['done']) and r['done']['state']['slots']==s['state']['slots'],'scope':'Actual gateway -> Chat -> signed admin inference -> Ollama -> SSE; conversation persisted in PostgreSQL'})
# Real budget denial before any provider dispatch.
snapshot=l.admin('GET');original=json.loads(json.dumps(snapshot['data']['plans']));limited=json.loads(json.dumps(original));limited['free']['per_user_monthly_requests']=0
l.admin('PUT','/assignments',{'expected_version':snapshot['version'],'plans':limited})
try:
    before=l.ledger();denied=l.turn(u,s['sessionId'],'Explain payment milestones for an architecture project.');results.append({'id':'actual-budget-denial','error':denied['error'],'dispatch_delta':l.ledger()-before,'latency_ms':denied['latency_ms']})
finally:
    snapshot=l.admin('GET');l.admin('PUT','/assignments',{'expected_version':snapshot['version'],'plans':original})
provider['enabled']=False;write('providers',provider)
try:
    before=l.ledger();denied=l.turn(u,s['sessionId'],'Explain payment milestones for a consulting project.');results.append({'id':'actual-disabled-provider','error':denied['error'],'dispatch_delta':l.ledger()-before,'cloud_fallback_enabled':False})
finally:
    provider['enabled']=True;write('providers',provider)
(OUT/'live-ai-integration.json').write_text(json.dumps({'results':results,'production_changed':False,'cloud_acceptance':'BLOCKED: no approved credentials; no cloud dispatch'},indent=2)+'\n')
print(json.dumps({'checks':len(results),'connectivity_healthy':health['healthy'],'actual_chat_done':results[1]['done'],'actual_chat_latency_ms':results[1]['latency_ms']}))
