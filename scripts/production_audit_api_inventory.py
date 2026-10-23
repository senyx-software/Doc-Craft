"""Static audit inventory. Never imports application modules or contacts services."""
import ast
import hashlib
import json
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/production-audit/evidence'
METHODS = {'get','post','put','patch','delete','options','head','websocket','api_route'}
reviewed = set()
python_routes = []

def expr(node):
    return ast.unparse(node) if node else ''

def val(node, constants):
    if isinstance(node,ast.Constant): return node.value
    if isinstance(node,ast.Name): return constants.get(node.id)
    if isinstance(node,ast.BinOp) and isinstance(node.op,ast.Add):
        left,right=val(node.left,constants),val(node.right,constants)
        if isinstance(left,str) and isinstance(right,str): return left+right
    return None

mounts={}
router_file=ROOT/'services/admin-api/app/api/v1/router.py'
tree=ast.parse(router_file.read_text())
aliases={}
for node in tree.body:
    if isinstance(node,ast.ImportFrom) and node.module and node.module.startswith('app.api.v1'):
        for alias in node.names:
            module=node.module if node.module!='app.api.v1' else node.module+'.'+alias.name
            aliases[alias.asname or alias.name]='services/admin-api/'+module.replace('.','/')+'.py'
    if isinstance(node,ast.Expr) and isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Attribute) and node.value.func.attr=='include_router':
        first=node.value.args[0]; key=first.id if isinstance(first,ast.Name) else first.value.id
        prefix=next((val(k.value,{}) for k in node.value.keywords if k.arg=='prefix'),'')
        mounts[aliases[key]]=prefix
mounts.update({'services/document/app/routers/document.py':'/v1/document','services/analytics/app/routers/analytics.py':'/v1/analytics',
               'services/document/app/main.py':'','services/analytics/app/main.py':'','services/admin-api/app/main.py':''})
reviewed.add(str(router_file.relative_to(ROOT)))
for file in sorted((ROOT/'services').glob('*/app/**/*.py')):
    relative=str(file.relative_to(ROOT)); text=file.read_text();tree=ast.parse(text);constants={};router_prefix='';found=False
    for node in tree.body:
        if isinstance(node,ast.Assign):
            for target in node.targets:
                if isinstance(target,ast.Name):
                    constants[target.id]=val(node.value,constants)
                    if isinstance(node.value,ast.Call) and isinstance(node.value.func,ast.Name) and node.value.func.id=='APIRouter':
                        router_prefix=next((val(k.value,constants) for k in node.value.keywords if k.arg=='prefix'),'')
        if not isinstance(node,(ast.FunctionDef,ast.AsyncFunctionDef)):continue
        for deco in node.decorator_list:
            if not isinstance(deco,ast.Call) or not isinstance(deco.func,ast.Attribute) or deco.func.attr not in METHODS:continue
            route=val(deco.args[0],constants) if deco.args else None
            if not isinstance(route,str):raise RuntimeError(f'Unresolved route {relative}:{deco.lineno}')
            found=True; owner=relative.split('/')[1]; registered=relative in mounts
            signature=ast.FunctionDef(name=node.name,args=node.args,body=[ast.Pass()],decorator_list=[],returns=node.returns,type_comment=None)
            signature=ast.fix_missing_locations(signature)
            body=ast.get_source_segment(text,node) or ''
            deps=[expr(call.args[0]) for call in ast.walk(node) if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id=='Depends' and call.args]
            deps += [expr(call.args[0]) for call in ast.walk(deco) if isinstance(call,ast.Call) and isinstance(call.func,ast.Name) and call.func.id=='Depends' and call.args]
            python_routes.append({'service':owner,'method':deco.func.attr.upper(),'route':mounts.get(relative,'<UNMOUNTED>')+router_prefix+route,
                'handler':node.name,'handler_source':relative,'handler_line':node.lineno,'source':relative,'line':deco.lineno,
                'declared_route':route,'mount':mounts.get(relative),'registered':registered,'dependencies_declared':list(dict.fromkeys(deps)),
                'declaration':expr(deco),'signature':ast.unparse(signature).split(':\n')[0], 'source_text':body})
    if found:reviewed.add(relative)

tsdata=json.loads((OUT/'api-ts-extract.json').read_text()); reviewed.update(tsdata['reviewed_files'])
records=tsdata['records']+python_routes

