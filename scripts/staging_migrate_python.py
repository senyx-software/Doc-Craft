"""One-shot schema owner job; never grant runtime services DDL."""
import os
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]
for service,statement in [
 ('admin-api','import app.db.admin_db; from app.services import entitlements,uploaded_templates,automation_inbox; import app.api.v1.gdpr'),
 ('document','from app.services.db import init_db; init_db()'),
]:
 subprocess.run([sys.executable,'-c',statement],cwd=ROOT/'services'/service,env={**os.environ,'PYTHONPATH':str(ROOT),'ADMIN_RUN_MIGRATIONS':'true','DOCUMENT_RUN_MIGRATIONS':'true'},check=True)
