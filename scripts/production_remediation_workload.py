"""Native integrated HTTP workload, explicitly separate from Docker/VPS acceptance."""
import concurrent.futures,json,os,statistics,time,sys
from pathlib import Path
from live_client import Live,WORK,EVIDENCE
ROOT=Path(__file__).resolve().parents[1]

def workload(l):
 users=[l.user('load-'+str(index)) for index in range(8)];user=users[0];sessions=[l.session(item) for item in users]
 fields={'businessName':'Nexora','clientName':'John','invoiceNumber':'INV-LIVE','issueDate':'2026-10-20','dueDate':'2026-11-20','currency':'USD','senderAddress':'100 Market Street','clientAddress':'200 Main Street','senderEmail':'billing@example.com','senderPhone':'+14155550100','lineItems':[{'description':'Laptop','quantity':3,'unitPrice':500}]}
 for owner,session in zip(users,sessions):l.request('PATCH','gateway','/v1/chat/session/'+session['sessionId'],headers={'Authorization':'Bearer '+owner['accessToken']},json={'slots':fields,'expectedRevision':session['state']['revision']})
 before=l.ledger();started=time.monotonic();results=[]
 def sequence(index):
  client=Live();sid=sessions[index]['sessionId'];rows=[];owner=users[index]
  for count in range(12):
   tax=(count+1)%15;r=client.turn(owner,sid,f'Change the tax to {tax}%.')
   rows.append({'kind':'deterministic_tax','latency_ms':r['latency_ms'],'passed':bool(r['done']) and r['done']['state']['slots']['taxRate']==tax and r['done']['state']['slots']['totalDue']==round(1500*(1+tax/100),2) and r['done']['state']['slots']['clientName']=='John','error_code':r['error']['code'] if r['error'] else None})
  return rows
 with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
  for rows in pool.map(sequence,range(8)):results+=rows
 elapsed=time.monotonic()-started
 other=users[1];r=l.http.get(l.urls['gateway']+'/v1/chat/session/'+sessions[0]['sessionId']+'/messages',headers={'Authorization':'Bearer '+other['accessToken']})
 rows=sorted(row['latency_ms'] for row in results);out={'distinct_users':8,'method':'actual gateway + signed services + PostgreSQL/Redis; seeded fields via authorized editor API; native processes, no Docker','concurrency':8,'requests':len(rows),'passed':sum(row['passed'] for row in results),'elapsed_seconds':round(elapsed,3),'p50_ms':rows[len(rows)//2],'p95_ms':rows[int(len(rows)*.95)-1],'inference_ledger_delta':l.ledger()-before,'cross_tenant_http_status':r.status_code,'results':results}
 (EVIDENCE/'http-workload.json').write_text(json.dumps(out,indent=2)+'\n');print({k:v for k,v in out.items() if k!='results'})

def main():
 l=Live();initial=l.admin('GET','/api/v1/admin/config/settings',base='')['data'];configured=json.loads(json.dumps(initial));configured['rate_limits']={**configured.get('rate_limits',{}),'auth':200};l.admin('PUT','/api/v1/admin/config/settings',configured,base='')
 try:workload(l)
 finally:l.admin('PUT','/api/v1/admin/config/settings',initial,base='')

if __name__=='__main__':main()
