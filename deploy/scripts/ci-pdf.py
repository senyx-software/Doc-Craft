"""Real two-client renderer regression against disposable CI Redis.

The test-only Chrome launcher disables sandboxing for synthetic HTML. Production
renderer sandbox settings remain unchanged and require separate Docker acceptance.
"""
import concurrent.futures,json,os,shutil,socket,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2];sys.path.insert(0,str(ROOT));sys.path.insert(0,str(ROOT/'scripts'))
from create_service_credentials import generate
from shared.service_auth import service_request
import httpx

def main():
 chrome=os.getenv('PUPPETEER_EXECUTABLE_PATH') or shutil.which('google-chrome')
 if not chrome:raise RuntimeError('CI Chromium executable is required')
 with tempfile.TemporaryDirectory(prefix='doccraft-ci-render-') as folder:
  work=Path(folder);launcher=work/'chrome'
  # Use a structured Python exec wrapper so paths cannot introduce shell syntax.
  launcher.write_text('#!'+sys.executable+'\nimport os,sys\nos.execv('+repr(chrome)+',['+repr(chrome)+',"--no-sandbox",*sys.argv[1:]])\n');launcher.chmod(0o700)
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  identities=generate();redis=os.environ['CI_REDIS_URL'];os.environ['SERVICE_AUTH_CONFIG_JSON']=json.dumps(identities['document'])
  env={k:v for k,v in os.environ.items() if k in ('PATH','HOME','LANG')}
  env.update(NODE_ENV='test',SIDECAR_PORT=str(port),SIDECAR_HOST='127.0.0.1',PDF_MAX_CONCURRENT='2',REDIS_URL=redis,SERVICE_REQUIRE_TLS='false',SERVICE_AUTH_CONFIG_JSON=json.dumps(identities['pdf']),PUPPETEER_EXECUTABLE_PATH=str(launcher))
  with (work/'pdf.log').open('w') as log:
   child=subprocess.Popen(['node',str(ROOT/'services/document/dist/puppeteer/server.js')],env=env,stdout=log,stderr=subprocess.STDOUT)
   try:
    for _ in range(100):
     if child.poll() is not None:raise RuntimeError('CI renderer exited')
     try:
      if httpx.get(f'http://127.0.0.1:{port}/health',timeout=1).status_code==200:break
     except httpx.HTTPError:pass
     time.sleep(.1)
    def render(index):
     response=service_request('pdf','POST',f'http://127.0.0.1:{port}/generate',json={'htmlString':'<!doctype html><html><body><h1>Concurrency regression</h1><p>Synthetic invoice '+str(index)+'</p></body></html>'},timeout=30)
     if response.status_code!=200 or not response.content.startswith(b'%PDF'):raise RuntimeError('Bounded renderer request failed: '+str(response.status_code))
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:list(pool.map(render,range(16)))
    print('16/16 actual signed PDF renders passed at concurrency 2; test-only sandbox exception')
   finally:
    child.terminate()
    try:child.wait(timeout=10)
    except subprocess.TimeoutExpired:child.kill();child.wait()
if __name__=='__main__':main()
