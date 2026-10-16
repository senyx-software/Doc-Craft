"""Capture environmental blockers without changing host security or resources."""
import datetime,json,os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'docs/system-audit/evidence/phase5'
def command(argv,timeout=20):
    try:
        result=subprocess.run(argv,capture_output=True,text=True,timeout=timeout)
        return {'command':argv,'exit_code':result.returncode,'output':(result.stdout+result.stderr)[-3500:]}
    except FileNotFoundError:return {'command':argv,'exit_code':127,'output':'Executable unavailable'}
    except subprocess.TimeoutExpired:return {'command':argv,'exit_code':124,'output':'Timed out'}
def main():
    OUT.mkdir(parents=True,exist_ok=True)
    docker=command(['/run/host/usr/bin/docker','--host','unix:///var/run/docker.sock','info','--format','{{.ServerVersion}}'])
    namespaces=command(['unshare','-Ur','true'])
    host=command(['flatpak-spawn','--host','/bin/true'])
    chrome=Path('/home/eranda/.cache/puppeteer/chrome/linux-131.0.6778.204/chrome-linux64/chrome')
    browser=command([str(chrome),'--headless','--disable-gpu','--dump-dom','about:blank'])
    # Headless Chromium retains its normal sandbox. No privileged workaround.
    result={'checked_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'docker':{'status':'PASS' if docker['exit_code']==0 else 'BLOCKED',**docker},'user_namespaces':namespaces,'host_portal':host,'chromium':{'status':'PASS' if browser['exit_code']==0 else 'BLOCKED',**browser},'process_security':[line for line in Path('/proc/self/status').read_text().splitlines() if line.startswith(('NoNewPrivs:','Seccomp:','CapEff:'))],'socket_presence':{path:Path(path).exists() for path in ['/var/run/docker.sock','/run/docker.sock','/run/user/1000/docker.sock','/run/host/var/run/docker.sock']},'security_bypasses_used':False}
    (OUT/'environment.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
if __name__=='__main__':main()
