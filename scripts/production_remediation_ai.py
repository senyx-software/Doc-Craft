"""Run the unchanged 112-case real-model proposal dataset against current adapters.

Requires an already running loopback Ollama and downloaded approved-size model.
Does not activate models, provision hardware, or use cloud credentials. Commands:
.venv-local/bin/python scripts/production_remediation_ai.py
"""
from pathlib import Path
import os
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.local/production-remediation';OUT=ROOT/'docs/production-remediation/evidence/ai'
WORK.mkdir(mode=0o700,parents=True,exist_ok=True);OUT.mkdir(parents=True,exist_ok=True)
mem={line.split(':')[0]:int(line.split()[1]) for line in Path('/proc/meminfo').read_text().splitlines()}
if mem['MemAvailable']<4*1024*1024:
    raise SystemExit('BLOCKED: at least 4 GiB available is required before loading the local test model')
source=(ROOT/'scripts/hybrid_live_scenarios.py').read_text().replace('ROOT=Path(__file__).resolve().parents[1]','ROOT=Path('+repr(str(ROOT))+')').replace('docs/hybrid-ai/evidence/live','docs/production-remediation/evidence/ai').replace("if mem['MemAvailable']<1024*1024", "if mem['MemAvailable']<1536*1024")
(WORK/'real_scenarios.py').write_text(source)
# Schemas originate from the exported existing MCP tools and are independently rechecked on grading.
if not (OUT/'tool-schemas.json').exists():
    (OUT/'tool-schemas.json').write_bytes((ROOT/'docs/hybrid-ai/evidence/live/tool-schemas.json').read_bytes())
env={key:value for key,value in os.environ.items() if key in ['PATH','LANG','LC_ALL','HOME']}
env.update(ADMIN_DATABASE_URL='sqlite:///'+str(WORK/'model-evaluation.sqlite'),ADMIN_RUN_MIGRATIONS='false',AI_ALLOWED_LOCAL_ENDPOINTS='http://127.0.0.1:11434',ENV='test')
raise SystemExit(subprocess.call([ROOT/'.venv-local/bin/python',WORK/'real_scenarios.py',*sys.argv[1:]],cwd=ROOT,env=env))
