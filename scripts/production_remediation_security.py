"""Real isolated gateway/Auth/PostgreSQL remediation acceptance. Never production."""
import concurrent.futures
import hashlib
import json
import secrets
import sys
import uuid
from pathlib import Path
from urllib.parse import urlsplit
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.local/production-remediation'))
from live_client import Live,WORK
l=Live()
if not l.context['database'].startswith('doccraft_staging_hybrid_') or any(urlsplit(u).hostname!='127.0.0.1' for u in l.urls.values()):
    raise RuntimeError('Owned loopback fixture required')
OUT=ROOT/'docs/production-remediation/evidence/runtime'
OUT.mkdir(parents=True,exist_ok=True)
settings=l.admin('GET','/api/v1/admin/config/settings',base='')['data']
if not (WORK/'original-settings.json').exists():
    (WORK/'original-settings.json').write_text(json.dumps(settings));(WORK/'original-settings.json').chmod(0o600)
updated={**settings,'rate_limits':{**settings.get('rate_limits',{}),'auth':300}}
l.admin('PUT','/api/v1/admin/config/settings',updated,base='')
results=[]
def check(name,passed,actual,scope='actual gateway/Auth/PostgreSQL; synthetic owned state'):
    results.append({'id':name,'status':'PASS' if passed else 'FAIL','actual':actual,'scope':scope})
u=l.user('remediation-reset-'+uuid.uuid4().hex[:6]);uid=u['user']['id']
raw=secrets.token_hex(32);digest='sha256:'+hashlib.sha256(raw.encode()).hexdigest()
l.query('INSERT INTO password_resets(id,"userId",token,"expiresAt",used,"createdAt") VALUES(%s,%s,%s,NOW()+INTERVAL \'1 hour\',false,NOW())',(str(uuid.uuid4()),uid,digest))
passwords=[secrets.token_urlsafe(24)+'Aa1!' for _ in range(8)]
def reset(password):
    return l.http.post(l.urls['gateway']+'/v1/auth/password/reset',json={'token':raw,'newPassword':password}).status_code
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    statuses=list(pool.map(reset,passwords))
check('SEC-002-concurrent',statuses.count(200)==1 and statuses.count(400)==7,{'statuses':statuses,'one_success_required':True,'token_never_recorded':True})
replay=reset(secrets.token_urlsafe(24)+'Aa1!');check('SEC-002-replay',replay==400,{'http':replay})
old=l.http.get(l.urls['gateway']+'/v1/auth/me',headers={'Authorization':'Bearer '+u['accessToken']})
check('SEC-002-access-revocation',old.status_code in (401,403),{'http':old.status_code,'expected':'Revoked access is denied'},)
old=l.http.post(l.urls['gateway']+'/v1/auth/refresh',json={'refreshToken':u['refreshToken']})
check('SEC-002-refresh-revocation',old.status_code==401,{'http':old.status_code})
winner=statuses.index(200) if 200 in statuses else 0
email=l.query('SELECT email FROM users WHERE id=%s',(uid,))[0][0]
login=l.http.post(l.urls['gateway']+'/v1/auth/login',json={'email':email,'password':passwords[winner]})
check('SEC-002-winning-password',login.status_code==200,{'http':login.status_code})
# Real server-set refresh cookie; no refresh token supplied in the JSON request.
cookie=l.http.cookies.get('doccraft_refresh');origin=l.context['urls']['user-ui']
r=l.http.post(l.urls['auth']+'/v1/auth/refresh',json={},headers={'Origin':'https://untrusted.example'})
check('FE-006-refresh-origin',r.status_code==403,{'http':r.status_code})
r=l.http.post(l.urls['gateway']+'/v1/auth/refresh',json={},headers={'Origin':origin})
check('FE-006-cookie-rotation',r.status_code==200 and bool(cookie) and l.http.cookies.get('doccraft_refresh')!=cookie,{'http':r.status_code,'rotated':bool(cookie) and l.http.cookies.get('doccraft_refresh')!=cookie,'refresh_cookie_httponly':any(c.name=='doccraft_refresh' and c.has_nonstandard_attr('HttpOnly') for c in l.http.cookies.jar)})
for path in ['/v1/auth/login/google','/v1/auth/oauth/google/callback']:
    r=l.http.get(l.urls['gateway']+path)
    check('API-001-'+path.rsplit('/',1)[-1],r.status_code==503,{'http':r.status_code,'expected':'Unconfigured provider returns503 from Auth rather than gateway401'})
# Actual PostgreSQL admin uniqueness/concurrency, separate from SQLite regression tests.
import os
os.environ.update(l.context['envs']['admin-api']);sys.path[:0]=[str(ROOT),str(ROOT/'services/admin-api')]
from app.repositories.admin_user_repository import admin_user_repository as repository
prefix=uuid.uuid4().hex
with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
    staff=list(pool.map(lambda i:repository.create(f'{prefix}-{i}@example.com','unused-fixture-hash','role_support'),range(16)))
check('DB-001-postgres-concurrency',len({s.id for s in staff})==16,{'created':len(staff),'unique':len({s.id for s in staff})},'actual PostgreSQL runtime role and repository; synthetic staff')
try:
    repository.create(staff[0].email.upper(),'unused-other-hash','role_super_admin')
    duplicate=500
except Exception as e:
    duplicate=getattr(e,'status_code',500)
check('DB-001-normalized-email',duplicate==409 and repository.get_by_id(staff[0].id).role_id=='role_support',{'http_equivalent':duplicate,'original_role_preserved':repository.get_by_id(staff[0].id).role_id=='role_support'},'actual PostgreSQL unique index and repository')
(OUT/'security-acceptance.json').write_text(json.dumps({'checks':results,'email_transport':'not delivered; recovery challenge seeded only in owned PostgreSQL','production_changed':False},indent=2)+'\n')
print(json.dumps({'total':len(results),'pass':sum(r['status']=='PASS' for r in results),'fail':[r['id'] for r in results if r['status']=='FAIL']}))
