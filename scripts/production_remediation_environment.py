"""Prepare isolated native remediation fixtures; never reads production configuration.

Run after backend build: .venv-local/bin/python scripts/production_remediation_environment.py --start
Existing owned data requires --resume. Credentials stay under ignored .local/.
"""
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
WORK=ROOT/'.local/production-remediation'
WORK.mkdir(mode=0o700,parents=True,exist_ok=True)
for source,name in [('hybrid_live_stack.py','native_stack.py'),('hybrid_live_client.py','live_client.py'),('hybrid_live_resources.py','resources.py')]:
    text=(ROOT/'scripts'/source).read_text().replace('ROOT=Path(__file__).resolve().parents[1]','ROOT=Path('+repr(str(ROOT))+')').replace('.local/hybrid-live/stack','.local/production-remediation/stack').replace('docs/hybrid-ai/evidence/live','docs/production-remediation/evidence/runtime')
    # Prevent local dotenv files from supplying real external identity credentials.
    if name=='native_stack.py':
        text=text.replace("child={**env,'VITE_ADMIN_API_BASE_URL'","child={**env,'NODE_ENV':'production','VITE_ADMIN_API_BASE_URL'")
        text=text.replace("'PADDLE_API_KEY':'',", "'GOOGLE_CLIENT_ID':'','GOOGLE_CLIENT_SECRET':'','GOOGLE_CALLBACK_URL':'','FIREBASE_PROJECT_ID':'','PADDLE_API_KEY':'',")
    (WORK/name).write_text(text)
if '--start' in sys.argv:
    raise SystemExit(subprocess.call([ROOT/'.venv-local/bin/python',WORK/'native_stack.py',*(['--resume'] if '--resume' in sys.argv else [])],cwd=ROOT))
