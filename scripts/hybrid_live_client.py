"""HTTP client for the task-owned live stack. Never reads developer credentials.

Email delivery is deliberately suppressed; challenges are read only from the
fresh local database. JWT validation, RBAC, one-use 2FA and service signatures
are executed by the running services, without dependency overrides.
"""
import json, os, secrets, time, uuid
from pathlib import Path
import httpx, psycopg2

ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.local/hybrid-live/stack'
EVIDENCE=ROOT/'docs/hybrid-ai/evidence/live'

class Live:
 def __init__(self):
  self.context=json.loads((WORK/'context.json').read_text())
  self.urls=self.context['urls'];self.http=httpx.Client(timeout=190)
  self.db=psycopg2.connect(self.context['database_url']);self.db.autocommit=True
  self.admin_token=None
 def query(self,sql,args=()):
  with self.db.cursor() as cur:
   cur.execute(sql,args)
   return cur.fetchall() if cur.description else []
 def request(self,method,service,path,**kwargs):
  response=self.http.request(method,self.urls[service]+path,**kwargs)
  if response.status_code>=400:raise RuntimeError(f'{method} {service} {path}: HTTP {response.status_code}; inspect private response')
  return response.json()
 def login_admin(self):
  c=self.context
  self.request('POST','admin-api','/api/v1/admin/auth/login',json={'email':c['admin_email'],'password':c['admin_password']})
  code=self.query('SELECT code FROM verification_codes WHERE email=%s',('login:'+c['admin_email'],))[0][0]
  result=self.request('POST','admin-api','/api/v1/admin/auth/verify-login-code',json={'email':c['admin_email'],'verification_code':code})
  self.admin_token=result['access_token'];return result
 def admin(self,method,path='',body=None,base='/api/v1/admin/ai'):
  if not self.admin_token:self.login_admin()
  headers={'Authorization':'Bearer '+self.admin_token}
  if method!='GET':
   self.request('POST','admin-api','/api/v1/admin/auth/request-action-code',headers=headers)
   headers['X-Admin-2FA']=self.query('SELECT code FROM verification_codes WHERE email=%s',('action:'+self.context['admin_email'],))[0][0]
  response=self.http.request(method,self.urls['admin-api']+base+path,headers=headers,**({'json':body} if body is not None else {}))
  if response.status_code>=400:
   (WORK/'last-admin-error.json').write_text(response.text)
   raise RuntimeError(f'Admin {method} {path}: HTTP {response.status_code}; private last-admin-error.json')
  return response.json()
 def user(self,label):
  target=WORK/('user-'+label+'.json')
  if target.exists():
   cached=json.loads(target.read_text())
   refreshed=self.request('POST','gateway','/v1/auth/refresh',json={'refreshToken':cached['refreshToken']})
   cached.update(refreshed);target.write_text(json.dumps(cached));os.chmod(target,0o600);return cached
  email='hybrid-'+label+'@example.com';password=secrets.token_urlsafe(25)+'Aa1!'
  self.request('POST','gateway','/v1/auth/register',json={'email':email,'password':password,'fullName':'Live Validation'})
  code=self.query('SELECT "verificationToken" FROM users WHERE email=%s',(email,))[0][0]
  self.request('POST','gateway','/v1/auth/verify-email',json={'email':email,'code':code})
  user=self.request('POST','gateway','/v1/auth/login',json={'email':email,'password':password})
  with open(target,'x',opener=lambda p,f:os.open(p,f,0o600)) as out:json.dump(user,out)
  return user
 def session(self,user):
  return self.request('POST','gateway','/v1/chat/session',headers={'Authorization':'Bearer '+user['accessToken']},json={'documentTypeId':'invoice','templateId':'invoice-modern','timezone':'UTC'})
 def turn(self,user,session,message,**extra):
  started=time.monotonic();r=self.http.post(self.urls['gateway']+'/v1/chat/session/'+session+'/message',headers={'Authorization':'Bearer '+user['accessToken']},json={'turnId':str(uuid.uuid4()),'message':message,**extra})
  events=[json.loads(line[5:]) for line in r.text.splitlines() if line.startswith('data:')]
  return {'http_status':r.status_code,'latency_ms':round((time.monotonic()-started)*1000),'events':events,'done':next((e for e in events if e['type']=='done'),None),'error':next((e for e in events if e['type']=='error'),None)}
 def ledger(self):return self.query('SELECT count(*) FROM ai_inference_ledger')[0][0]

if __name__=='__main__':
 live=Live();live.login_admin();u=live.user('free');s=live.session(u)
 print(json.dumps({'admin_login':'passed','user_login':'passed','session_created':bool(s.get('sessionId'))}))
