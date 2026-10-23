import ast,hashlib,json,re,collections,sys
from pathlib import Path
root=Path('.');out=Path('docs/production-audit/evidence');api=json.loads((out/'api-inventory.json').read_text());front=json.loads((out/'frontend-api-map.json').read_text())
def normalize(p):
 p=p.replace('{API_BASE_URL}','').replace('{base}','')
 p=re.sub(r'\{(?:query|status|limit|q|qs|days)\s*\?.*$', '',p)
 if '/{query' in p:p=p.split('/{query')[0]+'/'
 for _ in range(4):p=re.sub(r'\{[^{}]*\}','PARAM',p)
 p=p.split('?')[0].rstrip('/') or '/';p=re.sub(r':[a-zA-Z_]\w*','PARAM',p)
 return p
def target(p):
 if p.startswith('/v1/'):p=p[3:]
 if p.startswith('/chat/api'):return 'chat',p.replace('/chat/api','/api',1)
 if p.startswith('/chat/session'):return 'chat','/api/chat'+p[len('/chat'):]
 for prefix,replacement,service in [('documents','document','document'),('templates','document/templates','document'),('document','document','document'),('users','auth','auth'),('auth','auth','auth'),('billing','payment','payment'),('payment','payment','payment'),('quota','quota','quota'),('notifications','notification','notification'),('notification','notification','notification'),('analytics','analytics','analytics'),('support','support','admin-api')]:
  if p=='/'+prefix or p.startswith('/'+prefix+'/'):
   suffix=p[len(prefix)+1:];return service,('/api/v1/support'+suffix if service=='admin-api' else '/notification'+suffix if service=='notification' else '/v1/'+replacement+suffix)
 return None,p
for call in front['requests']:
 raw=call['path'];p=normalize(raw);service,path=('admin-api','/api/v1'+p) if call['app']=='admin' and p.startswith('/') else target(p)
 if raw.startswith('{url}') or not p.startswith('/') or p in ['/PARAM'] or '{endpoint}' in raw:matches=[];status='dynamic_transport_wrapper'
 else:
  variants=[path]
  if 'resource' in raw:variants=[path.replace('PARAM',x,1) for x in ['providers','models']]
  matches=[e for e in api['endpoints'] if e['service']==service and e['method']==call['method'] and normalize(e['route']) in variants];status='source_route_match' if matches else 'unresolved_or_missing'
 call.update(resolved_service=service,resolved_backend_path=path,route_mapping_status=status,backend_candidates=[{'method':m['method'],'route':m['route'],'handler':m['handler'],'source':m['source'],'line':m['line'],'authentication':m['authentication'],'authorization':m['authorization'],'database':m['database'],'external_dependencies':m['external_dependencies']} for m in matches],runtime_business_status='NOT_VERIFIED_BY_STATIC_MATCH')
(out/'frontend-api-map.json').write_text(json.dumps(front,indent=2)+'\n')
interactions=json.loads((out/'frontend-interactions.json').read_text())['interactions'];features=[]
for file in sorted({e['file'] for e in interactions}):
 rows=[r for r in interactions if r['file']==file];calls=[c for c in front['requests'] if c['file']==file or any(x['file']==file for x in c.get('consumers',[]))]
 events=collections.Counter(r['event'] for r in rows);features.append({'id':'FEATURE-'+str(len(features)+1).zfill(3),'app':'admin' if file.startswith('admin/') else 'user','component':file,'interaction_count':len(rows),'event_types':dict(events),'api_calls':[c['id'] for c in calls],'classification':'API-linked component' if calls else 'frontend-only or indirect store/hook integration; manual trace required','functional_status':'UNTESTED; render probes alone do not verify all actions','required_test_variants':['happy path','invalid input','ownership/permission denial','persistence/reload','network/provider failure'],'evidence':[file+':'+str(rows[0]['line'])]})
