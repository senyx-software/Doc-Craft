"""Full local regression with command, exit status and redacted logs per check."""
import concurrent.futures,datetime,json,os,re,subprocess,sys,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('DOCCRAFT_AUDIT_EVIDENCE_DIR',str(ROOT/'docs/system-audit/evidence/phase4')))/'regression';OUT.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(ROOT/'scripts'));from system_audit_check import redact
JOBS=[
 ('backend-build',['npm','run','build'],'.'),
 ('user-build',['npm','run','build'],'user-frontend'),('admin-build',['npm','run','build'],'admin'),
 ('user-lint',['npm','run','lint'],'user-frontend'),('admin-lint',['npm','run','lint'],'admin'),
 ('auth-tests',['npm','test','-w','doccraft-auth'],'.'),('payment-tests',['npm','test','-w','doccraft-payment'],'.'),('quota-tests',['npm','test','-w','doccraft-quota'],'.'),
 ('chat-shared-user-tests',['npm','run','test:chat'],'.'),
 ('gateway-notification-tests',['node_modules/.bin/vitest','run','services/gateway/src','services/notification/src'],'.'),
 ('admin-tests',[str(ROOT/'.venv-local/bin/python'),'-m','pytest','services/admin-api/tests','-q'],'.'),
 ('document-tests',[str(ROOT/'.venv-local/bin/python'),'-m','pytest','services/document/tests','-q'],'.'),
 ('analytics-tests',[str(ROOT/'.venv-local/bin/python'),'-m','pytest','tests','-q'],'services/analytics'),
 ('shared-python-tests',[str(ROOT/'.venv-local/bin/python'),'-m','pytest','shared/tests','-q'],'.'),
 ('backend-dependencies',['npm','audit','--json'],'.'),('user-dependencies',['npm','audit','--json'],'user-frontend'),('admin-dependencies',['npm','audit','--json'],'admin'),
 ('user-runtime-dependencies',['npm','audit','--omit=dev','--json'],'user-frontend'),('admin-runtime-dependencies',['npm','audit','--omit=dev','--json'],'admin'),
 ('python-dependencies',[str(ROOT/'.venv-local/bin/pip-audit'),'--local','--format','json'],'.'),
]

def run(job):
 name,command,cwd=job;start=time.monotonic();stamp=datetime.datetime.now(datetime.timezone.utc).isoformat();env={**os.environ,'PYTHONPATH':str(ROOT)+os.pathsep+str(ROOT/cwd)}
 # A real installed Chromium is used with its sandbox enabled. The host may
 # reject its sandbox: report that failure as a deployment blocker, not a pass.
 env['PUPPETEER_EXECUTABLE_PATH']='/home/eranda/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome'
 try:
  process=subprocess.Popen(command,cwd=ROOT/cwd,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,start_new_session=True)
  output,_=process.communicate(timeout=240);code=process.returncode
 except subprocess.TimeoutExpired:
  import signal
  os.killpg(process.pid,signal.SIGTERM);output,_=process.communicate(timeout=15);code=124
 output=redact(re.sub(r'\x1b\[[0-9;]*m','',output));(OUT/(name+'.log')).write_text(output)
 status='PASS' if code==0 else 'FAIL'
 if name=='chat-shared-user-tests' and 'No usable sandbox!' in output:status='BLOCKED'
 if name.endswith('dependencies') and code!=0 and 'vulnerabilities' in output:status='FAIL' if os.getenv('DOCCRAFT_AUDIT_EVIDENCE_DIR','').endswith('/phase5') else 'OPEN_FINDINGS'
 record={'id':name,'command':command,'cwd':cwd,'started_utc':stamp,'seconds':round(time.monotonic()-start,2),'exit_code':code,'status':status,'log':str((OUT/(name+'.log')).relative_to(ROOT))}
 (OUT/(name+'.json')).write_text(json.dumps(record,indent=2)+'\n');print(name+': '+status,flush=True);return record

def main():
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:results=list(pool.map(run,JOBS))
 (OUT/'summary.json').write_text(json.dumps({'checks':results,'production_readiness':'NOT READY'},indent=2)+'\n')
 return int(any(r['status']=='FAIL' for r in results))
if __name__=='__main__':raise SystemExit(main())
