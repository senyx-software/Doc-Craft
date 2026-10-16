"""Offline artifact/certificate checks; does not claim any container started."""
import argparse,json,subprocess
from pathlib import Path

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('directory',type=Path);parser.add_argument('--compose',type=Path);args=parser.parse_args()
    root=args.directory.resolve();config=json.loads((root/'compose.yaml').read_text());checks=[]
    def check(name,condition):
        checks.append({'check':name,'passed':bool(condition)})
        if not condition:raise ValueError(name)
    check('private staging output',(root.stat().st_mode&0o077)==0)
    check('no CA signing key mounted',all(not value['file'].endswith('ca.key') for value in config['secrets'].values()))
    check('separate internal backend',config['networks']['backend']['internal'] is True)
    for name,service in config['services'].items():
        if name!='edge':check(name+' has no host listener',not service.get('ports'))
        if name in ('postgres','redis'):check(name+' has no external egress',service['networks']==['backend'])
        if name in ('gateway','auth','notification','document','payment','quota','chat','analytics','admin-api','pdf'):
            check(name+' requires TLS',service['environment']['SERVICE_REQUIRE_TLS']=='true')
            check(name+' authenticated Redis TLS',service['environment']['REDIS_URL'].startswith('rediss://'+name+':'))
            files=service['env_file'];check(name+' never receives owner database credentials',not any('migration-' in str(value) for value in files))
            check(name+' receives only its service identity',len([s for s in service['secrets'] if s['target']=='service_identity'])==1)
        if name=='pdf':check('PDF isolated without added capabilities',service['networks']==['backend'] and service['cap_drop']==['ALL'] and not service.get('cap_add'))
    for leaf in (root/'tls').glob('*.crt'):
        if leaf.name=='ca.crt':continue
        identity=leaf.stem;hostname='user.doccraft.test' if identity=='edge' else identity
        completed=subprocess.run(['openssl','verify','-CAfile',str(root/'tls/ca.crt'),'-verify_hostname',hostname,str(leaf)],capture_output=True)
        check(identity+' certificate chain and hostname validation',completed.returncode==0)
    bad=subprocess.run(['openssl','verify','-CAfile',str(root/'tls/ca.crt'),'-verify_hostname','unrelated.invalid',str(root/'tls/auth.crt')],capture_output=True)
    check('wrong service hostname is rejected',bad.returncode!=0)
    if args.compose:
        completed=subprocess.run([str(args.compose.resolve()),'-f',str(root/'compose.yaml'),'config','--quiet'],capture_output=True)
        check('Docker Compose configuration validation',completed.returncode==0)
    print(json.dumps({'scope':'Offline artifacts only; no image build, container startup or provider workflow verified','checks':checks},indent=2))

if __name__=='__main__':main()
