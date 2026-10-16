"""Generate a NEW isolated staging project with fresh secrets and private TLS.

Never reads developer/provider .env files. Does not start containers or contact
providers. Output lives in a private ignored directory; never overwrite it.
"""
import argparse,json,os,secrets,subprocess,sys
from pathlib import Path
from urllib.parse import quote
from create_service_credentials import generate
from create_redis_credentials import generate as redis_credentials
ROOT=Path(__file__).resolve().parents[1]
PORTS={'gateway':3001,'auth':3011,'notification':3012,'document':3013,'payment':3014,'quota':3015,'chat':3016,'analytics':3017,'admin-api':3018,'pdf':3023}

def private(path,value):
    path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
    with open(path,'x',opener=lambda p,f:os.open(p,f,0o600)) as stream:stream.write(value)

def run(args):subprocess.run(list(map(str,args)),check=True,capture_output=True)

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,default=ROOT/'.local/staging');args=parser.parse_args()
    output=args.output.resolve();output.mkdir(mode=0o700,parents=True,exist_ok=False)
    tls=output/'tls';tls.mkdir(mode=0o700)
    run(['openssl','req','-x509','-newkey','rsa:3072','-nodes','-keyout',tls/'ca.key','-out',tls/'ca.crt','-subj','/CN=DocCraft isolated staging CA','-days','90','-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign'])
    secrets_config={}
    for identity in [*PORTS,'postgres','redis','edge']:
        names=[identity] if identity!='edge' else ['user.doccraft.test','admin.doccraft.test']
        run(['openssl','req','-newkey','rsa:2048','-nodes','-keyout',tls/(identity+'.key'),'-out',tls/(identity+'.csr'),'-subj','/CN='+names[0]])
        extensions='subjectAltName='+','.join('DNS:'+name for name in names)+'\nbasicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n'
        (tls/(identity+'.ext')).write_text(extensions)
        run(['openssl','x509','-req','-in',tls/(identity+'.csr'),'-CA',tls/'ca.crt','-CAkey',tls/'ca.key','-CAcreateserial','-out',tls/(identity+'.crt'),'-days','30','-extfile',tls/(identity+'.ext')])
        for suffix in ('key','crt'):secrets_config[identity+'_'+suffix]={'file':str(tls/(identity+'.'+suffix))}
        if identity in ('postgres','redis','edge'):os.chmod(tls/(identity+'.key'),0o444) # private parent directory; only selected secrets are mounted
    secrets_config['ca']={'file':str(tls/'ca.crt')}
    identities=generate()
    for name,identity in identities.items():
        private(output/'identities'/(name+'.json'),json.dumps(identity))
        secrets_config[name+'_identity']={'file':str(output/'identities'/(name+'.json'))}
    redis_env=redis_credentials(output/'redis','redis',6379)
    secrets_config['redis_acl']={'file':str(output/'redis/redis.acl')}
    os.chmod(output/'redis/redis.acl',0o444)
    password=secrets.token_urlsafe(36);database='doccraft_staging_'+secrets.token_hex(5)
    private(output/'postgres-password',password);os.chmod(output/'postgres-password',0o444)
    secrets_config['postgres_password']={'file':str(output/'postgres-password')}
    owner_url='postgresql://postgres:'+quote(password,safe='')+'@postgres:5432/'+database
    private(output/'migration-node.env','DATABASE_URL='+owner_url+'?sslmode=require&sslaccept=strict&sslcert=/run/secrets/ca.crt\nDIRECT_URL='+owner_url+'?sslmode=require&sslaccept=strict&sslcert=/run/secrets/ca.crt\nPG_REQUIRE_TLS=true\nPGSSLROOTCERT=/run/secrets/ca.crt\n')
    private(output/'migration-python.env','DATABASE_URL='+owner_url+'?sslmode=verify-full&sslrootcert=/run/secrets/ca.crt\nADMIN_DATABASE_URL='+owner_url+'?sslmode=verify-full&sslrootcert=/run/secrets/ca.crt\nSTAGING_MIGRATION_DATABASE_URL='+owner_url+'?sslmode=verify-full&sslrootcert=/run/secrets/ca.crt\n')
    urls={key:'https://'+name+':'+str(PORTS[name]) for key,name in {'GATEWAY_URL':'gateway','AUTH_SERVICE_URL':'auth','NOTIFICATION_SERVICE_URL':'notification','DOCUMENT_SERVICE_URL':'document','PAYMENT_SERVICE_URL':'payment','BILLING_SERVICE_URL':'payment','QUOTA_SERVICE_URL':'quota','AI_SERVICE_URL':'chat','CHAT_SERVICE_URL':'chat','ANALYTICS_SERVICE_URL':'analytics','ADMIN_API_SERVICE_URL':'admin-api','ADMIN_API_URL':'admin-api'}.items()}
    common={**urls,'SIDECAR_URL':'https://pdf:3023/generate','CHAT_SERVICE_MCP_URL':'https://chat:3016/internal/resources','ENV':'production','NODE_ENV':'production','ALLOWED_ORIGINS':'["https://admin.doccraft.test:8443","https://user.doccraft.test:8443"]','CORS_ORIGINS':'https://user.doccraft.test:8443,https://admin.doccraft.test:8443','FRONTEND_URL':'https://user.doccraft.test:8443','SERVICE_AUTH_CONFIG_FILE':'/run/secrets/service_identity','SERVICE_TLS_CERT_FILE':'/run/secrets/service.crt','SERVICE_TLS_KEY_FILE':'/run/secrets/service.key','SERVICE_REQUIRE_TLS':'true','NODE_EXTRA_CA_CERTS':'/run/secrets/ca.crt','SSL_CERT_FILE':'/run/secrets/ca.crt','REQUESTS_CA_BUNDLE':'/run/secrets/ca.crt','PG_REQUIRE_TLS':'true','PGSSLROOTCERT':'/run/secrets/ca.crt','ADMIN_RUN_MIGRATIONS':'false','DOCUMENT_RUN_MIGRATIONS':'false','NOTIFICATION_RUN_MIGRATIONS':'false','LOCAL_STORAGE_DIR':'/app/storage','IP_WHITELIST_ENABLED':'true','TRUSTED_PROXY_IPS':'[]'}
    # Stable dedicated signing credentials are generated for this staging project only.
    private(output/'auth.env','JWT_SECRET='+secrets.token_urlsafe(48)+'\nJWT_REFRESH_SECRET='+secrets.token_urlsafe(48)+'\n')
    private(output/'admin-api.env','ADMIN_JWT_SECRET='+secrets.token_urlsafe(48)+'\n')
    for service in PORTS:
        private(output/'providers'/(service+'.env'),'# Operator injects only approved staging keys for this service. No production keys.\n')
    base={'init':True,'restart':'unless-stopped','stop_grace_period':'45s','security_opt':['no-new-privileges:true'],'cap_drop':['ALL'],'networks':['backend'],'tmpfs':['/tmp'],'pids_limit':256}
    services={}
    for name,port in PORTS.items():
        python=name in ('document','analytics','admin-api');identity=name
        build={'context':str(ROOT),'dockerfile':'deploy/staging/Python.Dockerfile' if python else 'deploy/staging/Backend.Dockerfile'}
        if not python:build['target']='pdf' if name=='pdf' else 'runtime'
        env={**common,'PORT':str(port),'REDIS_URL':redis_env[name].splitlines()[0].split('=',1)[1].replace('redis://','rediss://')}
        if name=='pdf':env.update({'SIDECAR_PORT':str(port),'SIDECAR_HOST':'0.0.0.0','PDF_MAX_CONCURRENT':'2'})
        files=[{'path':str(output/'runtime'/(name+'-database.env')),'required':False},str(output/'providers'/(name+'.env'))]
        if name in ('auth','admin-api'):files.append(str(output/(name+'.env')))
        selected=[{'source':'ca','target':'ca.crt'},{'source':name+'_identity','target':'service_identity'},{'source':name+'_crt','target':'service.crt'},{'source':name+'_key','target':'service.key'}]
        command=['python','-m','uvicorn','app.main:app','--host','0.0.0.0','--port',str(port),'--ssl-keyfile','/run/secrets/service.key','--ssl-certfile','/run/secrets/service.crt','--timeout-graceful-shutdown','10'] if python else ['node',f'/app/services/{"document" if name=="pdf" else name}/dist/{"puppeteer/server.js" if name=="pdf" else "index.js" if name=="gateway" else "server.js"}']
        service={**base,'build':build,'environment':env,'env_file':files,'secrets':selected,'command':command,'working_dir':'/app/services/'+('document' if name=='pdf' else name),'depends_on':{'redis':{'condition':'service_healthy'},'postgres':{'condition':'service_healthy'}}}
        if name in ('chat','payment','notification','auth','document','analytics','admin-api'):service['networks']=['backend','egress']
        if name=='document':service['volumes']=[str(output/'storage')+':/app/storage']
        if name=='pdf':service.update({'mem_limit':'768m','cpus':1,'shm_size':'256m'})
        services[name]=service
    services['postgres']={'image':'postgres:17-bookworm','restart':'unless-stopped','entrypoint':['/bin/sh','/staging/postgres-entrypoint.sh'],'command':['postgres','-c','ssl=on','-c','ssl_cert_file=/run/doccraft-tls/server.crt','-c','ssl_key_file=/run/doccraft-tls/server.key','-c','ssl_min_protocol_version=TLSv1.2','-c','hba_file=/staging/pg_hba.conf'],'environment':{'POSTGRES_DB':database,'POSTGRES_PASSWORD_FILE':'/run/secrets/postgres_password','POSTGRES_INITDB_ARGS':'--auth-host=scram-sha-256'},'secrets':[{'source':'postgres_password','target':'postgres_password'},{'source':'postgres_key','target':'postgres.key'},{'source':'postgres_crt','target':'postgres.crt'}],'volumes':['postgres:/var/lib/postgresql/data',str(ROOT/'deploy/staging')+':/staging:ro'],'networks':['backend'],'healthcheck':{'test':['CMD','pg_isready','-U','postgres','-d',database],'interval':'5s','timeout':'3s','retries':20}}
    services['redis']={'image':'redis:7-alpine','restart':'unless-stopped','command':['redis-server','--port','0','--tls-port','6379','--tls-cert-file','/run/secrets/redis.crt','--tls-key-file','/run/secrets/redis.key','--tls-ca-cert-file','/run/secrets/ca.crt','--tls-auth-clients','no','--aclfile','/run/secrets/redis.acl','--appendonly','yes','--appendfsync','always','--maxmemory-policy','noeviction'],'env_file':[str(output/'redis/redis-health.env')],'secrets':[{'source':'ca','target':'ca.crt'},{'source':'redis_key','target':'redis.key'},{'source':'redis_crt','target':'redis.crt'},{'source':'redis_acl','target':'redis.acl'}],'volumes':['redis:/data'],'networks':['backend'],'healthcheck':{'test':['CMD','redis-cli','--tls','--cacert','/run/secrets/ca.crt','--user','health','ping'],'interval':'5s','timeout':'3s','retries':20}}
    for name,app in [('user-ui','user-frontend'),('admin-ui','admin')]:
        services[name]={**base,'build':{'context':str(ROOT),'dockerfile':'deploy/staging/Frontend.Dockerfile','args':{'APP':app}}}
    caddy=''
    for host,ui,backend,path in [('user.doccraft.test','user-ui','gateway','/v1/*'),('admin.doccraft.test','admin-ui','admin-api','/api/v1/*')]:
        caddy+=f'''https://{host}:8443 {{
 tls /run/secrets/edge.crt /run/secrets/edge.key
 header {{
  X-Content-Type-Options nosniff
  Referrer-Policy strict-origin-when-cross-origin
 }}
 handle {path} {{
  reverse_proxy https://{backend}:{PORTS[backend]} {{
   flush_interval -1
   transport http {{
    tls_trust_pool file /run/secrets/ca.crt
   }}
  }}
 }}
 handle {{
  reverse_proxy {ui}:8080
 }}
}}
'''
    private(output/'Caddyfile',caddy);os.chmod(output/'Caddyfile',0o444)
    services['edge']={**base,'image':'caddy:2-alpine','user':'1000:1000','environment':{'XDG_CONFIG_HOME':'/tmp/config','XDG_DATA_HOME':'/tmp/data'},'ports':['127.0.0.1:8443:8443'],'volumes':[str(output/'Caddyfile')+':/etc/caddy/Caddyfile:ro'],'secrets':[{'source':'ca','target':'ca.crt'},{'source':'edge_crt','target':'edge.crt'},{'source':'edge_key','target':'edge.key'}],'networks':['backend','egress']}
    for name,python in [('migrate-node',False),('migrate-python',True),('provision-roles',True)]:
        service={**services['admin-api' if python else 'payment'],'restart':'no','profiles':['tools'],'environment':{**common,'SERVICE_REQUIRE_TLS':'false','ADMIN_RUN_MIGRATIONS':'true','DOCUMENT_RUN_MIGRATIONS':'true'},'env_file':[str(output/('migration-python.env' if python else 'migration-node.env')),str(output/'admin-api.env')],'command':['python','/app/scripts/staging_migrate_python.py'] if name=='migrate-python' else ['python','/app/scripts/staging_database_roles.py','--output','/runtime'] if python else ['node','/app/scripts/staging_migrate_node.mjs']}
        service['volumes']=[str(output/'runtime')+':/runtime']
        services[name]=service
    (output/'runtime').mkdir(mode=0o700)
    (output/'storage').mkdir(mode=0o700)
    config={'name':'doccraft-stage-'+secrets.token_hex(4),'services':services,'secrets':secrets_config,'networks':{'backend':{'internal':True},'egress':{}},'volumes':{'postgres':{},'redis':{},'documents':{}}}
    private(output/'compose.yaml',json.dumps(config,indent=2))
    private(output/'manifest.json',json.dumps({'database':database,'project':config['name'],'provider_keys_copied':False,'container_builds_verified':False},indent=2))
    print('Prepared isolated staging files at '+str(output)+'. No provider keys copied; no containers started.')

if __name__=='__main__':main()
