#!/usr/bin/env python3
"""Root-owned fixed deployment controller. Never executes uploaded shell code.

SSH accepts a bounded JSON digest manifest on stdin. Production remains gated
by a local operator-created enabled file, in addition to GitHub environment gates.
"""
import argparse,fcntl,json,os,re,signal,subprocess,sys,time,urllib.request,urllib.error
from pathlib import Path
from configure import parse,validate,SERVICES,generate
from operations_alerts import notify

SCHEMA=1
def release_manifest(data,registry):
 if set(data)!={'format','commit','schema_epoch','images'} or data['format']!=1:raise ValueError('Unsupported release manifest')
 if not isinstance(data['commit'],str) or not re.fullmatch(r'[0-9a-f]{40}',data['commit']):raise ValueError('Invalid release commit')
 if type(data['schema_epoch']) is not int or not 1<=data['schema_epoch']<=100000:raise ValueError('Invalid schema compatibility epoch')
 expected=set(SERVICES)|{'migration'}
 if not isinstance(data['images'],dict) or set(data['images'])!=expected:raise ValueError('Incomplete image manifest')
 for name,value in data['images'].items():
  if not isinstance(value,str) or not re.fullmatch(re.escape(registry+'-'+name)+r'@sha256:[0-9a-f]{64}',value):raise ValueError('Unapproved image namespace or mutable image reference')
 return data

def atomic_json(path,value):
 temporary=path.with_suffix('.tmp')
 with open(temporary,'w',opener=lambda p,f:os.open(p,f,0o600)) as out:json.dump(value,out,indent=2)
 os.replace(temporary,path)

