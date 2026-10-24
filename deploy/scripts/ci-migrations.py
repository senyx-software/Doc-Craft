"""Execute existing migration systems against an explicitly disposable CI DB."""
import json,os,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
from create_service_credentials import generate
from urllib.parse import urlsplit
if urlsplit(os.environ['DATABASE_URL']).path!='/doccraft_staging_ci':raise ValueError('Refusing a non-CI database')
env={**os.environ,'SERVICE_AUTH_CONFIG_JSON':json.dumps(generate()['admin-api']),'ADMIN_RUN_MIGRATIONS':'true','DOCUMENT_RUN_MIGRATIONS':'true','ENV':'test','PYTHONPATH':str(ROOT)}
for service in ['auth','chat','payment','quota']:subprocess.run([ROOT/'node_modules/.bin/prisma','migrate','deploy','--schema',ROOT/f'services/{service}/prisma/schema.prisma'],env=env,check=True)
subprocess.run([sys.executable,ROOT/'scripts/staging_migrate_python.py'],env=env,check=True)
subprocess.run(['node','--input-type=module','-e',"const {getDbPool,initDb}=await import('./services/notification/dist/services/db.service.js');const p=getDbPool();await initDb(p);await p.end();"],env={**env,'NOTIFICATION_RUN_MIGRATIONS':'false'},check=True)
import psycopg2
from staging_database_roles import provision
grant_url=env.get('CI_GRANTS_DATABASE_URL',env['DATABASE_URL'])
if urlsplit(grant_url).path!='/doccraft_staging_ci':raise ValueError('Refusing non-CI grant database')
with psycopg2.connect(grant_url) as connection:roles=provision(connection,'ci_scoped')
from urllib.parse import urlunsplit,quote
parsed=urlsplit(env['DATABASE_URL'])
for service,record in roles.items():
 uri=urlunsplit((parsed.scheme,quote(record['role'])+':'+quote(record['password'])+'@'+parsed.hostname+':'+str(parsed.port),parsed.path,'',''))
 with psycopg2.connect(uri) as db:
  try:
   with db.cursor() as cursor:cursor.execute('CREATE TABLE forbidden_runtime_ddl(id integer)')
  except psycopg2.errors.InsufficientPrivilege:db.rollback()
  else:raise RuntimeError('Runtime role unexpectedly has schema creation privileges')
print('Real PostgreSQL migrations executed; runtime DDL rejected for every database service')
