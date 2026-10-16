"""Safe entry point replacing the obsolete script that wrote to localhost services.

Run this file to execute isolated document regression tests. Full network and
PostgreSQL evidence is generated separately by scripts/system_audit_phase2_stack.py.
No credentials, impersonation headers, or live resources are used here.
"""
from pathlib import Path
import subprocess
import sys

if __name__ == "__main__":
    raise SystemExit(subprocess.call([sys.executable, "-m", "pytest", "tests", "-q"], cwd=Path(__file__).parent))
