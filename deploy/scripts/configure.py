#!/usr/bin/env python3
"""Validate centralized public/internal configuration and produce private service envs.

No shell evaluation, developer env discovery, secret generation or rotation.
Run as the deployment controller's operator, not the SSH deployment identity.
"""
import argparse,ipaddress,json,os,re,stat,sys
from pathlib import Path
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[2]
PORTS={'gateway':3001,'auth':3011,'notification':3012,'document':3013,'payment':3014,'quota':3015,'chat':3016,'analytics':3017,'admin-api':3018,'pdf':3023}
SERVICES=[*PORTS,'user-ui','admin-ui']
DB_SERVICES={'auth','notification','document','payment','quota','chat','analytics','admin-api'}
URLS={'AUTH_SERVICE_URL':'auth','NOTIFICATION_SERVICE_URL':'notification','DOCUMENT_SERVICE_URL':'document','PAYMENT_SERVICE_URL':'payment','BILLING_SERVICE_URL':'payment','QUOTA_SERVICE_URL':'quota','AI_SERVICE_URL':'chat','CHAT_SERVICE_URL':'chat','ANALYTICS_SERVICE_URL':'analytics','ADMIN_API_SERVICE_URL':'admin-api','ADMIN_API_URL':'admin-api','GATEWAY_URL':'gateway'}
USES={
 'gateway':['AUTH_SERVICE_URL','DOCUMENT_SERVICE_URL','BILLING_SERVICE_URL','QUOTA_SERVICE_URL','AI_SERVICE_URL','ANALYTICS_SERVICE_URL','ADMIN_API_SERVICE_URL','NOTIFICATION_SERVICE_URL','CORS_ORIGINS'],
 'auth':['ADMIN_API_SERVICE_URL','NOTIFICATION_SERVICE_URL','ANALYTICS_SERVICE_URL','FRONTEND_URL','GOOGLE_CLIENT_ID','GOOGLE_CALLBACK_URL','FIREBASE_PROJECT_ID','EMAIL_FROM'],
 'notification':['AUTH_SERVICE_URL','ADMIN_API_URL','FRONTEND_URL','RESEND_FROM_EMAIL'],
 'document':['AUTH_SERVICE_URL','QUOTA_SERVICE_URL','ADMIN_API_SERVICE_URL','AI_SERVICE_URL','ANALYTICS_SERVICE_URL','GATEWAY_URL','SUPABASE_URL','LEGACY_STORAGE_PROVIDER','LOCAL_STORAGE_DIR','SIDECAR_URL'],
 'payment':['AUTH_SERVICE_URL','QUOTA_SERVICE_URL','ADMIN_API_SERVICE_URL','NOTIFICATION_SERVICE_URL','ANALYTICS_SERVICE_URL','FRONTEND_URL','PAYMENT_SERVICE_PUBLIC_URL','PADDLE_SANDBOX','PAYHERE_SANDBOX','PADDLE_PRO_MONTHLY_PRICE_ID','PADDLE_PRO_YEARLY_PRICE_ID','PADDLE_MAX_MONTHLY_PRICE_ID','PADDLE_MAX_YEARLY_PRICE_ID','PAYHERE_MERCHANT_ID'],
 'quota':['AUTH_SERVICE_URL','ADMIN_API_SERVICE_URL','ANALYTICS_SERVICE_URL','FRONTEND_URL'],
 'chat':['AUTH_SERVICE_URL','QUOTA_SERVICE_URL','ADMIN_API_SERVICE_URL','ANALYTICS_SERVICE_URL','BILLING_SERVICE_URL','CORS_ORIGIN','TURN_TIMEOUT_MS','MAX_CONCURRENT_REQUESTS','MAX_QUEUE_SIZE'],
 'analytics':['AUTH_SERVICE_URL','PAYMENT_SERVICE_URL','POSTHOG_HOST'],
 'admin-api':['AUTH_SERVICE_URL','QUOTA_SERVICE_URL','PAYMENT_SERVICE_URL','CHAT_SERVICE_URL','DOCUMENT_SERVICE_URL','NOTIFICATION_SERVICE_URL','ANALYTICS_SERVICE_URL','GATEWAY_URL','CHAT_SERVICE_MCP_URL','POSTHOG_HOST','POSTHOG_PROJECT_ID','RESEND_FROM_EMAIL','ALLOWED_ORIGINS','ALLOWED_ADMIN_IPS','IP_WHITELIST_ENABLED','TRUSTED_PROXY_IPS','AI_ALLOWED_LOCAL_ENDPOINTS','AI_ALLOWED_CLOUD_HOSTS','LOCAL_STORAGE_DIR'],
 'pdf':['SIDECAR_PORT','SIDECAR_HOST','PDF_MAX_CONCURRENT','PUPPETEER_EXECUTABLE_PATH'],
}
DEPLOY_KEYS={'APP_DOMAIN','ADMIN_DOMAIN','ADMIN_ALLOWED_CIDRS','ACME_EMAIL','CONFIG_VERSION','REGISTRY_PREFIX','POSTGRES_DB','LOCAL_AI_ENABLED','OLLAMA_MEMORY_MB','OLLAMA_CPUS'}
OPTIONAL={k for v in USES.values() for k in v}-set(URLS)-{'FRONTEND_URL','CORS_ORIGIN','CORS_ORIGINS','ALLOWED_ORIGINS','LOCAL_STORAGE_DIR','SIDECAR_URL','CHAT_SERVICE_MCP_URL','SIDECAR_PORT','SIDECAR_HOST','PUPPETEER_EXECUTABLE_PATH'}
REQUIRED_SECRETS={s:{'REDIS_URL'}|({'DATABASE_URL','DIRECT_URL'} if s in DB_SERVICES else set()) for s in PORTS}
REQUIRED_SECRETS['auth']|={'JWT_SECRET','JWT_REFRESH_SECRET'}
REQUIRED_SECRETS['admin-api']|={'ADMIN_JWT_SECRET','ADMIN_DATABASE_URL'}
REQUIRED_SECRETS['notification']|={'RESEND_API_KEY'}
ALLOWED_SECRET_KEYS={s:set(REQUIRED_SECRETS[s]) for s in PORTS}
for s,keys in {'auth':['GOOGLE_CLIENT_SECRET','RESEND_API_KEY'],'notification':['RESEND_API_KEY'],'document':['SUPABASE_SERVICE_ROLE_KEY'],'payment':['PADDLE_API_KEY','PADDLE_WEBHOOK_SECRET','PAYHERE_MERCHANT_SECRET'],'chat':['GROQ_API_KEY','ANTHROPIC_API_KEY'],'analytics':['POSTHOG_API_KEY'],'admin-api':['POSTHOG_API_KEY','POSTHOG_PERSONAL_API_KEY','RESEND_API_KEY','SUPER_ADMIN_PASSWORD','SUPER_ADMIN_EMAIL','SUPER_ADMIN_NAME']}.items():ALLOWED_SECRET_KEYS[s].update(keys)

