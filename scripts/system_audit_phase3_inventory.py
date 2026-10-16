"""Retain a reviewable source inventory; declarations are not runtime test claims."""
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/system-audit/evidence/phase3"
OUT.mkdir(parents=True, exist_ok=True)
calls, routes = [], []
call_pattern = re.compile(r"serviceFetch\(|service_request\(|async_service_client\(|service_client\(|\b(?:fetch|axios\.(?:get|post|patch)|client\.(?:get|post|put|patch|delete))\(|\.(?:publish|subscribe)\(|new (?:Queue|Worker)\(|\.add\(")
route_pattern = re.compile(r"(?:@(?:router|app)\.|\b(?:router|app|fastify|server)\.)(get|post|put|patch|delete|options|head)\(\s*['\"]([^'\"]+)", re.I)
for base in [ROOT / "services", ROOT / "gateway"]:
    if not base.exists():
        continue
    for path in sorted(base.rglob("*")):
        if not path.is_file() or path.suffix not in (".py", ".ts", ".mjs", ".cjs", ".js"):
            continue
        if any(part in ("node_modules", "dist", "generated", ".venv", "__pycache__", "redis-bin", "tests", "__tests__", "testing") for part in path.parts) or ".test." in path.name:
            continue
        source = path.read_text(errors="replace")
        relative = path.relative_to(ROOT)
        service = relative.parts[1] if relative.parts[0] == "services" else "gateway"
        for match in call_pattern.finditer(source):
            calls.append({"service": service, "file": str(relative), "line": source[:match.start()].count("\n") + 1, "expression": source[match.start():match.start() + 400]})
        for match in route_pattern.finditer(source):
            routes.append({"service": service, "method": match[1].upper(), "path": match[2], "file": str(relative), "line": source[:match.start()].count("\n") + 1, "scope": "Declaration; mounted prefixes are documented in 13-INTER_SERVICE_COMMUNICATION.md"})
for name, data in [("connection-callsites", calls), ("api-inventory", routes)]:
    (OUT / (name + ".json")).write_text(json.dumps(data, indent=2) + "\n")
print(json.dumps({"call_sites": len(calls), "route_declarations": len(routes)}))