class Controller:
 def __init__(self,home,state,control):
  self.home=home;self.state=state;self.control=control
  if not (home/'production-enabled').is_file():raise ValueError('Operator has not enabled production deployment')
  for directory in [home,state,control]:
   mode=directory.stat()
   if mode.st_uid!=0 or mode.st_mode&0o022:raise ValueError('Deployment paths must be root owned and not group/world writable')
  self.config=validate(parse(home/'production.env'));self.log=None
 def validate_release(self,incoming):return release_manifest(incoming,self.config['REGISTRY_PREFIX'])
 def environment(self,release):
  configuration=release.get('configuration',self.config)
  env={k:v for k,v in os.environ.items() if k in ('PATH','DOCKER_CONFIG')}
  env.update(configuration);env.update({'DOCCRAFT_HOME':str(self.home),'DOCCRAFT_CONTROL':str(self.control),'DOCCRAFT_RUNTIME':str(self.home/'runtime'/configuration['CONFIG_VERSION'])})
  env.update({name.upper().replace('-','_')+'_IMAGE':image for name,image in release['images'].items()})
  if configuration['LOCAL_AI_ENABLED']=='true':env['COMPOSE_PROFILES']='local-ai'
  return env
 def compose(self,release,*args,stdout=None,stdin=None):
  command=['docker','compose','--project-name','doccraft','--project-directory',str(self.control),'-f',str(self.control/'deploy/docker/compose.production.yml'),*args]
  critical=any(name in args for name in ('migrate-node','migrate-python','grant-roles')) and 'run' in args
  subprocess.run(command,env=self.environment(release),stdin=stdin if stdin is not None else subprocess.DEVNULL,stdout=stdout if stdout is not None else self.log,stderr=self.log,timeout=None if critical else 1200,check=True)
 def health(self,release):
  self.compose(release,'run','--rm','-T','--no-deps','verify')
  conf=release.get('configuration',self.config)
  for host,path in [(conf['APP_DOMAIN'],'/'),(conf['ADMIN_DOMAIN'],'/'),(conf['APP_DOMAIN'],'/health')]:
   for attempt in range(6):
    try:
     with urllib.request.urlopen('https://'+host+path,timeout=10) as response:
      if response.status==200:break
    except urllib.error.HTTPError as error:
     if host==conf['ADMIN_DOMAIN'] and error.code==403:break
     if attempt==5:raise RuntimeError('Public HTTPS verification failed') from None
     time.sleep(5)
    except Exception:
     if attempt==5:raise RuntimeError('Public HTTPS verification failed') from None
     time.sleep(5)
 def application_services(self,release):return [*SERVICES,'edge']+(['ollama'] if release.get('configuration',self.config)['LOCAL_AI_ENABLED']=='true' else [])
 def diagnostics(self,release):
  # Avoid environment dumps, provider payloads and potentially sensitive logs.
  try:self.compose(release,'ps','--all','--format','json')
  except Exception:pass
 def restore(self,previous,current):
  if not previous or previous['schema_epoch']!=current['schema_epoch']:raise ValueError('No previous schema-compatible release; operator recovery required')
  if previous.get('configuration')!=current.get('configuration'):raise ValueError('Configuration changed; operator must review rollback without restoring revoked credentials or endpoint access')
  epoch_file=self.state/'schema-epoch.json'
  if epoch_file.exists() and json.loads(epoch_file.read_text())['schema_epoch']!=previous['schema_epoch']:raise ValueError('Database epoch prevents application downgrade')
  if (self.state/'migration-blocked.json').exists():raise ValueError('Failed migration requires operator inspection before rollback')
  runtime=self.home/'runtime'/previous['configuration']['CONFIG_VERSION']
  if not runtime.is_dir():raise ValueError('Previous private runtime configuration is unavailable')
  self.compose(previous,'up','-d','--wait','--wait-timeout','180',*self.application_services(previous));self.health(previous)
  atomic_json(self.state/'current.json',previous)
 def deploy(self,incoming):
  release=self.validate_release(incoming);release['configuration']=self.config.copy();release['deployed_at']=int(time.time())
  current=self.state/'current.json';previous=json.loads(current.read_text()) if current.exists() else None
  if (self.state/'migration-blocked.json').exists():raise ValueError('Previous migration failure needs operator review')
  epoch_file=self.state/'schema-epoch.json'
  database_epoch=json.loads(epoch_file.read_text())['schema_epoch'] if epoch_file.exists() else previous['schema_epoch'] if previous else 0
  if release['schema_epoch']<database_epoch:raise ValueError('Release schema epoch is older than the database')
  generate(self.home/'production.env',self.home,self.home/'runtime'/self.config['CONFIG_VERSION'],check_only=True)
  if not (self.home/'runtime'/self.config['CONFIG_VERSION']).is_dir():raise ValueError('Operator must generate the private runtime configuration first')
  if previous and release['commit']==previous['commit'] and release['configuration']==previous['configuration']:return 'already deployed'
  # Never skip image/security validation because containers appear to be running.
  names=[*self.application_services(release),'postgres','redis','migrate-node','migrate-python','grant-roles','verify','backup']
  self.compose(release,'pull',*names)
  self.compose(release,'up','-d','--wait','--wait-timeout','180','postgres','redis')
  backups=self.state/'backups';backups.mkdir(mode=0o700,exist_ok=True)
  backup=backups/(str(int(time.time()))+'-'+release['commit']+'.dump')
  with open(backup,'xb',opener=lambda p,f:os.open(p,f,0o600)) as out:self.compose(release,'run','--rm','-T','--no-deps','backup',stdout=out)
  if backup.stat().st_size<32:raise RuntimeError('Database backup was empty')
  with backup.open('rb') as source:self.compose(release,'run','--rm','-T','--no-deps','--entrypoint','pg_restore','backup','--list',stdin=source)
  # A single host flock encloses backup, all migration systems and application rollout.
  # Application rollback never restores a database or reverses schema migrations.
  atomic_json(epoch_file,{'schema_epoch':release['schema_epoch'],'commit':release['commit'],'backup':backup.name})
  try:
   self.compose(release,'run','--rm','-T','--no-deps','migrate-node')
   self.compose(release,'run','--rm','-T','--no-deps','migrate-python')
   self.compose(release,'run','--rm','-T','--no-deps','grant-roles')
  except Exception:
   self.diagnostics(release)
   atomic_json(self.state/'failure.json',{'commit':release['commit'],'at':int(time.time()),'phase':'migration','outcome':'rollout stopped; backup retained; schema recovery requires operator review'})
   atomic_json(self.state/'migration-blocked.json',{'commit':release['commit'],'schema_epoch':release['schema_epoch'],'backup':backup.name,'reason':'Inspect/reconcile schema before an operator clears this marker'})
   raise RuntimeError('Migration failed; rollout stopped, database backup retained; operator inspection required') from None
  if previous:atomic_json(self.state/'previous.json',previous)
  atomic_json(self.state/'attempted.json',release)
  try:
   self.compose(release,'up','-d','--wait','--wait-timeout','180',*self.application_services(release));self.health(release)
  except Exception:
   self.diagnostics(release)
   try:self.restore(previous,release);outcome='previous compatible application restored'
   except Exception:outcome='automatic rollback unavailable or failed; operator recovery required'
   atomic_json(self.state/'failure.json',{'commit':release['commit'],'at':int(time.time()),'outcome':outcome})
   raise RuntimeError('Deployment failed; '+outcome) from None
  atomic_json(current,release);return 'deployed and verified'

