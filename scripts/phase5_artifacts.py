"""Reproducible offline staging artifacts and source SBOMs; no deployment."""
import datetime,json,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/system-audit/evidence/phase5'
def main():
    records=[]
    def run(name,argv,cwd=ROOT):
        result=subprocess.run(argv,cwd=cwd,text=True,capture_output=True,timeout=240)
        (OUT/(name+'.log')).write_text(result.stdout+result.stderr)
        records.append({'id':name,'status':'PASS' if result.returncode==0 else 'FAIL','exit_code':result.returncode,'command':argv,'cwd':str(cwd.relative_to(ROOT)) or '.'})
        return result
    stage=ROOT/'.local'/('staging-phase5-'+datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S'))
    run('staging-generate',[sys.executable,'scripts/prepare_staging.py','--output',str(stage)])
    verified=run('staging-offline-checks',[sys.executable,'scripts/verify_staging.py',str(stage),'--compose','/tmp/doccraft-docker-compose'])
    if verified.returncode==0:(OUT/'staging-offline-checks.json').write_text(verified.stdout)
    run('notification-build-assets',['node','scripts/verify_notification_build.mjs'])
    for label,folder in [('backend','.'),('user','user-frontend'),('admin','admin')]:
        result=run(label+'-source-sbom',['npm','sbom','--sbom-format','cyclonedx'],ROOT/folder)
        if result.returncode==0:(OUT/(label+'-source-sbom.cdx.json')).write_text(result.stdout)
    result=run('braces-registry',['npm','view','braces','version','--json'])
    (OUT/'artifact-checks.json').write_text(json.dumps({'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'checks':records,'staging_directory':str(stage.relative_to(ROOT)),'image_builds':'NOT RUN: no reachable Docker daemon','image_sboms_and_scans':'BLOCKED: no actual images; the generated SBOMs describe installed source dependencies only'},indent=2)+'\n')
    print(json.dumps(records,indent=2))
    return int(any(row['status']=='FAIL' for row in records))
if __name__=='__main__':raise SystemExit(main())
