import sys,secrets,json,concurrent.futures
from pathlib import Path
sys.path.insert(0,'.local/production-audit');from audit_client import Live
l=Live();user=l.user('reset-race');email='hybrid-reset-race@example.com';l.request('POST','gateway','/v1/auth/password/forgot',json={'email':email});token=l.query('SELECT token FROM password_resets WHERE "userId"=%s ORDER BY "createdAt" DESC LIMIT 1',(user['user']['id'],))[0][0]
def attempt(index):
 r=l.http.post(l.urls['gateway']+'/v1/auth/password/reset',json={'token':token,'newPassword':secrets.token_urlsafe(25)+'Aa1!'});return r.status_code
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:statuses=list(pool.map(attempt,range(2)))
result={'status':'DEFECT_REPRODUCED' if statuses.count(200)>1 else 'NOT_REPRODUCED','same_reset_token_concurrent_requests':2,'statuses':statuses,'expected':'At most one successful password mutation per reset token','scope':'Actual gateway/auth/PostgreSQL with one synthetic account; no external email delivered; token never recorded in evidence','source':'services/auth/src/controllers/auth.controller.ts:404'};Path('docs/production-audit/evidence/runtime/password-reset-race.json').write_text(json.dumps(result,indent=2)+'\n');print(result)
