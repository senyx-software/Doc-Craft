"""Controller policy tests with a fake executor; these are not Docker deployments."""
import copy,importlib.util,json,os,re,sys,tempfile,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT/'deploy/scripts'))
from configure import PORTS,DB_SERVICES,REQUIRED_SECRETS,parse,validate,generate,SERVICES
from controller import Controller,release_manifest

REGISTRY='ghcr.io/example/doccraft'
def manifest(char='a',epoch=1):return {'format':1,'commit':char*40,'schema_epoch':epoch,'images':{s:REGISTRY+'-'+s+'@sha256:'+char*64 for s in [*SERVICES,'migration']}}

class Configuration(unittest.TestCase):
 def setUp(self):
  self.temp=tempfile.TemporaryDirectory();self.home=Path(self.temp.name);self.secrets=self.home/'secrets';self.secrets.mkdir(mode=0o700)
  self.values={'APP_DOMAIN':'app.example.com','ADMIN_DOMAIN':'admin.example.com','ADMIN_ALLOWED_CIDRS':'192.0.2.10/32','ACME_EMAIL':'ops@example.com','RESEND_FROM_EMAIL':'mail@example.com','CONFIG_VERSION':'fixture1','REGISTRY_PREFIX':REGISTRY,'POSTGRES_DB':'doccraft_staging_ci','LOCAL_AI_ENABLED':'false'}
  self.config=self.home/'production.env';self.write(self.config,''.join(k+'='+v+'\n' for k,v in self.values.items()))
  for service in PORTS:
   creds={k:'fixture-'+service+'-credential-00000000000000' for k in REQUIRED_SECRETS[service]}
   creds['REDIS_URL']='rediss://'+service+':fixture-password-0000000000000000@redis:6379'
   for key in ('DATABASE_URL','DIRECT_URL','ADMIN_DATABASE_URL'):
    if key in creds:creds[key]='postgresql://'+service+':fixture-password-0000000000000000@postgres:5432/doccraft_staging_ci?sslmode=verify-full'
   self.write(self.secrets/(service+'.env'),''.join(k+'='+v+'\n' for k,v in creds.items()))
   for suffix in ['.crt','.key']:self.write(self.secrets/(service+suffix),'fixture-only')
   self.write(self.secrets/(service+'.identity.json'),json.dumps({'identity':service}))
  for filename in ['ca.crt','postgres-password','postgres.crt','postgres.key','redis.crt','redis.key','redis.acl','migration-node.env','migration-python.env','redis-health.env']:self.write(self.secrets/filename,'fixture-only')
  self.write(self.secrets/'ai-credential-keyring.json',json.dumps({'active_kid':'fixture','keys':{'fixture':'eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg='}}))
 def write(self,path,text):path.write_text(text);path.chmod(0o600)
 def tearDown(self):self.temp.cleanup()
 def test_scoped_runtime_generation_and_immutable_version(self):
  output=self.home/'runtime/fixture1';generate(self.config,self.home,output)
  auth=parse(output/'auth.env');chat=parse(output/'chat.env');pdf=parse(output/'pdf.env');admin=parse(output/'admin-api.env')
  self.assertNotIn('JWT_SECRET',chat);self.assertNotIn('DATABASE_URL',pdf);self.assertNotIn('ADMIN_JWT_SECRET',auth)
  self.assertEqual(admin['AI_CREDENTIAL_KEYRING_FILE'],'/run/secrets/ai_credential_keyring')
  self.assertEqual(auth['AUTH_SERVICE_URL'] if 'AUTH_SERVICE_URL' in auth else auth['ADMIN_API_SERVICE_URL'],'https://admin-api:3018')
  self.assertEqual((output/'auth.env').stat().st_mode&0o777,0o600)
  generate(self.config,self.home,output,check_only=True)
  with self.assertRaises(ValueError):generate(self.config,self.home,output)
  with (self.secrets/'auth.env').open('a') as stream:stream.write('RESEND_API_KEY=synthetic-credential-not-active\n')
  with self.assertRaises(ValueError):generate(self.config,self.home,output,check_only=True)
 def test_master_secret_keys_are_rejected_in_central_public_configuration(self):
  with self.assertRaises(ValueError):validate({**self.values,'ADMIN_JWT_SECRET':'fixture'})
 def test_unapproved_scoped_secret_rejected(self):
  with (self.secrets/'pdf.env').open('a') as stream:stream.write('ADMIN_JWT_SECRET=fixture\n')
  with self.assertRaises(ValueError):generate(self.config,self.home,self.home/'out')
 def test_unsafe_permissions_rejected(self):
  (self.secrets/'auth.env').chmod(0o644)
  with self.assertRaises(ValueError):generate(self.config,self.home,self.home/'out')
 def test_symlink_secret_rejected(self):
  p=self.secrets/'auth.env';p.rename(p.with_suffix('.original'));p.symlink_to(p.with_suffix('.original'))
  with self.assertRaises(ValueError):generate(self.config,self.home,self.home/'out')
 def test_duplicate_and_shell_expansion_rejected(self):
  for content in ['APP_DOMAIN=a\nAPP_DOMAIN=b\n','APP_DOMAIN=${PRIVATE}\n','export APP_DOMAIN=a\n']:
   self.write(self.config,content)
   with self.assertRaises(ValueError):parse(self.config)
 def test_unapproved_domains_and_registry_rejected(self):
  for key,value in [('APP_DOMAIN','bad.example; touch /tmp/x'),('REGISTRY_PREFIX','ghcr.io/other/unapproved'),('LOCAL_AI_ENABLED','yes'),('ADMIN_ALLOWED_CIDRS',' '),('ADMIN_ALLOWED_CIDRS','0.0.0.0/0'),('GOOGLE_CALLBACK_URL','http://app.example.com/callback'),('PAYMENT_SERVICE_PUBLIC_URL','https://unapproved.example.com')]:
   with self.assertRaises(ValueError):validate({**self.values,key:value})
 def test_plain_redis_rejected(self):
  path=self.secrets/'pdf.env';self.write(path,'REDIS_URL=redis://redis:6379\n')
  with self.assertRaises(ValueError):generate(self.config,self.home,self.home/'out')

