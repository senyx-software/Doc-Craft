"""Private integrated release readiness; no auth bypasses, no model inference."""
import json,os,socket,ssl,sys,time
from pathlib import Path
sys.path.insert(0,'/app')
import httpx
from shared.service_auth import service_request

def check():
 failures=[]
 # Verified internal TLS. /ready checks actual PostgreSQL/Redis dependencies.
 with httpx.Client(verify='/run/secrets/ca.crt',timeout=8) as client:
  for name,port in [('gateway',3001),('auth',3011),('notification',3012),('document',3013),('payment',3014),('quota',3015),('chat',3016),('analytics',3017),('admin-api',3018)]:
   try:
    response=client.get(f'https://{name}:{port}/ready')
    if response.status_code!=200:failures.append(name+':readiness')
   except Exception:failures.append(name+':connection')
  for name in ['user-ui','admin-ui']:
   try:
    response=client.get('http://'+name+':8080/')
    if response.status_code!=200 or '<html' not in response.text.lower():failures.append(name+':html')
   except Exception:failures.append(name+':connection')
  # User JWTs and missing auth must not reveal model configuration.
  try:
   if client.get('https://admin-api:3018/api/v1/admin/ai').status_code!=401:failures.append('admin:authorization')
  except Exception:failures.append('admin:connection')
 try:
  # Existing admin-api identity may inspect chat metrics, proving signed calls.
  r=service_request('chat','GET','https://chat:3016/internal/ai/outcomes',timeout=8)
  if r.status_code!=200:failures.append('service:authentication')
 except Exception:failures.append('service:authentication')
 try:
  # Admin cannot impersonate document. Use the narrowly mounted document
  # signer ONLY in this controller verification job, never in admin runtime.
  original=os.environ['SERVICE_AUTH_CONFIG_FILE']
  try:
   os.environ['SERVICE_AUTH_CONFIG_FILE']='/run/secrets/document_probe_identity'
   response=service_request('pdf','POST','https://pdf:3023/generate',json={'htmlString':'<!doctype html><html><body><h1>DocCraft deployment check</h1><p>Synthetic invoice preview</p></body></html>'},timeout=25)
  finally:os.environ['SERVICE_AUTH_CONFIG_FILE']=original
  if response.status_code!=200 or not response.content.startswith(b'%PDF'):failures.append('pdf:render')
 except Exception:failures.append('pdf:render')
 try:
  from app.services.ai_management import read_config,is_healthy
  from app.services.ai_security import endpoint_target
  version,config=read_config()
  if os.getenv('DOCCRAFT_REQUIRE_AI_DISABLED')=='true' and config.enabled:
   failures.append('ai:staging-routing-must-remain-disabled')
  if config.enabled:
   providers={p.id:p for p in config.providers};models={m.id:m for m in config.models};probed=set()
   for plan in config.plans.values():
    model=models.get(plan.primary_model);provider=providers.get(model.provider_id) if model else None
    if not model or not provider or not model.enabled or not provider.enabled:failures.append('ai:assignment');continue
    if plan.require_healthy and not is_healthy(provider,model,plan.health_max_age_seconds):failures.append('ai:health');continue
    if provider.id not in probed:
     try:
      url,port,address=endpoint_target(provider)
      with socket.create_connection((address,port),timeout=4) as connection:
       if url.scheme=='https':
        with ssl.create_default_context().wrap_socket(connection,server_hostname=url.hostname):pass
      probed.add(provider.id)
     except Exception:failures.append('ai:endpoint')
   # No paid or local inference is dispatched merely to health-check a release.
  else:print('AI routing is disabled by administrator; no inference health claim')
 except Exception:failures.append('ai:configuration')
 return failures

for attempt in range(1,7):
 failures=check()
 if not failures:print(json.dumps({'readiness':'passed','checks':'TLS, PostgreSQL/Redis, signed services, frontend HTML, RBAC, PDF render, AI config'}));sys.exit(0)
 print(json.dumps({'attempt':attempt,'failed_checks':failures}))
 if attempt<6:time.sleep(5)
sys.exit(1)