# Dependency references preserve names exactly, rather than asserting a transitive
# database trace from a grep hit. Full source and handler locations remain linked.
def metadata(r):
    s=r['service'];body=r['source_text'];route=r['route'];args=' '.join(r.get('registration_args',[]));deps=' '.join(r.get('dependencies_declared',[]));combined=body+' '+deps+' '+r.get('handler_text','')
    r['registered']=r.get('registered',True);r['surface']='wildcard-proxy' if r['method']=='ALL' else 'explicit'
    r['consumer']='admin browser or internal control plane' if s=='admin-api' else 'service-to-service' if '/internal/' in route else 'user browser via gateway'
    r['status']='untested';r['verification']='static declaration and mount resolution only';r['risk']='Medium'
    r['validation']={'declared':r.get('declaration') or args or 'handler-level validation; no route schema declared', 'request_response_verified':False}
    refs=re.findall(r'\b(?:db|prisma|clientDb)\.([A-Za-z_]\w*)|\b([A-Za-z_]\w*_repository)\b',combined)
    tables=re.findall(r'\b(?:FROM|JOIN|INTO|UPDATE)\s+["\x27]?([A-Za-z_]\w*)',combined,re.IGNORECASE)
    r['database']={'references':sorted(set(next(v for v in row if v) for row in refs)|set(tables)), 'trace_status':'direct registered handler/reference hints only; transitive schema impact not runtime verified'}
    r['handler_calls']=sorted(set(re.findall(r'\b([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)+)\s*\(',combined)))
    r['external_dependencies']={'references':sorted(set(re.findall(r'\b[A-Z][A-Z0-9_]*(?:URL|KEY|SECRET|HOST)\b|\b\w+(?:Service|_service|_client)\b',combined))), 'trace_status':'source identifiers; transitive behavior not runtime verified'}
    if s=='gateway':
        r['authentication']='gateway PUBLIC_ROUTES allowlist or verified access JWT; caller identity headers stripped; OPTIONS exempt'
        r['authorization']='proxy preserves downstream ownership/permission checks; no arbitrary destination URL';r['consumer']='public user/admin aliases'
    elif s=='auth':
        if route.startswith('/internal/'):
            r['authentication']='signed service identity (authorizeService auth), Redis nonce replay control';r['authorization']='shared receiver/caller route policy'
        elif 'requireAuth' in args:r['authentication']='requireAuth access JWT + live session/account';r['authorization']='authenticated subject, own account'
        else:r['authentication']='public authentication flow; token/code/password proof as applicable';r['authorization']='controller-specific challenge verification'
    elif s=='chat':
        r['authentication']='global requireAuth when URL contains /chat or /mcp; access JWT + live auth validation'
        r['authorization']='conversation userId ownership in controller/repository; tool argument validation'
        if 'authorizeService' in body:r['authentication']+='; signed chat service identity';r['authorization']='signed caller policy and handler resource restrictions'
    elif s in ('payment','quota'):
        if 'requireInternalSecret' in args or '/admin/' in route or 'authenticateInternal' in args:
            r['authentication']='signed service identity, per-receiver route policy and replay nonce';r['authorization']='shared caller/path rules; caller-namespaced reservations for quota check/refund'
        elif 'authenticateUser' in args:r['authentication']='access JWT plus live auth account/session/plan validation';r['authorization']='authenticated subject supplied to business service'
        elif '/webhook/' in route:r['authentication']='gateway IP policy and provider-specific cryptographic webhook verification';r['authorization']='provider event reconciliation'
        else:r['authentication']='public';r['authorization']='guest quota session proof when guest routes; otherwise public plan/health information'
    elif s=='notification':
        r['authentication']='authorizeNotification global hook; JWT with live auth, signed identity for send/admin logs, signature for Resend webhook'
        r['authorization']='authenticated user overwrites caller target userId; send notification type restricted per service caller'
    elif s=='document':
        r['authentication']='global authenticate_document_request: JWT plus live account/session check; signed /internal; public health/docs/signed share downloads'
        r['authorization']='owner-scoped document/custom-template queries; public links verify token/signature/expiry'
    elif s=='analytics':
        r['authentication']='signed analytics identity' if 'require_internal_secret' in combined else 'current_user Depends access bearer live auth' if 'current_user' in combined else 'public'
        r['authorization']='per-caller path policy' if 'require_internal_secret' in combined else 'handler-level user identity/event-field filtering'
    elif s=='admin-api':
        r['authentication']='signed admin-api service identity' if 'require_internal_secret' in deps or 'authorize_service(' in body else 'live admin access token/session/account and role re-read' if any(x in deps for x in ('get_current_admin','require_totp_2fa','require_permission')) else 'public challenge/recovery flow' if '/auth/' in route else 'handler gate; inspect dependency/source'
        perms=sorted(set(re.findall(r'(?:enforce|require_permission|has_permission|require_admin_permission|_view|_edit)\([^\n]*',body)))
        r['authorization']={'dependencies':r.get('dependencies_declared',[]),'permission_expressions':perms,'sensitive_2fa': 'require_totp_2fa' in combined,'verified':False}
    elif s=='pdf':r['authentication']='signed pdf identity for /generate,/ready; public liveness/docs';r['authorization']='only permitted document/deployment caller routes; render request network blocked'
    else:r['authentication']='inspect source';r['authorization']='inspect source'
    if route in ('/health','/ready','/','/docs.json'):
        r['consumer']='operations/health or developer documentation';r['risk']='Low'
    r['evidence']=[f"{r['source']}:{r['line']}",f"{r['handler_source']}:{r['handler_line']}"]
    # Avoid repeating entire function text in published inventory; AST extractor
    # output is available for reproducibility, source is authoritative.
    r.pop('source_text',None);r.pop('handler_text',None);r.pop('registration_args',None);r.pop('receiver',None)
    return r

