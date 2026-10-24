import sys,json,os,signal,time,concurrent.futures
from pathlib import Path
import httpx
sys.path.insert(0,'.local/production-audit');from audit_client import Live
sys.path.insert(0,'.');from shared.service_auth import service_token
l=Live();f=json.loads((Path(l.context['work'])/'audit-runtime-fixtures.json').read_text());user=f['other'];out={}
url=l.urls['auth']+'/internal/verify-token';request=httpx.Request('POST',url,json={'userId':user['user']['id'],'token':user['accessToken']});token=service_token('auth','POST',url,request.content,credentials=l.context['identities']['gateway']);headers={'X-DocCraft-Service-Token':token,'Content-Type':'application/json'}
r1=l.http.post(url,content=request.content,headers=headers);r2=l.http.post(url,content=request.content,headers=headers);r3=l.http.post(url,content=b'{}',headers=headers)
out['signed_replay']={'first_http':r1.status_code,'replay_http':r2.status_code,'tampered_body_http':r3.status_code,'status':'PASS' if r1.status_code==200 and r2.status_code in [401,403,409] and r3.status_code in [401,403] else 'FAIL','scope':'Actual pairwise JWT, request body binding and real Redis nonce store'}
for service in ['redis','postgres']:
 pid=l.context['processes'][service];assert os.getpgid(pid)==pid
 # Freeze only the known disposable fixture session, always resume in finally.
 with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
  os.killpg(pid,signal.SIGSTOP)
  try:
   start=time.monotonic();future=pool.submit(l.http.get,l.urls['gateway']+'/v1/auth/me',headers={'Authorization':'Bearer '+user['accessToken']},timeout=9);time.sleep(6)
  finally:os.killpg(pid,signal.SIGCONT)
  try:r=future.result(timeout=12);status=r.status_code
  except Exception:status='client_timeout'
 time.sleep(1);after=l.http.get(l.urls['gateway']+'/v1/auth/me',headers={'Authorization':'Bearer '+user['accessToken']},timeout=12)
 out[service+'_outage']={'during_http':status,'after_resume_http':after.status_code,'freeze_seconds':6,'status':'PASS' if status in [500,502,503,504,'client_timeout'] and after.status_code==200 else 'FAIL','scope':'Controlled native pause/resume; no process/data/volume was deleted; timeout not availability success'}
Path('docs/production-audit/evidence/runtime/failure-and-replay.json').write_text(json.dumps(out,indent=2)+'\n');print(out)
