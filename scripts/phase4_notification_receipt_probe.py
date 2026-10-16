"""Real PostgreSQL notification receipt checks, only in the latest owned fixture DB."""
import json,os,subprocess,sys,uuid
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit
ROOT=Path(__file__).resolve().parents[1];OUT=Path(os.environ.get('DOCCRAFT_AUDIT_EVIDENCE_DIR',str(ROOT/'docs/system-audit/evidence/phase4')))
def main():
    stack=json.loads((OUT/'stack-integration.json').read_text());database=stack['database']
    if not database.startswith('doccraft_phase4_'):raise ValueError('Not a task-owned fixture database')
    url=json.loads(Path('/tmp/doccraft-phase4-postgres/tls-connection.json').read_text())['PG_AUDIT_URL'];parsed=urlsplit(url)
    if parsed.hostname not in ('127.0.0.1','localhost','::1'):raise ValueError('Not loopback')
    script='''import {acceptDelivery,beginDeliveryAttempt} from './services/notification/src/services/delivery-inbox.service.ts';
import {getDbPool,closeDb} from './services/notification/src/services/db.service.ts';
(async()=>{let id;try{
 const payload={userId:'owned-fixture',email:'fixture@example.com'};
 const receipt=await acceptDelivery('payment','renewal',payload,process.env.P4_RECEIPT_KEY);id=receipt.id;
 const duplicate=await acceptDelivery('payment','renewal',payload,process.env.P4_RECEIPT_KEY);
 if(duplicate.id!==id)throw new Error('Duplicate identity changed');
 let conflict=false;try{await acceptDelivery('payment','cancellation',payload,process.env.P4_RECEIPT_KEY);}catch(e){conflict=e.statusCode===409;}
 if(!conflict)throw new Error('Conflicting identity accepted');
 await beginDeliveryAttempt(id);
 await getDbPool().query(`UPDATE "NotificationDelivery" SET "attemptStartedAt"=NOW()-INTERVAL '24 hours' WHERE id=$1`,[id]);
 let held=false;try{await beginDeliveryAttempt(id);}catch{held=true;}
 const row=await getDbPool().query('SELECT "requiresReview" FROM "NotificationDelivery" WHERE id=$1',[id]);
 if(!held||row.rows[0].requiresReview!==true)throw new Error('Uncertain expired receipt not held');
 console.log(JSON.stringify({status:'VERIFIED',checks:['idempotent durable identity','conflicting identity rejected','first provider attempt allowed','expired uncertain attempt held for reconciliation'],external_requests:0}));
 }finally{if(id)await getDbPool().query('DELETE FROM "NotificationDelivery" WHERE id=$1',[id]);await closeDb();}})().catch(()=>{console.error('Owned notification receipt probe failed');process.exitCode=1;});'''
    # Raw JS is passed as a process argument, never evaluated by a shell.
    env={**os.environ,'DATABASE_URL':urlunsplit((parsed.scheme,parsed.netloc,'/'+database,parsed.query,'')),'NOTIFICATION_RUN_MIGRATIONS':'false','P4_RECEIPT_KEY':'probe-'+uuid.uuid4().hex}
    result=subprocess.run([str(ROOT/'node_modules/.bin/tsx'),'-e',script],cwd=ROOT,env=env,capture_output=True,text=True,timeout=30)
    (OUT/'notification-receipt-probe.log').write_text(result.stdout+result.stderr)
    if result.returncode==0:
        evidence=json.loads(result.stdout[result.stdout.index('{'):]);evidence.update({'database':database,'exit_code':0});(OUT/'notification-receipt-probe.json').write_text(json.dumps(evidence,indent=2)+'\n')
    return result.returncode
if __name__=='__main__':raise SystemExit(main())
