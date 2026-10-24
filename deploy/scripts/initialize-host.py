#!/usr/bin/env python3
"""Operator-only file preparation for a NEW EMPTY installation; never starts Docker.

Existing database installations require credential import, not this initializer.
No developer .env values are read. Existing paths are never overwritten.
"""
import argparse,base64,json,os,secrets,subprocess,sys
from pathlib import Path
from urllib.parse import quote
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'scripts'))
from create_service_credentials import generate
from create_redis_credentials import generate as redis_credentials
from configure import parse,validate,PORTS,DB_SERVICES,REQUIRED_SECRETS,generate as configure

def write(path,value,mode=0o600):
 path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 with open(path,'x',opener=lambda p,f:os.open(p,f,mode)) as out:out.write(value)
def main():
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('--new-empty-installation',action='store_true',required=True);p.add_argument('--home',type=Path,required=True);p.add_argument('--config',type=Path,required=True);a=p.parse_args()
 values=validate(parse(a.config));a.home.mkdir(mode=0o700,parents=True,exist_ok=False);s=a.home/'secrets';s.mkdir(mode=0o700)
 write(a.home/'production.env',a.config.read_text());identities=generate();tls=s/'tls-work';tls.mkdir(mode=0o700)
 def run(args):subprocess.run(list(map(str,args)),stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 run(['openssl','req','-x509','-newkey','rsa:3072','-nodes','-keyout',s/'ca.key','-out',s/'ca.crt','-subj','/CN=DocCraft private service CA','-days','3650','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign'])
 for name in [*PORTS,'postgres','redis']:
  run(['openssl','req','-newkey','rsa:2048','-nodes','-keyout',s/(name+'.key'),'-out',tls/(name+'.csr'),'-subj','/CN='+name])
  write(tls/(name+'.ext'),'subjectAltName=DNS:'+name+'\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n')
  run(['openssl','x509','-req','-in',tls/(name+'.csr'),'-CA',s/'ca.crt','-CAkey',s/'ca.key','-CAcreateserial','-out',s/(name+'.crt'),'-days','90','-extfile',tls/(name+'.ext')])
  os.chmod(s/(name+'.key'),0o444);os.chmod(s/(name+'.crt'),0o444)
 os.chmod(s/'ca.crt',0o444)
 redis=redis_credentials(s/'redis-provision','redis',6379)
 # Copy newly generated Redis ACL artifacts only; no external credentials are imported.
 write(s/'redis.acl',(s/'redis-provision/redis.acl').read_text(),0o444)
 write(s/'redis-health.env',(s/'redis-provision/redis-health.env').read_text())
 owner=secrets.token_urlsafe(36);migrator=secrets.token_urlsafe(36);write(s/'postgres-password',owner,0o444);write(s/'postgres-migrator-password',migrator,0o444)
 database=values['POSTGRES_DB'];root_url='postgresql://postgres:'+quote(owner,safe='')+'@postgres:5432/'+database
 migration_url='postgresql://doccraft_migrator:'+quote(migrator,safe='')+'@postgres:5432/'+database
 tls_python='?sslmode=verify-full&sslrootcert=/run/secrets/ca.crt';tls_node='?sslmode=require&sslaccept=strict&sslcert=/run/secrets/ca.crt'
 write(s/'migration-python.env','DATABASE_URL='+migration_url+tls_python+'\nADMIN_DATABASE_URL='+migration_url+tls_python+'\nSTAGING_MIGRATION_DATABASE_URL='+migration_url+tls_python+'\n')
 write(s/'migration-node.env','DATABASE_URL='+migration_url+tls_node+'\nDIRECT_URL='+migration_url+tls_node+'\nPG_REQUIRE_TLS=true\nPGSSLROOTCERT=/run/secrets/ca.crt\n')
 write(s/'admin-owner.env','STAGING_MIGRATION_DATABASE_URL='+root_url+tls_python+'\n')
 roles={service:{'password':secrets.token_urlsafe(36)} for service in sorted(DB_SERVICES)};write(s/'runtime-roles.json',json.dumps(roles),0o444)
 for name in PORTS:
  write(s/(name+'.identity.json'),json.dumps(identities[name]),0o444)
  env={'REDIS_URL':redis[name].splitlines()[0].split('=',1)[1].replace('redis://','rediss://')}
  if name in DB_SERVICES:
   url='postgresql://doccraft_'+name.replace('-','_')+':'+quote(roles[name]['password'],safe='')+'@postgres:5432/'+database+(tls_python if name in ['admin-api','analytics','document'] else tls_node)
   env.update(DATABASE_URL=url,DIRECT_URL=url)
   if name=='admin-api':env['ADMIN_DATABASE_URL']=url
  if name=='auth':env.update(JWT_SECRET=secrets.token_urlsafe(48),JWT_REFRESH_SECRET=secrets.token_urlsafe(48))
  if name=='admin-api':env.update(ADMIN_JWT_SECRET=secrets.token_urlsafe(48))
  write(s/(name+'.env'),''.join(k+'='+v+'\n' for k,v in env.items()))
 write(s/'ai-credential-keyring.json',json.dumps({'active_kid':'initial','keys':{'initial':base64.urlsafe_b64encode(os.urandom(32)).decode()}}),0o444)
 # Configuration is generated only after optional integration/bootstrap settings
 # are supplied by the operator. No production-enabled marker is created here.
 print('Prepared fresh private identities, TLS and scoped connection files. No containers started; production remains disabled.')
if __name__=='__main__':main()
