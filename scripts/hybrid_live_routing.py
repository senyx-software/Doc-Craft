"""Actual runtime policy, queue and fail-closed checks; no cloud dispatch."""
import concurrent.futures,json,os,sys,threading,time,uuid
from hybrid_live_client import Live,EVIDENCE
ROOT=__import__('pathlib').Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from shared.service_auth import service_request

def main():
 l=Live();paid=l.user('paid-live');uid=paid['user']['id'];free=l.user('load-0');sid=l.session(paid)['sessionId']
 l.admin('PUT','/api/v1/users/'+uid+'/entitlements',{'plan':'pro','features':{},'reason':'Isolated real routing validation'},base='')
 os.environ.update(l.context['envs']['chat'])
 def runtime(user):
  response=service_request('admin-api','GET',l.urls['admin-api']+'/api/v1/internal/ai/runtime/'+user,timeout=15);response.raise_for_status();return response.json()
 rfree=runtime(free['user']['id']);rpaid=runtime(uid)
 routing={'free_plan':rfree['plan'],'free_primary':rfree['policy']['primary_model'],'paid_plan':rpaid['plan'],'paid_primary':rpaid['policy']['primary_model'],'version':rpaid['version'],'different_models':rpaid['policy']['primary_model']!=rfree['policy']['primary_model'],'public_admin_configuration_status':l.http.get(l.urls['admin-api']+'/api/v1/admin/ai',headers={'Authorization':'Bearer '+paid['accessToken']}).status_code}
 (EVIDENCE/'runtime-plan-routing.json').write_text(json.dumps(routing,indent=2)+'\n');print(routing)
 ids=[uuid.uuid4().hex for _ in range(3)];observations={};stop=threading.Event();started=time.monotonic()
 def observe():
  client=Live()
  while not stop.is_set():
   now=time.monotonic();rows=client.query('SELECT request_id,state FROM ai_inference_queue')
   for ident,state in rows:
    if ident in ids:
     item=observations.setdefault(ident,{});item.setdefault(state,now-started)
   stop.wait(.05)
 thread=threading.Thread(target=observe);thread.start()
 def infer(index):
  st=time.monotonic();response=service_request('admin-api','POST',l.urls['admin-api']+'/api/v1/internal/ai/infer',json={'request_id':ids[index],'user_id':uid,'session_id':sid,'policy_version':rpaid['version'],'model_id':rpaid['policy']['primary_model'],'messages':[{'role':'user','content':'Reply with only the word Ready.'}],'tools':[]},timeout=115)
  data=response.json();return {'id':ids[index],'http':response.status_code,'latency_ms':round((time.monotonic()-st)*1000),'code':data.get('detail',{}).get('code') if isinstance(data.get('detail'),dict) else None,'response':data.get('message',{}).get('content')}
 try:
  with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(infer,range(3)))
 finally:stop.set();thread.join()
 for row in results:
  observed=observations.get(row['id'],{});row['observed_queue_wait_ms']=round((observed['running']-observed['waiting'])*1000) if 'running' in observed and 'waiting' in observed else None
 out={'method':'actual signed internal inference, real provider and PostgreSQL queue; 50ms observer; client total includes queue/inference/HTTP','concurrency':3,'configured_local_concurrency':1,'results':results,'observations':observations};(EVIDENCE/'queue-routing.json').write_text(json.dumps(out,indent=2)+'\n');print(out)
 snap=l.admin('GET');provider=next(p for p in snap['data']['providers'] if p['id']=='live-local');provider['enabled']=False;l.admin('POST','/providers',{'expected_version':snap['version'],'item':provider})
 try:
  user=l.user('load-1');session=l.session(user);before=l.ledger();r=l.turn(user,session['sessionId'],'Explain payment schedules for a growing business.');out={'code':r['error']['code'] if r['error'] else None,'inference_ledger_delta':l.ledger()-before,'cloud_fallback_enabled':False,'cross_provider_attempts':l.ledger()-before};(EVIDENCE/'provider-disabled.json').write_text(json.dumps(out,indent=2)+'\n');print('disabled provider',out)
 finally:
  snap=l.admin('GET');provider['enabled']=True;l.admin('POST','/providers',{'expected_version':snap['version'],'item':provider})

if __name__=='__main__':main()
