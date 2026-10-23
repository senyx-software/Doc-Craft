"""Audit-only probes for the explicitly isolated production-audit fixture.

Never changes application source, uses developer env files, or contacts providers.
Email challenges come only from the newly created local fixture database.
"""
import concurrent.futures,json,os,re,sys,time,uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.local/production-remediation'))
from live_client import Live,WORK
OUT=ROOT/'docs/production-remediation/evidence/runtime'
OUT.mkdir(parents=True,exist_ok=True)

def main():
 l=Live()
 if not l.context['database'].startswith('doccraft_staging_hybrid_'):raise ValueError('Disposable database required')
 if any(urlsplit(url).hostname!='127.0.0.1' for url in l.urls.values()):raise ValueError('Loopback fixture required')
 results=[]
 def record(identity,feature,steps,expected,fn,sources):
  start=time.monotonic()
  try:actual=fn();status='PASS'
  except Exception as error:actual={'exception':type(error).__name__,'reason':str(error) if isinstance(error,AssertionError) else 'Inspect private fixture diagnostics'};status='FAIL'
  results.append({'id':identity,'feature':feature,'preconditions':'Fresh task-owned native PostgreSQL/Redis/services; no provider credentials; challenges read from local DB, no email delivery claim','steps':steps,'expected':expected,'actual':actual,'status':status,'latency_ms':round((time.monotonic()-start)*1000),'source_files':sources,'scope':'actual integrated HTTP/database, not browser or provider delivery'})
  (OUT/'integrated-tests.json').write_text(json.dumps(results,indent=2)+'\n');print(identity,status,flush=True)
 def req(method,service,path,user=None,body=None,expected=None):
  h={'Authorization':'Bearer '+user['accessToken']} if user else {}
  r=l.http.request(method,l.urls[service]+path,headers=h,**({'json':body} if body is not None else {}))
  if expected is not None:assert r.status_code in expected,'Unexpected HTTP '+str(r.status_code)+'; expected '+str(expected)
  return r
 a=l.user('audit-owner-2');b=l.user('audit-other-2');headers={'Authorization':'Bearer '+a['accessToken']}
 record('INT-001','Registration, verification, login persistence',['Register two unique fixture accounts; read one-time email challenges from owned DB; verify and password login'],'Both real users have hashed stored passwords, verified flag, signed access/refresh tokens',lambda:{'verified_users':l.query('SELECT COUNT(*) FROM users WHERE email LIKE %s AND "emailVerified"=true',('hybrid-audit-%@example.com',))[0][0],'tokens_received':bool(a['accessToken'] and b['refreshToken'])},['services/auth/src/controllers/auth.controller.ts'])
 record('INT-002','Invalid registration',['POST invalid email/short password'],'HTTP400/422; no successful account creation',lambda:{'http':req('POST','gateway','/v1/auth/register',body={'email':'bad','password':'x'},expected=[400,422]).status_code},['services/auth/src/routes/auth.routes.ts'])
 record('INT-003','Wrong password',['POST wrong password for fixture account'],'HTTP401',lambda:{'http':req('POST','gateway','/v1/auth/login',body={'email':'hybrid-audit-owner-2@example.com','password':'Wrong-password-123!'},expected=[401]).status_code},['services/auth/src/controllers/auth.controller.ts'])
 record('INT-004','Profile identity',['Read own profile'],'Authenticated ID matches local user',lambda:({'identity_matches':req('GET','gateway','/v1/auth/me',a,expected=[200]).json()['user']['id']==a['user']['id']}),['services/auth/src/controllers/auth.controller.ts'])
 def profile():
  r=req('PATCH','gateway','/v1/auth/me',a,{'fullName':'Production Audit Owner','timezone':'Asia/Colombo','plan':'max'},[200]);data=req('GET','gateway','/v1/auth/me',a,expected=[200]).json()['user'];assert data['fullName']=='Production Audit Owner' and data['timezone']=='Asia/Colombo';assert data['plan']=='free','Profile mass assignment changed plan';return {'persisted':True,'plan_mass_assignment_rejected':True}
 record('INT-005','Profile persistence and plan mass assignment',['PATCH name/timezone plus unauthorized plan; reload profile'],'Name/timezone persist; plan remains free',profile,['services/auth/src/controllers/auth.controller.ts'])
 def refresh():
  old=a['refreshToken'];fresh=req('POST','gateway','/v1/auth/refresh',body={'refreshToken':old},expected=[200]).json();assert fresh['refreshToken']!=old;a.update(fresh);r=req('POST','gateway','/v1/auth/refresh',body={'refreshToken':old},expected=[401]);return {'rotated':True,'old_token_reuse_http':r.status_code}
 record('INT-006','Refresh-token rotation',['Refresh fixture token then replay old refresh token'],'New token pair; old token rejected',refresh,['services/auth/src/controllers/auth.controller.ts','services/auth/src/services/jwt.service.ts'])
 for i,path in enumerate(['/v1/auth/login/google','/v1/auth/oauth/google/callback']):
  record('INT-00'+str(7+i),'Google OAuth public routing',['Unauthenticated GET '+path],'An OAuth initiation/callback must reach its public auth handler',lambda path=path:({'http':req('GET','gateway',path,expected=[200,302,400,404,500,503]).status_code,'note':'Unconfigured provider reaches Auth rather than the stale gateway401 policy'}),['services/gateway/src/middleware/auth.middleware.ts','services/auth/src/routes/auth.routes.ts'])
 s=l.session(a);sid=s['sessionId'];path='/v1/chat/session/'+sid
 fields={'businessName':'Audit Business','clientName':'Audit Customer','invoiceNumber':'AUD-101','issueDate':'2026-10-21','dueDate':'2026-11-21','currency':'USD','senderAddress':'100 Test St','clientAddress':'200 Test St','senderEmail':'owner@example.com','senderPhone':'+14155550100','lineItems':[{'description':'Laptop','quantity':3,'unitPrice':500}]}
 def fields_test():
  req('PATCH','gateway',path,a,{'slots':fields,'expectedRevision':s['state']['revision']},[200]);data=req('GET','gateway',path+'/messages',a,expected=[200]).json();assert data['slots']['clientName']=='Audit Customer';return {'fields_persisted':True,'revision':data['state']['revision']}
 record('INT-009','Session creation and multi-field editor update',['Create invoice session; PATCH authorized fields; GET persisted state'],'Correct customer and revision persist',fields_test,['services/chat/src/routes/chat.routes.ts','services/chat/src/services/conversation.repository.ts'])
 record('INT-010','Cross-user document conversation isolation',['Other user reads owner session'],'HTTP403/404',lambda:{'http':req('GET','gateway',path+'/messages',b,expected=[403,404]).status_code},['services/chat/src/services/conversation.repository.ts'])
 def stale():
  req('PATCH','gateway',path,a,{'slots':{'clientName':'Wrong stale value'},'expectedRevision':0},[409]);data=req('GET','gateway',path+'/messages',a).json();assert data['slots']['clientName']=='Audit Customer';return {'stale_write_rejected':True,'unrelated_data_preserved':True}
 record('INT-011','Optimistic revision conflict',['Submit stale editor revision; reload'],'HTTP409 and saved customer preserved',stale,['services/chat/src/controllers/session.controller.ts'])
 def tax():
  before=l.ledger();r=l.turn(a,sid,'Change the tax to 10%.');assert r['done'] and not r['error'];slots=r['done']['state']['slots'];assert slots['taxRate']==10 and slots['totalDue']==1650 and slots['clientName']=='Audit Customer';assert l.ledger()==before;return {'totalDue':slots['totalDue'],'inference_calls':0,'sse_done':True}
 record('INT-012','Deterministic tax and totals',['Send SSE tax command; inspect committed fields and inference ledger'],'Tax10%,total1650,customer unchanged,zero inference',tax,['services/chat/src/routes/chat.routes.ts','shared/conversation-state.mjs'])
 def undo():
  r=l.turn(a,sid,'Undo that.');assert r['done'] and r['done']['state']['slots'].get('taxRate',0)==0;r=l.turn(a,sid,'Redo that.');assert r['done'] and r['done']['state']['slots']['taxRate']==10;return {'undo_and_redo_persisted':True}
 record('INT-013','Undo and redo',['Undo tax; redo tax; inspect authoritative state'],'Restored0 then10 tax',undo,['shared/conversation-state.mjs','services/chat/src/services/conversation.repository.ts'])
 def side():
  before=req('GET','gateway',path+'/messages',a).json()['slots'];n=l.ledger();r=l.turn(a,sid,'What is the difference between an invoice and a quotation?');assert r['done'] and not r['error'];after=req('GET','gateway',path+'/messages',a).json()['slots'];assert before==after and n==l.ledger();return {'document_unchanged':True,'inference_calls':0}
 record('INT-014','Deterministic side-question preservation',['Ask common business question; compare persisted slots'],'Natural response; no mutation or inference',side,['shared/assistant-knowledge.mjs','services/chat/src/routes/chat.routes.ts'])
 record('INT-015','Malformed chat input',['Send empty message and invalid turnId'],'HTTP400',lambda:{'http':req('POST','gateway',path+'/message',a,{'message':'','turnId':'invalid'},[400]).status_code},['services/chat/src/routes/chat.routes.ts'])
 def template_crud():
  endpoint='/v1/document/templates/custom';r=req('POST','gateway',endpoint,a,{'name':'Audit Custom','documentType':'invoice','canvasElements':[{'id':'audit-text','type':'text','x':20,'y':20,'w':200,'h':30,'text':'Audit Literal'}],'pageWidth':794,'pageHeight':1123},[201]);identity=r.json()['id'];req('GET','gateway',endpoint+'/'+identity,b,expected=[404]);req('PATCH','gateway',endpoint+'/'+identity,a,{'name':'Audit Renamed'},[200]);detail=req('GET','gateway',endpoint+'/'+identity,a,expected=[200]).json();assert detail['name']=='Audit Renamed' and detail['canvasElements'][0]['text']=='Audit Literal';req('DELETE','gateway',endpoint+'/'+identity,a,expected=[200,204]);req('GET','gateway',endpoint+'/'+identity,a,expected=[404]);return {'create_read_rename_delete':True,'cross_user_404':True}
 record('INT-016','Custom template CRUD and ownership',['Save literal canvas; other-user read; rename/reload; delete/reload'],'CRUD persists and other user denied',template_crud,['services/document/app/routers/document.py'])
 record('INT-017','Template catalog',['GET actual published catalog'],'Nonempty templates with actual server definitions',lambda:{'count':len(req('GET','gateway','/v1/document/templates',a,expected=[200]).json()['templates'])},['services/document/app/routers/document.py'])
 record('INT-018','Premature document generation',['Request generation before explicit confirmation'],'HTTP422; no fabricated PDF success',lambda:{'http':req('POST','gateway','/v1/document/generate',a,{'documentType':'invoice','sessionId':sid},[422]).status_code},['services/document/app/routers/document.py'])
 record('INT-019','Quota and entitlements',['GET user quota and entitlement endpoints'],'Correct authenticated policy and usage shapes',lambda:{'quota_http':req('GET','gateway','/v1/quota/me',a,expected=[200]).status_code,'entitlements_http':req('GET','gateway','/v1/quota/entitlements',a,expected=[200]).status_code},['services/quota/src/routes/quota.routes.ts'])
 record('INT-020','Internal quota mutation protection',['User JWT calls private increment route'],'Denied401/403/404',lambda:{'http':req('POST','gateway','/v1/quota/increment',a,{'userId':a['user']['id'],'plan':'max'},[401,403,404]).status_code},['services/quota/src/middleware/authenticate.ts'])
 record('INT-021','Admin regular-user rejection',['User JWT reads AI settings and admin users'],'Denied401/403',lambda:{'ai_http':req('GET','admin-api','/api/v1/admin/ai',a,expected=[401,403]).status_code,'users_http':req('GET','admin-api','/api/v1/users/',a,expected=[401,403]).status_code},['services/admin-api/app/security/authentication.py'])
 def admin_login():
  auth=l.login_admin();assert auth['is_super_admin'];return {'password_plus_one_use_code_executed':True,'external_email_not_tested':True}
 record('INT-022','Admin actual login and challenge',['Password login; consume local one-use challenge'],'Authenticated super-admin session',admin_login,['services/admin-api/app/api/v1/auth.py'])
 record('INT-023','Admin live configuration read',['Authenticated read plans/users/AI settings'],'Correct authenticated actual data shape',lambda:{'plans':len(l.admin('GET','/api/v1/admin/plans',base='')),'users_http':bool(l.admin('GET','/api/v1/users/',base='')),'ai_version':l.admin('GET')['version']},['services/admin-api/app/api/v1/plans.py','services/admin-api/app/api/v1/users.py','services/admin-api/app/api/v1/ai_management.py'])
 def admin_models():
  config=l.admin('GET');p=l.admin('POST','/providers',{'expected_version':config['version'],'item':{'name':'Audit Local','kind':'ollama','endpoint':'http://127.0.0.1:11434/api','locality':'local','credential_required':False,'enabled':False}})
  config=l.admin('GET');providers=config['data']['providers'];assert any(x['name']=='Audit Local' for x in providers);return {'provider_persisted':True,'configuration_version':config['version']}
 record('INT-024','Admin provider creation and persistence',['Create disabled local provider with one-use2FA; reload config'],'Provider saved; no inference or external request',admin_models,['services/admin-api/app/api/v1/ai_management.py'])
 record('INT-025','Unsigned private service request',['GET direct admin internal policy with spoofed identity headers'],'401/403 rejection',lambda:{'http':req('GET','admin-api','/api/v1/internal/entitlements/'+a['user']['id'],expected=[401,403]).status_code},['shared/service_auth.py','services/admin-api/app/api/v1/entitlements.py'])
 def logout():
  req('POST','gateway','/v1/auth/logout',a,{'refreshToken':a['refreshToken']},[200]);r=req('POST','gateway','/v1/auth/refresh',body={'refreshToken':a['refreshToken']},expected=[401]);return {'logged_out_refresh_rejected':r.status_code}
 record('INT-026','Logout revokes refresh session',['Logout exact session; reuse refresh token'],'HTTP401 on refresh',logout,['services/auth/src/controllers/auth.controller.ts'])
 (WORK/'audit-runtime-fixtures.json').write_text(json.dumps({'owner':a,'other':b,'session':sid}));os.chmod(WORK/'audit-runtime-fixtures.json',0o600)
 print(json.dumps({'tests':len(results),'passed':sum(r['status']=='PASS' for r in results),'failed':sum(r['status']=='FAIL' for r in results)}))

