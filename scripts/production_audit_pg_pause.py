import os,sys,json,signal,time,concurrent.futures
from pathlib import Path
sys.path.insert(0,'.local/production-audit');from audit_client import Live
l=Live();fixture=json.load(open('.local/production-audit/stack/audit-runtime-fixtures.json'));user=fixture['other'];root=l.context['processes']['postgres'];table={}
for p in Path('/proc').iterdir():
 try:table[int(p.name)]=int((p/'stat').read_text().rsplit(')',1)[1].split()[1])
 except Exception:pass
members={root}
while True:
 extra={pid for pid,parent in table.items() if parent in members}
 if extra<=members:break
 members|=extra
with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
 stopped=[]
 try:
  for pid in members:
   try:os.kill(pid,signal.SIGSTOP);stopped.append(pid)
   except ProcessLookupError:pass
  start=time.monotonic();future=pool.submit(l.http.get,l.urls['gateway']+'/v1/auth/me',headers={'Authorization':'Bearer '+user['accessToken']},timeout=10);time.sleep(3);completed_during_pause=future.done()
 finally:
  for pid in stopped:
   try:os.kill(pid,signal.SIGCONT)
   except ProcessLookupError:pass
 response=future.result(timeout=12);duration=round((time.monotonic()-start)*1000)
recovered=l.http.get(l.urls['gateway']+'/v1/auth/me',headers={'Authorization':'Bearer '+user['accessToken']})
p=Path('docs/production-audit/evidence/runtime/failure-and-replay.json');d=json.loads(p.read_text());d['postgres_initial_probe']={**d.pop('postgres_outage'),'status':'INCONCLUSIVE','reason':'Pausing only postmaster process group does not necessarily pause existing PostgreSQL backend process groups; initial return200 does not prove fail-open'}
d['postgres_outage']={'status':'PASS' if (not completed_during_pause or response.status_code>=400) and recovered.status_code==200 else 'FAIL','paused_owned_processes':len(stopped),'pause_seconds':3,'completed_before_resume':completed_during_pause,'request_http':response.status_code,'request_latency_ms':duration,'after_resume_http':recovered.status_code,'scope':'All known task-owned PG descendants paused then always resumed; bounded wait or refusal permitted; no availability SLO asserted'};p.write_text(json.dumps(d,indent=2)+'\n');print(d['postgres_outage'])
