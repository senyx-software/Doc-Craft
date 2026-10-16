"""Phase 5 additions, using only a uniquely named local fixture database."""
import json,os,subprocess,time,shutil
from pathlib import Path
from dotenv import dotenv_values

def run_load(context):
    import concurrent.futures,collections,statistics
    def one(_):
        start=time.monotonic()
        response=context['client'].get(context['urls']['gateway']+'/v1/quota/me',headers={'Authorization':'Bearer '+context['tokens'][0]})
        return response.status_code,(time.monotonic()-start)*1000
    start=time.monotonic()
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:results=list(pool.map(one,range(72)))
    elapsed=time.monotonic()-start;latencies=sorted(row[1] for row in results);statuses=dict(collections.Counter(row[0] for row in results))
    evidence={'status':'PASS' if all(row[0]==200 for row in results) else 'FAIL','scope':'Bounded native TLS authenticated read workload; no provider calls or metered generations. Not an approved production capacity or SLO benchmark.','requests':72,'concurrency':12,'http_statuses':statuses,'seconds':round(elapsed,3),'requests_per_second':round(72/elapsed,2),'latency_ms':{'p50':round(statistics.median(latencies),2),'p95':round(latencies[int(len(latencies)*.95)-1],2),'max':round(max(latencies),2)}}
    (context['OUT']/'bounded-load.json').write_text(json.dumps(evidence,indent=2)+'\n')
    context['record']('Bounded concurrent authenticated native workflow completes without errors',evidence['status']=='PASS',evidence,'Concurrency')

def run_receipt(context):
    environment={**context['env'],'REDIS_URL':context['redis_urls']['payment'],'SERVICE_AUTH_CONFIG_JSON':json.dumps(context['credentials']['payment'])}
    result=subprocess.run([str(context['TSX']),str(context['ROOT']/'scripts/phase5_payment_receipt.mts')],cwd=context['ROOT'],env=environment,capture_output=True,text=True,timeout=60)
    (context['OUT']/'payment-receipt-integration.log').write_text(result.stdout+result.stderr)
    context['record']('Verified invoice receipt survives duplicate events and lost downstream acknowledgement',result.returncode==0,{'exit_code':result.returncode,'external_emails':0,'details':'payment-receipt-integration.log'},'Payment receipt')

def run_live(context):
    if os.getenv('PHASE5_APPROVED_GROQ')!='8_REQUESTS_USD_0.10':return
    authorization=Path(__file__).resolve().parents[1]/'docs/system-audit/evidence/phase5/provider-authorization.json'
    if authorization.exists() and json.loads(authorization.read_text()).get('further_paid_calls','').startswith('DISABLED'):
        context['checks'].append({'workflow':'Further paid Groq calls disabled by owner','status':'BLOCKED','category':'Live provider','evidence':'Original allowance exhausted; no new calls authorized'})
        return
    request=context['request'];user=context['users'][0];token=context['tokens'][0]
    routing=request('GET','admin','/api/v1/admin/config/ai_model_routing',context['admin_token'])['data']
    for provider in ('claude','groq'):
        request('PUT','admin','/api/v1/admin/config/ai_model_routing',context['admin_token'],payload={**routing,'provider':provider},headers=context['action_headers']())
        policy=request('GET','admin','/api/v1/users/'+user+'/entitlements',context['admin_token'])
        context['record']('Administrator '+provider+' switch reaches current entitlement',policy.get('entitlements',policy)['ai_provider']==provider,category='Provider switch')
    request('PUT','admin','/api/v1/users/'+user+'/entitlements',context['admin_token'],payload={'plan':'max','features':{'daily_quota':25},'reason':'Approved bounded live provider verification'},headers=context['action_headers']())
    session=request('POST','gateway','/v1/chat/api/chat/session',token,expected=201,payload={'documentTypeId':'invoice','templateId':'tmpl_invoice_2023_01'})['sessionId']
    key=dotenv_values(context['ROOT']/'services/chat/chat.env').get('GROQ_API_KEY')
    if not key:raise ValueError('Approved Groq configuration unavailable')
    environment={**context['env'],'GROQ_API_KEY':key,'GROQ_MODELS':'openai/gpt-oss-20b','REDIS_URL':context['redis_urls']['chat'],'SERVICE_AUTH_CONFIG_JSON':json.dumps(context['credentials']['chat'])}
    for filename in ('groq-live.json','groq-live.log'):
        existing=context['OUT']/filename
        if existing.exists():shutil.copyfile(existing,context['OUT']/(filename+'.attempt-'+str(time.time_ns())))
    result=subprocess.run([str(context['TSX']),str(context['ROOT']/'scripts/phase5_groq_live.mts'),user,session,str(context['OUT']/'groq-live.json')],cwd=context['ROOT'],env=environment,capture_output=True,text=True,timeout=240)
    # Probe output contains only synthetic fixtures and counters, never a key.
    (context['OUT']/'groq-live.log').write_text(result.stdout+result.stderr)
    context['checks'].append({'workflow':'Approved live Groq + MCP + PostgreSQL workflow','status':'VERIFIED' if result.returncode==0 else 'UNRESOLVED','category':'Live provider','evidence':{'exit_code':result.returncode,'details':'groq-live.json'}})
    request('DELETE','admin','/api/v1/users/'+user+'/entitlements',context['admin_token'],headers=context['action_headers']())
