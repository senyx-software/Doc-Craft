"""Start an isolated real PostgreSQL/Redis/microservice stack for live AI checks.

Only fresh task-owned data and synthetic non-AI transport configuration are used.
No developer .env values or production accounts are copied. Secrets stay in .local.
Ollama is provisioned separately. Ctrl-C tears down this stack, retaining evidence.
"""
import base64,json,os,secrets,signal,socket,subprocess,sys,time,uuid,shutil
from pathlib import Path
from urllib.parse import quote,urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
import httpx,psycopg2
from scripts.create_service_credentials import generate
from scripts.create_redis_credentials import generate as redis_credentials
from scripts.staging_database_roles import provision
RESUME='--resume' in sys.argv
WORK=ROOT/'.local/hybrid-live/stack';WORK.mkdir(mode=0o700,parents=True,exist_ok=RESUME)
OUT=ROOT/'docs/hybrid-ai/evidence/live';OUT.mkdir(parents=True,exist_ok=True)
PYTHON=ROOT/'.venv-local/bin/python';PG=ROOT/'.local/hybrid-live/tools/pg/native'; processes=[];streams=[];stopping=False

def free_port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def write_private(path,value):
 path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
 with open(path,'x',opener=lambda p,f:os.open(p,f,0o600)) as h:h.write(value)
def launch(name,args,env,cwd=ROOT):
 stream=(WORK/(name+'.log')).open('a');streams.append(stream)
 p=subprocess.Popen(list(map(str,args)),cwd=cwd,env=env,stdout=stream,stderr=subprocess.STDOUT,start_new_session=True)
 processes.append((name,p));print('START '+name,flush=True);return p

def wait_url(name,url):
 for _ in range(240):
  p=next(p for n,p in reversed(processes) if n==name)
  if p.poll() is not None:raise RuntimeError(name+' exited; inspect its private task log')
  try:
   if httpx.get(url,timeout=2).status_code==200:return
  except httpx.HTTPError:pass
  time.sleep(.25)
 raise RuntimeError(name+' health timed out')

