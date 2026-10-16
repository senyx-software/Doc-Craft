"""Redacted provider configuration inventory and read-only authentication."""
import datetime,json,os
from pathlib import Path
import httpx
from dotenv import dotenv_values
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/system-audit/evidence/phase5'
def main():
    results=[]
    for provider,path,key,endpoint in [('Groq','chat','GROQ_API_KEY','https://api.groq.com/openai/v1/models'),('Resend','notification','RESEND_API_KEY','https://api.resend.com/domains'),('Claude','chat','ANTHROPIC_API_KEY',None),('Paddle','payment','PADDLE_API_KEY',None),('PayHere','payment','PAYHERE_MERCHANT_SECRET',None),('Firebase','auth','FIREBASE_PROJECT_ID',None),('Supabase','document','SUPABASE_SERVICE_ROLE_KEY',None)]:
        file=ROOT/f'services/{path}/{path}.env';value=os.getenv(key) or dotenv_values(file).get(key)
        configured=bool(value) and not any(word in value.lower() for word in ('your_','replace','placeholder','dummy','test_fixture'))
        row={'provider':provider,'configuration_path':str(file.relative_to(ROOT)),'configuration_present':configured,'staging_project_approved':provider=='Groq','workflow':'See groq-live.json' if provider=='Groq' else 'BLOCKED: approved staging resource/action unavailable'}
        if configured and endpoint:
            try:
                response=httpx.get(endpoint,headers={'Authorization':'Bearer '+value},timeout=15,follow_redirects=False)
                row.update(operation='read-only catalog authentication',http_status=response.status_code,status='PASS' if response.status_code==200 else 'FAIL')
                if response.status_code==200:
                    data=response.json().get('data',[]);row['record_count']=len(data)
                    if provider=='Groq':row['approved_test_model_available']=any(model.get('id')=='openai/gpt-oss-20b' for model in data)
            except Exception as error:row.update(status='BLOCKED',error_type=type(error).__name__)
        else:row['status']='BLOCKED'
        results.append(row)
    report={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'No emails, payments, account changes or completions in this inventory probe. Groq completion evidence is separate. Configuration presence is not provider or staging verification.','results':results}
    (OUT/'provider-inventory.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
if __name__=='__main__':main()
