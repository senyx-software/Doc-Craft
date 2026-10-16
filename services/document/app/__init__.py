# Make repository-owned cross-runtime security helpers available in local service runs.
from pathlib import Path
import sys
_repository_root = Path(__file__).resolve().parents[3]
if (_repository_root / "shared/service_auth.py").exists():
    sys.path.insert(0, str(_repository_root))

