"""Aggregate recorded Phase 5 results without promoting blocked checks."""
import collections,datetime,hashlib,json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/system-audit/evidence/phase5'
def main():
    read=lambda name:json.loads((OUT/name).read_text())
    stack=read('stack-integration.json');regression=read('regression/summary.json');artifacts=read('artifact-checks.json');live=read('groq-live.json')
    checks=[]
    for source,rows in [('native-stack',stack['checks']),('regression',regression['checks']),('offline-artifacts',artifacts['checks']),('live-groq-contract',live['checks']),('provider-inventory',read('provider-inventory.json')['results'])]:
        for row in rows:
            status={'VERIFIED':'PASS','UNRESOLVED':'FAIL'}.get(row['status'],row['status'])
            if status not in ('PASS','FAIL','BLOCKED','NOT RUN'):raise ValueError('Unknown result '+status)
            checks.append({'source':source,'check':row.get('workflow') or row.get('id') or row.get('provider'),'status':status})
    for name in ['backup-restore.json','bounded-load.json','credential-hygiene.json','paid-call-denial-test.json','documentation-links.json']:
        checks.append({'source':name,'check':name,'status':read(name)['status']})
    for check,status in [('Actual Docker images built','NOT RUN'),('Actual container startup','BLOCKED'),('Container SBOM/vulnerability scans','BLOCKED'),('Sanitized legacy copy migrations','BLOCKED'),('Actual user/admin browser workflows','BLOCKED'),('PDF export/render/watermark acceptance','BLOCKED'),('External payment/email/storage/Firebase workflows','BLOCKED'),('Production deployment','NOT RUN')]:
        checks.append({'source':'release-acceptance','check':check,'status':status})
    # History is read-only. Any changed/deleted Phase 4 evidence is a failure.
    historical=read('phase4-evidence-baseline.json')
    changed=[name for name,digest in historical.items() if not (ROOT/name).is_file() or hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=digest]
    preservation={'status':'FAIL' if changed else 'PASS','baseline_files':len(historical),'changed_or_deleted':changed}
    (OUT/'phase4-preservation.json').write_text(json.dumps(preservation,indent=2)+'\n')
    checks.append({'source':'repository','check':'Phase 4 evidence preserved','status':preservation['status']})
    baseline=read('baseline.json');modified=[];deleted=[]
    for name,digest in baseline.items():
        path=ROOT/name
        if not path.is_file():deleted.append(name)
        elif hashlib.sha256(path.read_bytes()).hexdigest()!=digest:modified.append(name)
    candidates=[*ROOT.glob('PHASE5*.md'),*ROOT.glob('scripts/phase5*'),ROOT/'scripts/tests/test_phase5_authorization.py',ROOT/'scripts/verify_notification_build.mjs',ROOT/'deploy/staging/service-entrypoint.sh',ROOT/'services/payment/src/__tests__/payment-receipt.test.ts',ROOT/'services/notification/scripts/copy-templates.mjs',ROOT/'services/notification/src/templates/payment_receipt.hbs',ROOT/'shared/tests/test_staging_trust.py']
    added=sorted(str(p.relative_to(ROOT)) for p in candidates if p.is_file() and str(p.relative_to(ROOT)) not in baseline)
    manifest={'baseline_files':len(baseline),'modified':sorted(modified),'added':added,'deleted':deleted,'note':'Hash comparison with the pre-Phase 5 working files. Git has no HEAD/tracked tree; this is not a reconstructed commit diff.'}
    (OUT/'change-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
    result={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'production_readiness':'NOT READY','staging_deployed':False,'native_fixture_database':stack['database'],'native_statuses':dict(collections.Counter({'VERIFIED':'PASS','UNRESOLVED':'FAIL'}.get(row['status'],row['status']) for row in stack['checks'])),'regression_statuses':dict(collections.Counter(row['status'] for row in regression['checks'])),'all_records':dict(collections.Counter(row['status'] for row in checks)),'check_records_overlap':True,'groq':{'attempts':len(live['budget']['attempts']),'conservative_reserved_usd':live['budget']['reserved_usd'],'returned_usage_estimate_usd':live['budget']['observed_usd'],'billing_statement_verified':False,'further_paid_calls':'DISABLED by owner','workflow_acceptance':'FAIL: successful tool persistence not verified'},'checks':checks}
    (OUT/'verification-summary.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({key:value for key,value in result.items() if key!='checks'},indent=2))
    if changed or deleted:raise SystemExit(1)
if __name__=='__main__':main()