def main():
 ports={name:free_port() for name in ['postgres','redis','auth','quota','chat','payment','notification','pdf','admin-api','analytics','document','gateway','admin-ui','user-ui']}
 urls={name:'http://127.0.0.1:'+str(port) for name,port in ports.items()}
 identities=generate();pg_password=secrets.token_urlsafe(32)
 pg_url='postgresql://postgres:'+quote(pg_password,safe='')+'@127.0.0.1:'+str(ports['postgres'])+'/postgres'
 # Start from an allowlisted environment; service dotenv files cannot override these keys.
 env={key:value for key,value in os.environ.items() if key in ['PATH','LANG','LC_ALL','TMPDIR','TZ','DISPLAY','XDG_RUNTIME_DIR']}
 env.update({'HOME':os.environ['HOME'],'NODE_ENV':'test','ENV':'test','PG_REQUIRE_TLS':'false','PYTHONPATH':str(ROOT),
  'DATABASE_URL':pg_url,'DIRECT_URL':pg_url,'ADMIN_DATABASE_URL':pg_url,
  'REDIS_URL':urls['redis'].replace('http:','redis:'),'REDIS_HOST':'127.0.0.1','REDIS_PORT':str(ports['redis']),
  'JWT_SECRET':secrets.token_urlsafe(48),'JWT_REFRESH_SECRET':secrets.token_urlsafe(48),'ADMIN_JWT_SECRET':secrets.token_urlsafe(48),
  'PADDLE_API_KEY':'','PADDLE_WEBHOOK_SECRET':'','PAYHERE_MERCHANT_ID':'','PAYHERE_MERCHANT_SECRET':'','PADDLE_SANDBOX':'true','PAYHERE_SANDBOX':'true',
  'SUPABASE_URL':'','SUPABASE_SERVICE_ROLE_KEY':'','GROQ_API_KEY':'','ANTHROPIC_API_KEY':'','RESEND_API_KEY':'','POSTHOG_API_KEY':'','POSTHOG_PERSONAL_API_KEY':'','POSTHOG_HOST':'http://127.0.0.1:9','POSTHOG_PROJECT_ID':'',
  'AUTH_SERVICE_URL':urls['auth'],'AI_SERVICE_URL':urls['chat'],'CHAT_SERVICE_URL':urls['chat'],'PAYMENT_SERVICE_URL':urls['payment'],'BILLING_SERVICE_URL':urls['payment'],'NOTIFICATION_SERVICE_URL':urls['notification'],'DOCUMENT_SERVICE_URL':urls['document'],'QUOTA_SERVICE_URL':urls['quota'],'ADMIN_API_SERVICE_URL':urls['admin-api'],'ADMIN_API_URL':urls['admin-api'],'ANALYTICS_SERVICE_URL':urls['analytics'],
  'GATEWAY_URL':urls['gateway'],'CHAT_SERVICE_MCP_URL':urls['chat']+'/internal/resources','SIDECAR_URL':urls['pdf']+'/generate','SIDECAR_PORT':str(ports['pdf']),'SIDECAR_HOST':'127.0.0.1',
  'LOCAL_STORAGE_DIR':str(WORK/'storage'),'SUPER_ADMIN_EMAIL':'live-admin@example.com','SUPER_ADMIN_PASSWORD':secrets.token_urlsafe(32)+'Aa1!',
  'IP_WHITELIST_ENABLED':'false','TRUSTED_PROXY_IPS':'[]','ALLOWED_ORIGINS':json.dumps([urls['admin-ui'],urls['user-ui']]),'CORS_ORIGINS':urls['admin-ui']+','+urls['user-ui'],'FRONTEND_URL':urls['user-ui'],
  'RATE_LIMIT_MAX':'1000','API_RATE_LIMIT_MAX':'10000','MAX_CONCURRENT_REQUESTS':'8','MAX_QUEUE_SIZE':'32','TURN_TIMEOUT_MS':'180000','MCP_TIMEOUT_MS':'15000',
  'ADMIN_RUN_MIGRATIONS':'false','DOCUMENT_RUN_MIGRATIONS':'false','NOTIFICATION_RUN_MIGRATIONS':'false',
  'AI_ALLOWED_LOCAL_ENDPOINTS':'http://127.0.0.1:11434','AI_CREDENTIAL_KEYRING':json.dumps({'active_kid':'live-dev','keys':{'live-dev':base64.urlsafe_b64encode(os.urandom(32)).decode()}})})
 pg_env={**env,'LD_LIBRARY_PATH':str(PG/'lib')};write_private(WORK/'pg-password',pg_password)
 subprocess.run([PG/'bin/initdb','-D',WORK/'pgdata','-U','postgres','--auth-local=trust','--auth-host=scram-sha-256','--pwfile='+str(WORK/'pg-password'),'--no-locale','--encoding=UTF8'],env=pg_env,stdout=(WORK/'initdb.log').open('w'),stderr=subprocess.STDOUT,check=True)
 launch('postgres',[PG/'bin/postgres','-D',WORK/'pgdata','-p',ports['postgres'],'-h','127.0.0.1','-k',WORK,'-c','shared_buffers=64MB','-c','max_connections=120'],pg_env)
 for _ in range(80):
  try:
   connection=psycopg2.connect(pg_url);connection.close();break
  except psycopg2.OperationalError:time.sleep(.25)
 else:raise RuntimeError('PostgreSQL startup failed')
 database='doccraft_staging_hybrid_'+uuid.uuid4().hex[:10]
 connection=psycopg2.connect(pg_url);connection.autocommit=True
 with connection.cursor() as cursor:cursor.execute('CREATE DATABASE "'+database+'"')
 connection.close();db_url=pg_url.rsplit('/',1)[0]+'/'+database
 env.update(DATABASE_URL=db_url,DIRECT_URL=db_url,ADMIN_DATABASE_URL=db_url)
 for service in ['auth','chat','payment','quota']:
  subprocess.run([ROOT/'node_modules/.bin/prisma','migrate','deploy','--schema',ROOT/f'services/{service}/prisma/schema.prisma'],env=env,cwd=ROOT,stdout=(WORK/(service+'-migrate.log')).open('w'),stderr=subprocess.STDOUT,check=True)
  target=ROOT/f'services/{service}/dist/generated';shutil.copytree(ROOT/f'services/{service}/src/generated',target,dirs_exist_ok=True)
 owner_env={**env,'ADMIN_RUN_MIGRATIONS':'true','DOCUMENT_RUN_MIGRATIONS':'true','SERVICE_AUTH_CONFIG_JSON':json.dumps(identities['admin-api'])}
 subprocess.run([PYTHON,ROOT/'scripts/staging_migrate_python.py'],env=owner_env,cwd=ROOT,stdout=(WORK/'python-migrate.log').open('w'),stderr=subprocess.STDOUT,check=True)
 subprocess.run(['node','--input-type=module','-e',"const {getDbPool,initDb}=await import('./services/notification/dist/services/db.service.js');const pool=getDbPool();await initDb(pool);await pool.end();"],env={**env,'SERVICE_AUTH_CONFIG_JSON':json.dumps(identities['notification'])},cwd=ROOT,stdout=(WORK/'notification-migrate.log').open('w'),stderr=subprocess.STDOUT,check=True)
 with psycopg2.connect(db_url) as connection:roles=provision(connection,'dc_live_'+secrets.token_hex(3))
 redis_envs=redis_credentials(WORK/'redis','127.0.0.1',ports['redis']);redis_urls={key:value.splitlines()[0].split('=',1)[1] for key,value in redis_envs.items()}
 launch('redis',[ROOT/'services/redis-bin/src/redis-server','--bind','127.0.0.1','--port',ports['redis'],'--save','','--appendonly','no','--aclfile',WORK/'redis/redis.acl','--dir',WORK],env)
 runtime_envs={}
 for service in ['auth','quota','chat','payment','notification','pdf','admin-api','analytics','document','gateway']:
  identity=service;record=roles.get(service);runtime_db=db_url
  if record:runtime_db='postgresql://'+quote(record['role'],safe='')+':'+quote(record['password'],safe='')+'@127.0.0.1:'+str(ports['postgres'])+'/'+database
  child={**env,'PORT':str(ports[service]),'SERVICE_AUTH_CONFIG_JSON':json.dumps(identities[identity]),'REDIS_URL':redis_urls[identity],'DATABASE_URL':runtime_db,'DIRECT_URL':runtime_db,'ADMIN_DATABASE_URL':runtime_db}
  runtime_envs[service]=child
  if service in ['admin-api','analytics','document']:
   args=[PYTHON,'-m','uvicorn','app.main:app','--host','127.0.0.1','--port',ports[service]];directory=ROOT/'services'/service
  elif service=='pdf':args=['node',ROOT/'services/document/dist/puppeteer/server.js'];directory=ROOT/'services/document'
  else:args=['node',ROOT/f'services/{service}/dist'/('index.js' if service=='gateway' else 'server.js')];directory=ROOT/'services'/service
  launch(service,args,child,directory)
 for service in ['auth','quota','chat','payment','notification','pdf','admin-api','analytics','document','gateway']:wait_url(service,urls[service]+'/health')
 ctx={'urls':urls,'ports':ports,'database_url':db_url,'identities':identities,'envs':runtime_envs,'admin_email':env['SUPER_ADMIN_EMAIL'],'admin_password':env['SUPER_ADMIN_PASSWORD'],'work':str(WORK),'database':database,'processes':{n:p.pid for n,p in processes}}
 write_private(WORK/'context.json',json.dumps(ctx))
 # Build and serve the actual static frontends against this isolated stack.
 for service,folder in [('admin-ui','admin'),('user-ui','user-frontend')]:
  child={**env,'VITE_ADMIN_API_BASE_URL':urls['admin-api']+'/api/v1','VITE_API_BASE_URL':urls['gateway']+'/v1','VITE_FIREBASE_API_KEY':''}
  subprocess.run(['npm','run','build'],cwd=ROOT/folder,env=child,stdout=(WORK/(service+'-build.log')).open('w'),stderr=subprocess.STDOUT,check=True)
  launch(service,['node',ROOT/f'{folder}/node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',ports[service],'--strictPort'],child,ROOT/folder)
 ctx['processes']={n:p.pid for n,p in processes};(WORK/'context.json').write_text(json.dumps(ctx));os.chmod(WORK/'context.json',0o600)
 (OUT/'stack-startup.json').write_text(json.dumps({'status':'running','database':database,'services':list(ctx['processes']),'database_engine':'PostgreSQL 18.4','database_runtime_roles':'per service DML/read scopes','network':'loopback, signed service identity, Redis ACLs; development HTTP without TLS'},indent=2)+'\n')
 print('READY isolated live stack; private context at .local/hybrid-live/stack/context.json',flush=True)
 while not stopping:
  if any(p.poll() is not None for n,p in processes):raise RuntimeError('A stack process exited; inspect private logs')
  time.sleep(1)

