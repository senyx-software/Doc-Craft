"""Record registry advisories separately from deployed-exploit claims."""
import datetime
import json
from pathlib import Path
import subprocess
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/system-audit/evidence/phase3'
results=[]
for name,directory in [('backend',ROOT),('user',ROOT/'user-frontend'),('admin',ROOT/'admin')]:
    for scope in ('all','production'):
        command=['npm','audit','--json',*(['--omit=dev'] if scope=='production' else [])]
        process=subprocess.run(command,cwd=directory,capture_output=True,text=True,timeout=120)
        try: report=json.loads(process.stdout)
        except ValueError: report={'error':'Registry audit did not return JSON'}
        (OUT/f'dependencies-{name}-{scope}.json').write_text(json.dumps(report,indent=2)+'\n')
        results.append({'component':name,'scope':scope,'exit_code':process.returncode,'counts':report.get('metadata',{}).get('vulnerabilities'),'error':report.get('error'),'evidence':f'dependencies-{name}-{scope}.json'})
(OUT/'dependency-audit.json').write_text(json.dumps({'checked_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':results},indent=2)+'\n')
print(json.dumps(results,indent=2))