class Releases(unittest.TestCase):
 def test_complete_digest_allowlist(self):self.assertEqual(release_manifest(manifest(),REGISTRY)['commit'],'a'*40)
 def test_mutable_foreign_and_missing_images_rejected(self):
  for value in ['ghcr.io/example/doccraft-chat:latest','ghcr.io/other/doccraft-chat@sha256:'+'a'*64,REGISTRY+'-chat@sha256:bad']:
   item=manifest();item['images']['chat']=value
   with self.assertRaises(ValueError):release_manifest(item,REGISTRY)
  item=manifest();item['images'].pop('pdf')
  with self.assertRaises(ValueError):release_manifest(item,REGISTRY)
 def test_arbitrary_command_and_commit_injection_rejected(self):
  for item in [{**manifest(),'command':'rm -rf /'},{**manifest(),'commit':'$(id)'},{**manifest(),'schema_epoch':True}]:
   with self.assertRaises(ValueError):release_manifest(item,REGISTRY)
 def test_schema_rollback_guard_prevents_execution(self):
  controller=object.__new__(Controller)
  with self.assertRaises(ValueError):controller.restore(manifest(epoch=1),manifest(epoch=2))
 def test_compose_network_secret_and_image_invariants(self):
  c=json.loads((ROOT/'deploy/docker/compose.production.yml').read_text())
  for name,service in c['services'].items():
   if name!='edge':self.assertFalse(service.get('ports'),name)
   self.assertNotIn('build',service)
   self.assertTrue('@sha256:' in service['image'] or re.fullmatch(r'\$\{[A-Z_]+_IMAGE:\?[^}]*}',service['image']))
  self.assertTrue(c['networks']['backend']['internal']);self.assertTrue(c['networks']['inference']['internal'])
  for name in PORTS:
   s=c['services'][name];self.assertIn('mem_limit',s);self.assertIn('cpus',s);self.assertEqual(s['logging']['options']['max-file'],'3')
   sources=[v['source'] for v in s['secrets']]
   self.assertIn(name+'_service_identity',sources)
   self.assertEqual('ai_keyring' in sources,name=='admin-api')
   self.assertFalse(any(':/etc/doccraft' in v for v in s.get('volumes',[])))
 def test_configuration_schema_matches_authoritative_template(self):
  schema=json.loads((ROOT/'deploy/config/config.schema.json').read_text());template={key:None for key in re.findall(r'^#? ?([A-Z][A-Z0-9_]*)=',(ROOT/'deploy/config/production.env.example').read_text(),re.M)}
  self.assertEqual(set(template),set(schema['properties']))
  self.assertFalse(set(template)&{'DATABASE_URL','JWT_SECRET','ADMIN_JWT_SECRET','GROQ_API_KEY'})
 def test_internal_service_urls_consumed_by_applications_are_supplied(self):
  from configure import USES,URLS
  for service in PORTS:
   if service=='pdf':continue
   sources=ROOT/'services'/service/('app' if service in ('admin-api','analytics','document') else 'src')
   used=set()
   for path in sources.rglob('*'):
    if not path.is_file() or path.suffix not in ('.ts','.py') or 'generated' in path.parts or '__tests__' in path.parts or '.test.' in path.name:continue
    text=path.read_text()
    for name in URLS:
     if name in text:used.add(name)
   self.assertFalse(used-set(USES[service]),service+': missing internal endpoint configuration')

