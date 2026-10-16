"""Owned local renderer/UI probes; no application providers or shared data."""
import concurrent.futures
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time
import socket
import sys
from create_service_credentials import generate
from create_redis_credentials import generate as generate_redis

import httpx

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
from shared.service_auth import service_client
OUT = ROOT / "docs/system-audit/evidence/phase3"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    children = []
    with tempfile.TemporaryDirectory(prefix="doccraft-phase2-probes-") as directory:
        fixture = Path(directory)
        credentials=generate()
        pdf_identity=fixture/'pdf.json'
        pdf_identity.write_text(json.dumps(credentials['pdf']))
        pdf_identity.chmod(0o600)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));redis_port=sock.getsockname()[1]
        redis_envs=generate_redis(fixture/'credentials','127.0.0.1',redis_port)
        redis_urls={identity:value.splitlines()[0].split('=',1)[1] for identity,value in redis_envs.items()}
        os.environ['SERVICE_AUTH_CONFIG_JSON']=json.dumps(credentials['document'])
        environment = {**os.environ, "NODE_ENV": "test", "DATABASE_URL": "sqlite:///" + str(fixture / "unused.sqlite"),
                       "SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": "", "SUPABASE_KEY": "",
                       "AUDIT_EVIDENCE_DIR": str(OUT), "SIDECAR_PORT": "3029", "SIDECAR_HOST": "127.0.0.1", "PDF_MAX_CONCURRENT": "2", "PYTHONPATH":str(ROOT),"SERVICE_AUTH_CONFIG_JSON":json.dumps(credentials["document"]),"PDF_SERVICE_AUTH_CONFIG_FILE":str(pdf_identity),"PDF_REDIS_URL":redis_urls["pdf"],"GROQ_API_KEY":"synthetic-do-not-inherit"}

        def start(command, cwd, identity=None):
            log = open(fixture / f"process-{len(children)}.log", "w")
            process = subprocess.Popen(command, cwd=ROOT / cwd, env={**environment,**({"SERVICE_AUTH_CONFIG_JSON":json.dumps(credentials[identity]),"REDIS_URL":redis_urls[identity]} if identity else {})}, stdout=log, stderr=subprocess.STDOUT)
            children.append((process, log))
            return process

        def ready(url):
            for _ in range(200):
                try:
                    with (service_client('pdf',timeout=1) if ':3029/' in url else httpx.Client(timeout=1)) as client:
                        response=client.get(url)
                    if response.status_code == 200:
                        return
                except httpx.HTTPError:
                    pass
                time.sleep(0.1)
            raise RuntimeError(f"Owned fixture unavailable: {url}")

        def run(name, command):
            completed = subprocess.run(command, cwd=ROOT, env=environment, text=True, capture_output=True, timeout=360)
            (OUT / f"{name}.log").write_text(completed.stdout + completed.stderr)
            results.append({"id": name, "command": command, "cwd": ".", "status": "PASS" if completed.returncode == 0 else "FAIL"})
            if completed.returncode:
                raise RuntimeError(f"{name} failed; see retained log")

        try:
            start([str(ROOT/'services/redis-bin/src/redis-server'),'--bind','127.0.0.1','--port',str(redis_port),'--save','','--appendonly','no','--dir',str(fixture),'--aclfile',str(fixture/'credentials/redis.acl')],'.')
            sidecar = start(["node", "puppeteer/start.cjs"], "services/document")
            ready("http://127.0.0.1:3029/ready")
            renderer_pid=None
            for entry in Path('/proc').iterdir():
                if not entry.name.isdigit():continue
                try:
                    status=(entry/'status').read_text()
                    command=(entry/'cmdline').read_bytes()
                    if f'PPid:\t{sidecar.pid}\n' in status and b'dist/puppeteer/server.js' in command:
                        renderer_pid=int(entry.name)
                except (FileNotFoundError,PermissionError):pass
            assert renderer_pid,'Filtered renderer child was not found'
            child_environment=(Path('/proc')/str(renderer_pid)/'environ').read_bytes().split(b'\x00')
            child_keys={item.split(b'=',1)[0].decode() for item in child_environment if b'=' in item}
            assert not child_keys.intersection({'DATABASE_URL','DIRECT_URL','SUPABASE_SERVICE_ROLE_KEY','GROQ_API_KEY','JWT_SECRET','INTERNAL_SERVICE_SECRET','SERVICE_AUTH_CONFIG_JSON'})
            results.append({'id':'pdf-native-credential-isolation','status':'PASS','scope':'Actual renderer child starts without database, provider or user signing credentials; only renderer identity and Redis account are passed'})
            run("pdf-regression", [str(ROOT / ".venv-local/bin/python"), "scripts/system_audit_pdf.py"])

            def render(_index):
                with service_client('pdf',timeout=30) as client:
                    return client.post("http://127.0.0.1:3029/generate", json={"htmlString": "<html><body>Capacity fixture" + "<p>safe local content</p>" * 300 + "</body></html>"}).status_code

            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
                statuses = list(executor.map(render, range(8)))
            # The response may flush before asynchronous page.close() releases its slot.
            deadline = time.monotonic() + 5
            while True:
                health = httpx.get("http://127.0.0.1:3029/health").json()
                if health["activeRenders"] == 0 or time.monotonic() >= deadline:
                    break
                time.sleep(0.05)
            assert 200 in statuses and 503 in statuses and all(status in (200, 503) for status in statuses), statuses
            assert health["activeRenders"] == 0 and health["maxRenders"] == 2, health
            results.append({"id": "renderer-capacity", "status": "PASS", "http_statuses": statuses, "health": health,
                            "scope": "Eight concurrent local render requests, explicit overload response, released slots; not a production capacity benchmark"})

            chrome_pids = []
            for entry in Path("/proc").iterdir():
                if not entry.name.isdigit():
                    continue
                try:
                    status = (entry / "status").read_text()
                    cmd = (entry / "cmdline").read_bytes()
                    if f"PPid:\t{renderer_pid}\n" in status and b"chrome" in cmd:
                        chrome_pids.append(int(entry.name))
                except (FileNotFoundError, PermissionError, ProcessLookupError):
                    continue
            assert len(chrome_pids) == 1, chrome_pids
            os.kill(chrome_pids[0], signal.SIGKILL)
            time.sleep(0.2)
            ready("http://127.0.0.1:3029/ready")
            assert render(0) == 200
            results.append({"id": "renderer-browser-recovery", "status": "PASS", "scope": "Killed only the owned sidecar's Chromium child; readiness relaunched Chromium and next PDF rendered"})

            if os.getenv("AUDIT_SKIP_BROWSER")=="1": return
            start([str(ROOT / "user-frontend/node_modules/.bin/vite"), "--host", "127.0.0.1", "--port", "5183", "--strictPort"], "user-frontend")
            start([str(ROOT / "admin/node_modules/.bin/vite"), "--host", "127.0.0.1", "--port", "5184", "--strictPort"], "admin")
            ready("http://127.0.0.1:5183")
            ready("http://127.0.0.1:5184")
            run("browser-error-regression", ["node", "scripts/system_audit_browser.cjs"])
        finally:
            for process, log in reversed(children):
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait()
                log.close()
            (OUT / ("additional-probes-native.json" if os.getenv("AUDIT_SKIP_BROWSER")=="1" else "additional-probes.json")).write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