def parse(path):
 values={}
 for line in path.read_text().splitlines():
  if not line.strip() or line.lstrip().startswith('#'):continue
  if '=' not in line:raise ValueError('Malformed configuration assignment')
  key,value=line.split('=',1)
  if not re.fullmatch(r'[A-Z][A-Z0-9_]*',key) or key in values:raise ValueError('Invalid or duplicate configuration key')
  if '\x00' in value or '\r' in value or '${' in value:raise ValueError('Unsupported configuration syntax')
  values[key]=value
 return values

def private(path):
 if path.is_symlink() or not path.is_file():raise ValueError('Missing private file: '+path.name)
 if stat.S_IMODE(path.stat().st_mode)&0o077:raise ValueError('Private configuration must be mode 0600: '+path.name)

def validate(values):
 if set(values)-DEPLOY_KEYS-OPTIONAL:raise ValueError('Unknown non-secret configuration keys: '+','.join(sorted(set(values)-DEPLOY_KEYS-OPTIONAL)))
 for key in ['APP_DOMAIN','ADMIN_DOMAIN','ADMIN_ALLOWED_CIDRS','ACME_EMAIL','CONFIG_VERSION','REGISTRY_PREFIX','POSTGRES_DB','LOCAL_AI_ENABLED','RESEND_FROM_EMAIL']:
  if not values.get(key) or '<' in values[key]:raise ValueError('Required configuration: '+key)
 for key in ['APP_DOMAIN','ADMIN_DOMAIN']:
  if not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+',values[key]):raise ValueError('Invalid public domain')
 if values['APP_DOMAIN']==values['ADMIN_DOMAIN']:raise ValueError('User and admin domains must differ')
 cidrs=values['ADMIN_ALLOWED_CIDRS'].split()
 if not cidrs:raise ValueError('Admin access requires explicit source networks')
 for cidr in cidrs:
  if ipaddress.ip_network(cidr,strict=False).prefixlen==0:raise ValueError('Admin access requires restricted source networks')
 if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',values['ACME_EMAIL']):raise ValueError('Invalid ACME email')
 if not re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',values['RESEND_FROM_EMAIL']):raise ValueError('A verified notification sender address is required')
 if not re.fullmatch(r'ghcr\.io/[a-z0-9][a-z0-9._-]*/doccraft',values['REGISTRY_PREFIX']):raise ValueError('Use the approved lowercase GHCR namespace')
 for key in ['CONFIG_VERSION','POSTGRES_DB']:
  if not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}',values[key]):raise ValueError('Invalid '+key)
 if values['LOCAL_AI_ENABLED'] not in ('true','false'):raise ValueError('LOCAL_AI_ENABLED must be true or false')
 for key in ('OLLAMA_MEMORY_MB','OLLAMA_CPUS'):
  if key in values and (not values[key].isdigit() or not 1<=int(values[key])<=262144):raise ValueError('Invalid '+key)
 for key in ('PADDLE_SANDBOX','PAYHERE_SANDBOX'):
  if key in values and values[key] not in ('true','false'):raise ValueError('Invalid payment environment flag')
 for key in ('GOOGLE_CALLBACK_URL','PAYMENT_SERVICE_PUBLIC_URL','SUPABASE_URL','POSTHOG_HOST'):
  if values.get(key):
   url=urlsplit(values[key])
   if url.scheme!='https' or not url.hostname or url.username or url.password or url.fragment:raise ValueError('Production integration URLs require HTTPS without credentials')
   if key in ('GOOGLE_CALLBACK_URL','PAYMENT_SERVICE_PUBLIC_URL') and url.hostname!=values['APP_DOMAIN']:raise ValueError('Public callbacks must use the authorized application hostname')
 # These fields are JSON arrays consumed by the existing admin settings loader.
 for key in ('ALLOWED_ADMIN_IPS','TRUSTED_PROXY_IPS'):
  if key in values and not isinstance(json.loads(values[key]),list):raise ValueError('Expected JSON array: '+key)
 return values