records=[metadata(r) for r in records]

# Framework/plugin endpoints are explicitly distinguished from source handlers.
framework=[]
for service in ['admin-api','document','analytics']:
    for route in ['/openapi.json','/docs','/docs/oauth2-redirect','/redoc']:
        framework.append({'service':service,'method':'GET','route':route,'surface':'framework-generated','handler':'FastAPI built-in documentation/OpenAPI',
            'source':f'services/{service}/app/main.py','status':'untested','authentication':'global service middleware where configured; otherwise public','risk':'Low','registered':True,
            'evidence':['FastAPI constructor defaults/docs_url/redoc_url; no application function declaration']})
# Dynamic Fastify Swagger routes and CORS preflights are count-free surfaces:
# exact installed plugin route lists need native router inspection.
plugin_surfaces=[{'service':s,'route':'/docs/*','methods':['GET','HEAD'],'kind':'swagger-ui plugin generated paths; precise runtime router not enumerated'} for s in ['auth','chat','notification','pdf']]
plugin_surfaces += [{'service':s,'route':'/docs/*','methods':['GET','HEAD'],'kind':'swagger-ui-express middleware path'} for s in ['gateway','payment','quota']]
plugin_surfaces += [{'service':'auth','route':'/v1/auth/login/google','methods':['GET'],'kind':'@fastify/oauth2 startRedirectPath, see server.ts:114; plugin-owned; POST same path is Firebase token flow'}]

active=[r for r in records if r['registered'] and r['surface']=='explicit'];proxies=[r for r in records if r['surface']=='wildcard-proxy'];dormant=[r for r in records if not r['registered']]
duplicates=[]
for k,n in Counter((r['service'],r['method'],r['route']) for r in active).items():
    if n>1:duplicates.append({'service':k[0],'method':k[1],'route':k[2],'count':n})
inventory={'generated_by':'scripts/production_audit_api_extract.mjs + scripts/production_audit_api_inventory.py','basis':'current source AST; no application imports, prior report assertions, mocked HTTP or runtime requests',
 'counts':{'explicit_registered_method_routes':len(active),'framework_fastapi_method_routes':len(framework),'gateway_wildcard_proxy_mounts':len(proxies),'unmounted_declarations':len(dormant),
 'by_service':dict(sorted(Counter(r['service'] for r in active).items()))},'endpoints':active,'framework_endpoints':framework,'proxy_surfaces':proxies,'plugin_surfaces':plugin_surfaces,'unmounted_endpoints':dormant,'duplicate_registrations':duplicates}
OUT.mkdir(parents=True,exist_ok=True)
(OUT/'api-inventory.json').write_text(json.dumps(inventory,indent=2)+'\n')
(OUT/'api-review-manifest.json').write_text(json.dumps([{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest(),'review':'AST route registration/dependency extraction'} for p in sorted(reviewed)],indent=2)+'\n')
print(json.dumps(inventory['counts']))