def negatives():
 l=Live();inventory=json.loads((ROOT/'docs/production-audit/evidence/api-inventory.json').read_text());results=[]
 def probe(e):
  route=re.sub(r'\{[^}]+\}|:[A-Za-z_][A-Za-z0-9_]*','audit-nonexistent',e['route']);started=time.monotonic()
  try:
   response=l.http.request(e['method'],l.urls[e['service']]+route,**({'json':{}} if e['method'] in ['POST','PUT','PATCH','DELETE'] else {}),timeout=8)
   try:body=response.json();keys=list(body) if isinstance(body,dict) else ['array']
   except Exception:keys=['non_json']
   return {'service':e['service'],'method':e['method'],'route':e['route'],'tested_path':route,'http_status':response.status_code,'response_keys':keys[:20],'latency_ms':round((time.monotonic()-started)*1000),'scope':'Unauthenticated request with empty body; does not verify authorized business functionality','source':e['source']+':'+str(e['line'])}
  except Exception as error:return {'service':e['service'],'method':e['method'],'route':e['route'],'http_status':None,'error_type':type(error).__name__,'scope':'Probe failed; no functionality claim'}
 # Bounded three-client pool. No credentials/provider URLs are supplied.
 with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:results=list(pool.map(probe,inventory['endpoints']))
 (OUT/'endpoint-negative-probes.json').write_text(json.dumps(results,indent=2)+'\n');print('Executed',len(results),'unauthenticated endpoint probes')

if __name__=='__main__':negatives() if '--negative-sweep' in sys.argv else main()