def resume():
 """Restart only this task-owned stack, preserving durable DB and key material."""
 ctx=json.loads((WORK/'context.json').read_text());ports=ctx['ports'];urls=ctx['urls']
 env=ctx['envs']['admin-api'];pg_env={**env,'LD_LIBRARY_PATH':str(PG/'lib')}
 launch('postgres',[PG/'bin/postgres','-D',WORK/'pgdata','-p',ports['postgres'],'-h','127.0.0.1','-k',WORK,'-c','shared_buffers=64MB','-c','max_connections=120'],pg_env)
 launch('redis',[ROOT/'services/redis-bin/src/redis-server','--bind','127.0.0.1','--port',ports['redis'],'--save','','--appendonly','no','--aclfile',WORK/'redis/redis.acl','--dir',WORK],env)
 time.sleep(2)
 for service in ['auth','quota','chat','payment','notification','pdf','admin-api','analytics','document','gateway']:
  child=ctx['envs'][service]
  if service in ['admin-api','analytics','document']:args=[PYTHON,'-m','uvicorn','app.main:app','--host','127.0.0.1','--port',ports[service]];directory=ROOT/'services'/service
  elif service=='pdf':args=['node',ROOT/'services/document/dist/puppeteer/server.js'];directory=ROOT/'services/document'
  else:args=['node',ROOT/f'services/{service}/dist'/('index.js' if service=='gateway' else 'server.js')];directory=ROOT/'services'/service
  launch(service,args,child,directory)
 for service in ['auth','quota','chat','payment','notification','pdf','admin-api','analytics','document','gateway']:wait_url(service,urls[service]+'/health')
 for service,folder in [('admin-ui','admin'),('user-ui','user-frontend')]:launch(service,['node',ROOT/f'{folder}/node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port',ports[service],'--strictPort'],env,ROOT/folder)
 ctx['processes']={n:p.pid for n,p in processes};(WORK/'context.json').write_text(json.dumps(ctx));os.chmod(WORK/'context.json',0o600)
 print('READY resumed isolated stack with durable PostgreSQL and unchanged credentials',flush=True)
 while not stopping:
  if any(p.poll() is not None for n,p in processes):raise RuntimeError('A resumed stack process exited; inspect private logs')
  time.sleep(1)

if __name__=='__main__':
 def stop(*args):
  global stopping;stopping=True
 signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
 try:resume() if RESUME else main()
 finally:
  for name,p in reversed(processes):
   if p.poll() is None:
    try:os.killpg(p.pid,signal.SIGTERM)
    except ProcessLookupError:pass
  for name,p in reversed(processes):
   try:p.wait(timeout=12)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL)
  for stream in streams:stream.close()
