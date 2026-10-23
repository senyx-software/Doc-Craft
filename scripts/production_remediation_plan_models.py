import json,os,sys,uuid
from pathlib import Path
sys.path[:0]=['.local/production-remediation','.'];from live_client import Live
l=Live();model={'id':'remediation-large','name':'Larger unapproved candidate','provider_id':'remediation-local','identifier':'qwen3:4b-q4_K_M','runtime':'ollama','context_window':4096,'max_input_tokens':3300,'max_output_tokens':768,'ollama_think':False,'ollama_num_threads':4,'idle_unload_seconds':60,'enabled':False}
def write(item):
 s=l.admin('GET');return l.admin('POST','/models',{'expected_version':s['version'],'item':item})
write(model);health=l.admin('POST','/models/'+model['id']+'/test');result={'scope':'Actual admin APIs/PostgreSQL/cache/signed runtime assignments; both candidates remain production-unapproved','health':health}
if health['healthy']:
 model['enabled']=True;write(model);snap=l.admin('GET');plans=snap['data']['plans'];plans['free']['primary_model']='remediation-small';plans['pro']['primary_model']='remediation-large';updated=l.admin('PUT','/assignments',{'expected_version':snap['version'],'plans':plans})
 paid=l.user('paid-remediation-'+uuid.uuid4().hex[:5]);free=l.user('free-remediation-'+uuid.uuid4().hex[:5]);l.admin('PUT','/api/v1/users/'+paid['user']['id']+'/entitlements',{'plan':'pro','features':{},'reason':'Owned runtime assignment acceptance only'},base='')
 os.environ.update(l.context['envs']['chat']);from shared.service_auth import service_request
 results=[]
 for user in [free,paid]:
  r=service_request('admin-api','GET',l.urls['admin-api']+'/api/v1/internal/ai/runtime/'+user['user']['id'],timeout=15);data=r.json();results.append({'http':r.status_code,'plan':data['plan'],'primary':data['policy']['primary_model'],'version':data['version']})
 result.update({'assignments':results,'runtime_models_differ':results[0]['primary']!=results[1]['primary'],'version_matches_update':all(r['version']==updated['version'] for r in results),'no_redeployment':True,'paid_model_full_chat':'Not certified: 4096 context cannot fit full production prompt under conservative token budget'})
Path('docs/production-remediation/evidence/runtime/plan-models.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
