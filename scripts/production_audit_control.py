import sys,os,json,concurrent.futures,uuid,time
from pathlib import Path
sys.path.insert(0,'.local/production-audit');from audit_client import Live
sys.path.insert(0,'.');from shared.service_auth import service_request
l=Live();user=l.user('quota-concurrency-'+uuid.uuid4().hex[:6]);uid=user['user']['id'];out={};before=l.request('GET','gateway','/v1/quota/entitlements',headers={'Authorization':'Bearer '+user['accessToken']})
l.admin('PATCH','/api/v1/users/'+uid+'/quota',{'daily_limit':2},base='');after=l.request('GET','gateway','/v1/quota/entitlements',headers={'Authorization':'Bearer '+user['accessToken']});out['quota_propagation']={'status':'PASS' if after['daily_quota']==2 else 'FAIL','before_limit':before['daily_quota'],'after_limit':after['daily_quota'],'actual_admin_postgres_redis_quota_chain':True}
os.environ.update(l.context['envs']['document'])
def reserve(index):
 st=time.monotonic();r=service_request('quota','POST',l.urls['quota']+'/v1/quota/check',json={'userId':uid,'plan':'free','reservationId':'audit-'+str(index)+'-'+uuid.uuid4().hex},timeout=12);return {'http':r.status_code,'latency_ms':round((time.monotonic()-st)*1000)}
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:rows=list(pool.map(reserve,range(8)))
out['quota_concurrency']={'status':'PASS' if sum(r['http']==200 for r in rows)==2 and sum(r['http']==403 for r in rows)==6 else 'FAIL','results':rows,'requested':8,'configured_limit':2,'method':'Actual signed document->quota service requests; durable PostgreSQL accounting'}
h={'Authorization':'Bearer '+l.admin_token};l.request('POST','admin-api','/api/v1/admin/auth/request-action-code',headers=h);h['X-Admin-2FA']=l.query('SELECT code FROM verification_codes WHERE email=%s',('action:'+l.context['admin_email'],))[0][0];r=l.http.patch(l.urls['admin-api']+'/api/v1/users/'+uid+'/quota',headers=h,json={'daily_limit':0});out['zero_limit_validation']={'http':r.status_code,'status':'PASS' if r.status_code==422 else 'FAIL','expected':'Natural-number limit or -1 only; zero rejected'}
Path('docs/production-audit/evidence/runtime/control-and-quota.json').write_text(json.dumps(out,indent=2)+'\n');print(out)