(out/'feature-inventory.json').write_text(json.dumps({'scope':'All source files with extracted supported interaction attributes; not one independent feature per event; indirect bindings explicitly unresolved','components':features},indent=2)+'\n')
nav=Path('admin/src/config/adminNavSections.tsx').read_text();navitems=[{'id':m.group(2),'label':m.group(1),'line':nav[:m.start()].count('\n')+1} for m in re.finditer(r"\{\s*label:\s*['\"]([^'\"]+)['\"],\s*id:\s*['\"]([^'\"]+)['\"]",nav)]
(out/'admin-navigation.json').write_text(json.dumps(navitems,indent=2)+'\n')
patterns={'local_development_address':re.compile(r'localhost|127\.0\.0\.1'),'external_url':re.compile(r'https?://'),'model_identifier':re.compile(r'claude-(?:haiku|sonnet)|qwen3|llama-3|mixtral|gpt-[0-9]'),'fixed_money':re.compile(r'990\.00|2026-08-15|priceMonthly:\s*\d|price_usd_monthly.{0,4}\d'),'demo_mock':re.compile(r'demo_token_for_testing|\bmock\b|\bTODO\b|\bFIXME\b'),'secret_variable':re.compile(r'(?:API_KEY|JWT_SECRET|PASSWORD|CLIENT_SECRET|WEBHOOK_SECRET)\s*[:=]'),'cors_wildcard':re.compile(r'allow_origins=\["\*"\]|origin:\s*["\x27]\*["\x27]')}
hard=[];edges=[];schema=[];review=[]
for top in ['services','shared','admin/src','user-frontend/src','deploy','terraform','.github']:
 for p in Path(top).rglob('*'):
  if not p.is_file() or any(k in p.parts for k in ['node_modules','dist','generated','__pycache__','redis-bin','.terraform','.venv']):continue
  if p.suffix not in ['.py','.ts','.tsx','.mjs','.json','.yml','.tf','.prisma','.sql','.sh','.txt'] and p.name not in ['Caddyfile','Dockerfile']:continue
  if p.name.endswith('.env'):continue
  text=p.read_text(errors='replace');test='test' in p.parts or 'tests' in p.parts or '__tests__' in p.parts or '.test.' in p.name;review.append({'file':str(p),'sha256':hashlib.sha256(text.encode()).hexdigest(),'method':'pattern and declaration inventory; does not imply manual semantic review'})
  for i,line in enumerate(text.splitlines(),1):
   for kind,regex in patterns.items():
    if regex.search(line):
     classification='Mock/test-only data' if test else 'Production defect' if str(p).endswith('DashboardBillingPage.tsx') and kind=='fixed_money' else 'Environment-dependent configuration' if 'getenv' in line or 'process.env' in line or 'import.meta.env' in line else 'Intentional constant' if kind in ['local_development_address','external_url'] and 'swagger' in str(p) else 'Configurable application setting' if kind=='model_identifier' else 'Potential secret; scanner/manual triage required' if kind=='secret_variable' else 'Requires manual triage'
     hard.append({'file':str(p),'line':i,'kind':kind,'classification':classification,'value':'REDACTED / not copied','runtime_verified':False})
   if re.search(r'serviceFetch\(|service_request\(|async_service_client\(|service_client\(|AUTH_SERVICE_URL|QUOTA_SERVICE_URL|AI_SERVICE_URL|ADMIN_API_SERVICE_URL|SIDECAR_URL',line) and not test:edges.append({'source':str(p),'line':i,'symbols':sorted(set(re.findall(r'[A-Z][A-Z0-9_]*(?:URL|HOST)',line))),'transport':'signed helper' if re.search(r'serviceFetch|service_request|service_client',line) else 'URL reference; follow named callsite','verification':'source reference only; not independent runtime edge'})
  if p.suffix=='.prisma':schema.append({'source':str(p),'models':re.findall(r'^model\s+(\w+)',text,re.M),'index_declarations':len(re.findall(r'@@index',text)),'unique_declarations':len(re.findall(r'@unique|@@unique',text)),'relations':re.findall(r'@relation\([^\n]+',text)})
(out/'hardcoded-inventory.json').write_text(json.dumps(hard,indent=2)+'\n');(out/'service-edges.json').write_text(json.dumps(edges,indent=2)+'\n');(out/'database-inventory.json').write_text(json.dumps(schema,indent=2)+'\n');(out/'pattern-reviewed-files.json').write_text(json.dumps(review,indent=2)+'\n')
print('Frontend mapping',collections.Counter(c['route_mapping_status'] for c in front['requests']),'components',len(features),'admin nav',len(navitems),'hardcoded candidates',len(hard),'service references',len(edges))
