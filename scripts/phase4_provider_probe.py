"""Read-only provider authentication probes. Never send email, generate text or charge."""
from datetime import datetime,timezone
from pathlib import Path
import json
import os
import httpx
from dotenv import dotenv_values
ROOT=Path(__file__).resolve().parents[1]

def main():
    results=[]
    for name,path,key,url,collection in [
        ('Groq','services/chat/chat.env','GROQ_API_KEY','https://api.groq.com/openai/v1/models','data'),
        ('Resend','services/notification/notification.env','RESEND_API_KEY','https://api.resend.com/domains','data'),
    ]:
        value=os.getenv(key) or dotenv_values(ROOT/path).get(key)
        row={'provider':name,'operation':'read-only authentication/catalog','sandbox_project_verified':False,'workflow_tested':False}
        if not value or any(x in value.lower() for x in ('replace','placeholder','your_')):row['status']='MISSING_CONFIGURATION'
        else:
            try:
                response=httpx.get(url,headers={'Authorization':'Bearer '+value},timeout=15,follow_redirects=False)
                row['http_status']=response.status_code;row['status']='AUTHENTICATED_READ_ONLY' if response.status_code==200 else 'REJECTED'
                if response.status_code==200:
                    data=response.json().get(collection,[]);row['record_count']=len(data) if isinstance(data,list) else None
            except Exception as error:row.update(status='CONNECTION_FAILED',error_type=type(error).__name__)
        results.append(row)
    output={'checked_at':datetime.now(timezone.utc).isoformat(),'scope':'No emails, AI completions, billing or data mutations. Read-only success does not establish staging ownership or end-to-end delivery.','results':results}
    (ROOT/'docs/system-audit/evidence/phase4/provider-connections.json').write_text(json.dumps(output,indent=2)+'\n')
    print(json.dumps(output,indent=2))

if __name__=='__main__':main()