def generate(config,home,output,check_only=False):
 private(config);values=validate(parse(config));secrets_dir=home/'secrets';private_root=secrets_dir.stat()
 if stat.S_IMODE(private_root.st_mode)&0o077:raise ValueError('Secret directory must be mode 0700')
 defaults={k:'https://'+s+':'+str(PORTS[s]) for k,s in URLS.items()}
 defaults.update({'FRONTEND_URL':'https://'+values['APP_DOMAIN'],'CORS_ORIGINS':'https://'+values['APP_DOMAIN'],'ALLOWED_ORIGINS':json.dumps(['https://'+values['ADMIN_DOMAIN']]),'LOCAL_STORAGE_DIR':'/app/storage','SIDECAR_URL':'https://pdf:3023/generate','CHAT_SERVICE_MCP_URL':'https://chat:3016/internal/resources','AI_ALLOWED_LOCAL_ENDPOINTS':'http://ollama:11434','IP_WHITELIST_ENABLED':'true','ALLOWED_ADMIN_IPS':'["127.0.0.1","::1","10.0.0.0/8","172.16.0.0/12","192.168.0.0/16"]','TRUSTED_PROXY_IPS':'[]','SIDECAR_HOST':'0.0.0.0','SIDECAR_PORT':'3023','PDF_MAX_CONCURRENT':'1','PUPPETEER_EXECUTABLE_PATH':'/usr/bin/chromium','MAX_CONCURRENT_REQUESTS':'4','MAX_QUEUE_SIZE':'16','TURN_TIMEOUT_MS':'90000'})
 defaults.update({k:v for k,v in values.items() if k in OPTIONAL and v})
 defaults.setdefault('GOOGLE_CALLBACK_URL','https://'+values['APP_DOMAIN']+'/v1/auth/oauth/google/callback')
 defaults.setdefault('PAYMENT_SERVICE_PUBLIC_URL','https://'+values['APP_DOMAIN'])
 defaults['CORS_ORIGIN']='https://'+values['APP_DOMAIN']
 shared={'NODE_ENV':'production','ENV':'production','SERVICE_AUTH_CONFIG_FILE':'/run/secrets/service_identity','SERVICE_TLS_CERT_FILE':'/run/secrets/service.crt','SERVICE_TLS_KEY_FILE':'/run/secrets/service.key','SERVICE_REQUIRE_TLS':'true','NODE_EXTRA_CA_CERTS':'/run/secrets/ca.crt','SSL_CERT_FILE':'/run/secrets/ca.crt','PG_REQUIRE_TLS':'true','PGSSLROOTCERT':'/run/secrets/ca.crt','ADMIN_RUN_MIGRATIONS':'false','DOCUMENT_RUN_MIGRATIONS':'false','NOTIFICATION_RUN_MIGRATIONS':'false'}
 generated={}
 for service in PORTS:
  secret_path=secrets_dir/(service+'.env');private(secret_path);secret=parse(secret_path)
  if set(secret)-ALLOWED_SECRET_KEYS[service]:raise ValueError('Unexpected secret keys for '+service)
  if any(not secret.get(k) or '<' in secret[k] for k in REQUIRED_SECRETS[service]):raise ValueError('Required scoped credential missing for '+service)
  if service=='notification' and ('dummy' in secret['RESEND_API_KEY'].lower() or len(secret['RESEND_API_KEY'])<16):raise ValueError('An approved notification delivery credential is required')
  if not secret['REDIS_URL'].startswith('rediss://'):raise ValueError('Production Redis requires TLS')
  if service in DB_SERVICES and not secret['DATABASE_URL'].startswith('postgresql://'):raise ValueError('PostgreSQL required')
  for suffix in ['.identity.json','.crt','.key']:
   target=secrets_dir/(service+suffix)
   if target.is_symlink() or not target.is_file():raise ValueError('Missing scoped service identity/TLS file for '+service)
  identity=json.loads((secrets_dir/(service+'.identity.json')).read_text())
  if identity.get('identity')!=service:raise ValueError('Service identity mismatch')
  env={**shared,'PORT':str(PORTS[service]),**{k:defaults[k] for k in USES[service] if k in defaults},**secret}
  if service=='admin-api':env['AI_CREDENTIAL_KEYRING_FILE']='/run/secrets/ai_credential_keyring'
  if service=='chat' and values['LOCAL_AI_ENABLED']=='false':pass # Runtime policy remains admin-owned.
  generated[service]=env
 for filename in ['ca.crt','postgres-password','postgres.crt','postgres.key','redis.crt','redis.key','redis.acl','ai-credential-keyring.json','migration-node.env','migration-python.env','redis-health.env']:
  if not (secrets_dir/filename).is_file() or (secrets_dir/filename).is_symlink():raise ValueError('Missing deployment credential: '+filename)
 ring=json.loads((secrets_dir/'ai-credential-keyring.json').read_text())
 if ring.get('active_kid') not in ring.get('keys',{}):raise ValueError('Invalid AI credential keyring')
 if check_only:
  if output.exists():
   if json.loads((output/'configuration.json').read_text())!=values:raise ValueError('Configuration version was changed in place')
   for name,env in generated.items():
    private(output/(name+'.env'))
    if parse(output/(name+'.env'))!=env:raise ValueError('Runtime configuration version differs from current scoped inputs')
  return values
 if output.exists():raise ValueError('Generate into a fresh configuration version; never overwrite runtime files')
 output.mkdir(mode=0o700,parents=True)
 for name,env in generated.items():
  with open(output/(name+'.env'),'x',opener=lambda p,f:os.open(p,f,0o600)) as stream:
   # Compose env_file format raw is required; dollar signs remain literal.
   stream.write(''.join(k+'='+v+'\n' for k,v in sorted(env.items())))
 (output/'version').write_text(values['CONFIG_VERSION']+'\n')
 with open(output/'configuration.json','x',opener=lambda p,f:os.open(p,f,0o600)) as stream:json.dump(values,stream,sort_keys=True)
 return values

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--config',type=Path,required=True);parser.add_argument('--home',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--check-only',action='store_true');a=parser.parse_args()
 try:generate(a.config,a.home,a.output,a.check_only)
 except (ValueError,OSError,KeyError,json.JSONDecodeError):print('Configuration validation failed; check required names, file permissions and scoped credentials. Values are never printed.',file=sys.stderr);return 1
 print('Configuration validated'+('' if a.check_only else '; private service runtime files generated'));return 0
if __name__=='__main__':sys.exit(main())
