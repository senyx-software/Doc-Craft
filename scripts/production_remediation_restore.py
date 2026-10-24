import os,sys,json,hashlib,time,subprocess,uuid
from pathlib import Path
from urllib.parse import urlsplit,unquote
import psycopg2
from psycopg2 import sql
sys.path.insert(0,'.local/production-remediation');from live_client import Live
l=Live();parsed=urlsplit(l.context['database_url']);assert parsed.hostname=='127.0.0.1' and parsed.path.startswith('/doccraft_staging_hybrid_')
root=Path('.local/production-audit/tools/postgresql-18.4').resolve();client=root/'src/bin/pg_dump';private=Path('.local/production-remediation/restore');private.mkdir(mode=0o700,exist_ok=True)
source=psycopg2.connect(l.context['database_url']);source.set_session(isolation_level='REPEATABLE READ',readonly=True,autocommit=False)
def fingerprint(db):
 with db.cursor() as cur:
  cur.execute("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");tables=[r[0] for r in cur.fetchall()];result={}
  for table in tables:
   cur.execute(sql.SQL('SELECT row_to_json(t)::text FROM {} t').format(sql.Identifier(table)))
   rows=sorted(json.dumps(json.loads(r[0]),sort_keys=True,separators=(',',':')) for r in cur.fetchall());result[table]={'rows':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
  cur.execute("SELECT conname,contype,pg_get_constraintdef(oid) FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname,contype");constraints=cur.fetchall()
 return result,hashlib.sha256(json.dumps(constraints).encode()).hexdigest(),len(constraints)
with source.cursor() as cur:cur.execute('SELECT pg_export_snapshot()');snapshot=cur.fetchone()[0]
before,pre_constraints,number=fingerprint(source)
env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG')};env.update(PGHOST=parsed.hostname,PGPORT=str(parsed.port),PGUSER=unquote(parsed.username),PGPASSWORD=unquote(parsed.password),PGDATABASE=parsed.path[1:],PGSSLMODE='disable',LD_LIBRARY_PATH=str(root/'src/interfaces/libpq'))
dump=private/'audit.dump';start=time.monotonic();r=subprocess.run([str(client/'pg_dump'),'--format=custom','--compress=0','--no-owner','--no-acl','--snapshot='+snapshot,'--file',str(dump)],env=env,capture_output=True,timeout=60);assert r.returncode==0,'Dump failed';dump.chmod(0o600);dump_ms=round((time.monotonic()-start)*1000)
source.rollback();source.close();target='doccraft_audit_restore_'+uuid.uuid4().hex[:12];l.query(sql.SQL('CREATE DATABASE {}').format(sql.Identifier(target)))
try:
 start=time.monotonic();r=subprocess.run([str(client/'pg_restore'),'--exit-on-error','--no-owner','--no-acl','--dbname',target,str(dump)],env=env,capture_output=True,timeout=60);assert r.returncode==0,'Restore failed'
 restore_ms=round((time.monotonic()-start)*1000);url=l.context['database_url'].rsplit('/',1)[0]+'/'+target
 restored=psycopg2.connect(url)
 try:after,post_constraints,post_number=fingerprint(restored)
 finally:restored.close()
 result={'status':'PASS' if before==after and pre_constraints==post_constraints else 'FAIL','scope':'Real native PostgreSQL18.4 synthetic fixture snapshot dump/restore to distinct disposable database; not productionPG17/TLS/off-server/PITR/fullVPS recovery','source_archive':json.loads((root.parent/'verified-source.json').read_text()),'client_features':'No TLS/readline/ICU/zlib; snapshot dump uses compression0 over loopback fixture only','tables':len(before),'rows':sum(x['rows'] for x in before.values()),'table_content_hashes_match':before==after,'constraints':number,'constraint_definitions_match':pre_constraints==post_constraints,'dump_bytes':dump.stat().st_size,'dump_sha256':hashlib.sha256(dump.read_bytes()).hexdigest(),'dump_ms':dump_ms,'restore_ms':restore_ms,'target_database_dropped_after_check':True,'table_results':before}
 Path('docs/production-remediation/evidence/runtime/backup-restore.json').write_text(json.dumps(result,indent=2)+'\n');print({k:v for k,v in result.items() if k not in ['table_results','source_archive']})
finally:l.query(sql.SQL('DROP DATABASE {}').format(sql.Identifier(target)))
