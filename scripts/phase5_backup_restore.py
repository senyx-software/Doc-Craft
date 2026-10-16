"""Dump and restore the owned synthetic fixture DB only; never a legacy copy."""
import datetime,hashlib,json,os,subprocess,uuid,shutil
from pathlib import Path
from urllib.parse import urlsplit,urlunsplit,parse_qs,unquote
import psycopg2
from psycopg2 import sql
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'docs/system-audit/evidence/phase5'
def counts(url):
    with psycopg2.connect(url) as db:
        with db.cursor() as cursor:
            cursor.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
            tables=[row[0] for row in cursor.fetchall()];result={}
            for name in tables:
                cursor.execute(sql.SQL('SELECT COUNT(*) FROM {}').format(sql.Identifier(name)));result[name]=cursor.fetchone()[0]
            return result
def main():
    client_dir=os.getenv('PG_CLIENT_BIN_DIR','')
    tools={name:str(Path(client_dir)/name) if client_dir else shutil.which(name) for name in ('pg_dump','pg_restore')}
    if not all(value and Path(value).is_file() for value in tools.values()):
        result={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'BLOCKED','prerequisite':'PostgreSQL 17+ pg_dump and pg_restore executables; set PG_CLIENT_BIN_DIR or install on the dedicated staging host','attempted':'Native bundled server provides initdb/pg_ctl/postgres only. Official PostgreSQL source archive download timed out; no unverified client installed.','dump_created':False,'restore_executed':False,'production_data_used':False}
        (OUT/'backup-restore.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2));return 2
    stack=json.loads((OUT/'stack-integration.json').read_text());source=stack['database']
    if not source.startswith('doccraft_phase4_'):raise ValueError('Owned fixture DB required')
    base=Path('/tmp/doccraft-phase4-postgres');url=json.loads((base/'tls-connection.json').read_text())['PG_AUDIT_URL'];parsed=urlsplit(url)
    if parsed.hostname!='127.0.0.1':raise ValueError('Loopback required')
    source_url=urlunsplit((parsed.scheme,parsed.netloc,'/'+source,parsed.query,''));target='doccraft_phase5_restore_'+uuid.uuid4().hex[:12]
    target_url=urlunsplit((parsed.scheme,parsed.netloc,'/'+target,parsed.query,''))
    private=ROOT/'.local'/target;private.mkdir(mode=0o700);dump=private/'fixture.dump'
    env={**os.environ,'LD_LIBRARY_PATH':str(base/'package/native/lib'),'PGHOST':parsed.hostname,'PGPORT':str(parsed.port),'PGUSER':unquote(parsed.username),'PGPASSWORD':unquote(parsed.password),'PGSSLMODE':'verify-full','PGSSLROOTCERT':parse_qs(parsed.query)['sslrootcert'][0]}
    before=counts(source_url)
    subprocess.run([tools['pg_dump'],'--format=custom','--no-owner','--no-acl','--file',str(dump)],env={**env,'PGDATABASE':source},capture_output=True,check=True,timeout=60);dump.chmod(0o600)
    control=psycopg2.connect(url);control.autocommit=True
    with control.cursor() as cursor:cursor.execute(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(target)))
    try:
        subprocess.run([tools['pg_restore'],'--exit-on-error','--no-owner','--no-acl','--dbname',target,str(dump)],env=env,capture_output=True,check=True,timeout=60)
        after=counts(target_url)
        result={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'PASS' if before==after else 'FAIL','source_fixture':source,'restored_fixture':target,'table_counts_match':before==after,'tables':len(before),'rows':sum(before.values()),'dump_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),'private_dump':str(dump.relative_to(ROOT)),'tls':'verify-full','scope':'Synthetic local fixture dump/restore and table row counts only. Does not prove sanitized legacy migration, PITR, remote backup retention, RPO/RTO or owner disaster recovery acceptance.'}
    finally:
        with control.cursor() as cursor:cursor.execute(sql.SQL('DROP DATABASE {}').format(sql.Identifier(target)))
        control.close()
    (OUT/'backup-restore.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
    return int(result['status']!='PASS')
if __name__=='__main__':raise SystemExit(main())