class Rollout(Configuration):
 def fake(self):
  controller=object.__new__(Controller);controller.home=self.home;controller.state=self.home/'state';controller.state.mkdir();controller.control=ROOT;controller.config=self.values;controller.log=None;controller.calls=[]
  generate(self.config,self.home,self.home/'runtime/fixture1')
  def compose(release,*args,stdout=None,stdin=None):
   controller.calls.append((release['commit'],args))
   if stdout is not None:stdout.write(b'fixture database backup, not a real dump'*3)
  controller.compose=compose;controller.health=lambda release:None
  return controller
 def test_backup_migrations_grants_precede_rollout(self):
  c=self.fake();self.assertEqual(c.deploy(manifest()),'deployed and verified');args=[a for _,a in c.calls]
  self.assertLess(next(i for i,a in enumerate(args) if 'backup' in a and 'run' in a),next(i for i,a in enumerate(args) if 'migrate-node' in a and 'run' in a))
  self.assertLess(next(i for i,a in enumerate(args) if 'grant-roles' in a and 'run' in a),next(i for i,a in enumerate(args) if 'edge' in a and 'up' in a))
 def test_health_failure_restores_previous_application_and_reports_failure(self):
  c=self.fake();c.deploy(manifest('a'))
  def health(release):
   if release['commit']=='b'*40:raise RuntimeError('fixture readiness failure')
  c.health=health
  with self.assertRaises(RuntimeError):c.deploy(manifest('b'))
  self.assertEqual(json.loads((c.state/'current.json').read_text())['commit'],'a'*40)
  self.assertIn('restored',json.loads((c.state/'failure.json').read_text())['outcome'])
 def test_migration_failure_never_restores_database_or_starts_rollout(self):
  c=self.fake();original=c.compose
  def fail(release,*args,**kwargs):
   original(release,*args,**kwargs)
   if 'migrate-python' in args and 'run' in args:raise RuntimeError('fixture migration failure')
  c.compose=fail
  with self.assertRaises(RuntimeError):c.deploy(manifest())
  self.assertFalse(any('edge' in args and 'up' in args for _,args in c.calls))
  self.assertFalse((c.state/'current.json').exists())
  self.assertTrue((c.state/'migration-blocked.json').exists())
  with self.assertRaises(ValueError):c.deploy(manifest('b'))
 def test_old_release_cannot_downgrade_persisted_database_epoch(self):
  c=self.fake();c.deploy(manifest('a',epoch=2));before=len(c.calls)
  with self.assertRaises(ValueError):c.deploy(manifest('b',epoch=1))
  self.assertEqual(len(c.calls),before)
 def test_failed_new_epoch_prevents_later_old_release(self):
  c=self.fake();c.deploy(manifest('a',epoch=1))
  c.health=lambda release:(_ for _ in ()).throw(RuntimeError('fixture health failure'))
  with self.assertRaises(RuntimeError):c.deploy(manifest('b',epoch=2))
  self.assertEqual(json.loads((c.state/'schema-epoch.json').read_text())['schema_epoch'],2)
  with self.assertRaises(ValueError):c.deploy(manifest('c',epoch=1))
 def test_rollback_cannot_restore_old_credential_or_endpoint_configuration(self):
  c=self.fake();previous={**manifest('a'),'configuration':self.values};current={**manifest('b'),'configuration':{**self.values,'CONFIG_VERSION':'new-credentials'}}
  with self.assertRaises(ValueError):c.restore(previous,current)
  self.assertFalse(c.calls)

if __name__=='__main__':unittest.main()