def main():
 parser=argparse.ArgumentParser();parser.add_argument('action',choices=['deploy','rollback','health','monitor']);parser.add_argument('--home',type=Path,default=Path('/etc/doccraft'));parser.add_argument('--state',type=Path,default=Path('/var/lib/doccraft'));parser.add_argument('--control',type=Path,default=Path('/opt/doccraft/control'));a=parser.parse_args()
 if os.geteuid()!=0:print('Only the installed root-owned controller may access deployment state',file=sys.stderr);return 1
 # SSH disconnects and workflow cancellation must not abandon a migration and
 # release its host lock while the one-shot container continues changing schema.
 for name in ('SIGHUP','SIGINT','SIGTERM'):signal.signal(getattr(signal,name),signal.SIG_IGN)
 os.umask(0o077)
 try:
  a.state.mkdir(mode=0o700,parents=True,exist_ok=True)
  with (a.state/'deployment.lock').open('a') as lock:
   fcntl.flock(lock,fcntl.LOCK_EX)
   controller=Controller(a.home,a.state,a.control)
   logs=a.state/('monitor-logs' if a.action=='monitor' else 'diagnostics');logs.mkdir(mode=0o700,exist_ok=True)
   # Retain a bounded number of private controller logs; application log retention is Docker-managed.
   for old in sorted(logs.glob('*.log'))[:-19]:old.unlink()
   with (logs/(str(time.time_ns())+'.log')).open('w') as log:
    controller.log=log
    if a.action=='deploy':
     text=sys.stdin.buffer.read(65537)
     if len(text)>65536:raise ValueError('Release manifest too large')
     print(controller.deploy(json.loads(text)))
    elif a.action=='rollback':
     current=json.loads((a.state/'current.json').read_text());previous=json.loads((a.state/'previous.json').read_text());controller.restore(previous,current);print('Previous compatible application restored and verified')
    elif a.action=='health':controller.health(json.loads((a.state/'current.json').read_text()));print('Release readiness verified')
    else:
     current=json.loads((a.state/'current.json').read_text())
     for filename,args in [('monitor-containers.json',('ps','--all','--format','json')),('monitor-resources.jsonl',('stats','--no-stream','--format','json'))]:
      with (a.state/filename).open('w') as output:controller.compose(current,*args,stdout=output)
     disk=os.statvfs(a.state);memory={l.split(':')[0]:int(l.split()[1]) for l in Path('/proc/meminfo').read_text().splitlines() if l.startswith(('MemTotal:','MemAvailable:','SwapFree:'))}
     alerts=[]
     if disk.f_bavail/max(1,disk.f_blocks)<.15:alerts.append('disk_below_15_percent')
     if memory.get('MemAvailable',0)<512*1024:alerts.append('host_memory_below_512MiB')
     snapshot={'time':int(time.time()),'commit':current['commit'],'disk_free_bytes':disk.f_bavail*disk.f_frsize,'load_average':os.getloadavg(),'memory':memory,'alerts':alerts}
     # Monitor every relevant filesystem, not only the deployment-state mount.
     for directory in [a.home,Path('/var/lib/docker')]:
      if directory.exists():
       usage=os.statvfs(directory)
       if usage.f_bavail/max(1,usage.f_blocks)<.15:snapshot['alerts'].append('storage_below_15_percent')
     backup=a.state/'backup-last-success.json'
     if not backup.exists() or time.time()-json.loads(backup.read_text()).get('at',0)>7200:snapshot['alerts'].append('offhost_backup_missing_or_stale')
     raw=(a.state/'monitor-containers.json').read_text().strip()
     containers=json.loads(raw) if raw.startswith('[') else [json.loads(line) for line in raw.splitlines() if line.strip()]
     expected=set(controller.application_services(current))|{'postgres','redis'}
     running={item.get('Service') for item in containers if item.get('State')=='running' and item.get('Health') not in ('unhealthy','starting')}
     if expected-running:snapshot['alerts'].append('container_not_ready')
     atomic_json(a.state/'monitor.json',snapshot)
     atomic_json(a.state/'monitor-delivery.json',notify(a.home,snapshot))
     print('Private monitoring snapshot recorded')

 except Exception as error:
  # Deliberately omit exception payloads/URLs/env, which can contain credentials.
  print('Deployment operation failed ('+type(error).__name__+'); inspect restricted diagnostics and failure.json on the VPS',file=sys.stderr);return 1
 return 0
if __name__=='__main__':sys.exit(main())
