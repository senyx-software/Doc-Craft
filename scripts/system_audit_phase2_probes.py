"""Owned local renderer/UI probes; no application providers or shared data."""
import concurrent.futures
import json
import os
from pathlib import Path
import signal
import subprocess
import tempfile
import time

import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/system-audit/evidence/phase2"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    results = []
    children = []
    with tempfile.TemporaryDirectory(prefix="doccraft-phase2-probes-") as directory:
        fixture = Path(directory)
        environment = {**os.environ, "NODE_ENV": "test", "DATABASE_URL": "sqlite:///" + str(fixture / "unused.sqlite"),
                       "SUPABASE_URL": "", "SUPABASE_SERVICE_ROLE_KEY": "", "SUPABASE_KEY": "",
                       "AUDIT_EVIDENCE_DIR": str(OUT), "SIDECAR_PORT": "3029", "SIDECAR_HOST": "127.0.0.1", "PDF_MAX_CONCURRENT": "2"}

        def start(command, cwd):
            log = open(fixture / f"process-{len(children)}.log", "w")
            process = subprocess.Popen(command, cwd=ROOT / cwd, env=environment, stdout=log, stderr=subprocess.STDOUT)
            children.append((process, log))
            return process

        def ready(url):
            for _ in range(200):
                try:
                    if httpx.get(url, timeout=1).status_code == 200:
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
            sidecar = start(["node", "dist/puppeteer/server.js"], "services/document")
            ready("http://127.0.0.1:3029/ready")
            run("pdf-regression", [str(ROOT / ".venv-local/bin/python"), "scripts/system_audit_pdf.py"])

            def render(_index):
                return httpx.post("http://127.0.0.1:3029/generate", json={"htmlString": "<html><body>Capacity fixture" + "<p>safe local content</p>" * 300 + "</body></html>"}, timeout=30).status_code

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
                    if f"PPid:\t{sidecar.pid}\n" in status and b"chrome" in cmd:
                        chrome_pids.append(int(entry.name))
                except (FileNotFoundError, PermissionError, ProcessLookupError):
                    continue
            assert len(chrome_pids) == 1, chrome_pids
            os.kill(chrome_pids[0], signal.SIGKILL)
            time.sleep(0.2)
            ready("http://127.0.0.1:3029/ready")
            assert render(0) == 200
            results.append({"id": "renderer-browser-recovery", "status": "PASS", "scope": "Killed only the owned sidecar's Chromium child; readiness relaunched Chromium and next PDF rendered"})

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
            (OUT / "additional-probes.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
