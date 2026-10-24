"""Prepare/start isolated audit copies of existing verified development helpers.
No production env discovery. Fresh paths refuse overwrite; --resume uses owned DB.
"""
from pathlib import Path
import os,subprocess,sys
ROOT=Path(__file__).resolve().parents[1];folder=ROOT/'.local/production-audit';folder.mkdir(mode=0o700,parents=True,exist_ok=True)
for source,name in [('hybrid_live_stack.py','native_stack.py'),('hybrid_live_client.py','audit_client.py'),('hybrid_live_resources.py','resources.py')]:
 text=(ROOT/'scripts'/source).read_text().replace('ROOT=Path(__file__).resolve().parents[1]','ROOT=Path('+repr(str(ROOT))+')').replace("WORK=ROOT/'.local/hybrid-live/stack'","WORK=ROOT/'.local/production-audit/stack'").replace("OUT=ROOT/'docs/hybrid-ai/evidence/live'","OUT=ROOT/'docs/production-audit/evidence/runtime'").replace("EVIDENCE=ROOT/'docs/hybrid-ai/evidence/live'","EVIDENCE=ROOT/'docs/production-audit/evidence/runtime'").replace("OUT=ROOT/'docs/hybrid-ai/evidence/live/resource-samples.jsonl'","OUT=ROOT/'docs/production-audit/evidence/runtime/resource-samples.jsonl'").replace("ROOT/'.local/hybrid-live/stack/context.json'","ROOT/'.local/production-audit/stack/context.json'")
 (folder/name).write_text(text);(folder/name).chmod(0o700)
print('Prepared audit-only native helpers; credentials remain in private task context')
if '--start' in sys.argv:raise SystemExit(subprocess.call([ROOT/'.venv-local/bin/python',folder/'native_stack.py',*(['--resume'] if '--resume' in sys.argv else [])],cwd=ROOT))
