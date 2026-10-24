import sys,secrets,json,os,uuid
from pathlib import Path
sys.path.insert(0,'.local/production-audit');from audit_client import Live
l=Live();email='audit-browser-'+uuid.uuid4().hex[:8]+'@example.com';password=secrets.token_urlsafe(25)+'Aa1!'
l.request('POST','gateway','/v1/auth/register',json={'email':email,'password':password,'fullName':'Audit Browser'})
code=l.query('SELECT "verificationToken" FROM users WHERE email=%s',(email,))[0][0];l.request('POST','gateway','/v1/auth/verify-email',json={'email':email,'code':code})
user=l.request('POST','gateway','/v1/auth/login',json={'email':email,'password':password});admin=l.login_admin()
p=Path('.local/production-audit/browser-fixture.json');p.write_text(json.dumps({'urls':l.urls,'email':email,'password':password,'user':user,'admin':admin}));p.chmod(0o600);print('Prepared fresh isolated browser account and real admin challenge session')
