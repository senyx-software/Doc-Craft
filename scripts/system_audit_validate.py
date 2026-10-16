"""Validate audit artifacts and parse Python/Compose without starting services."""
import ast
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
DOC = ROOT / "docs/system-audit"
reports = [ROOT / "DOC_CRAFT_FULL_PROJECT_REPORT.md", *sorted(DOC.glob("[0-9][0-9]-*.md"))]
assert len(reports) == 13
for report in reports:
    text = report.read_text()
    assert text.count('```') % 2 == 0, report
    for target in re.findall(r'\]\(([^\s)]+)\)', text):
        if target.startswith(('http://', 'https://', '#')): continue
        file = target.split('#', 1)[0]
        assert not file or (report.parent / file).exists(), (report, target)
inventory = json.loads((DOC / 'evidence/inventory.json').read_text())
coverage = (DOC / '06-FUNCTIONALITY_COVERAGE.md').read_text()
for entry in inventory['entries']:
    assert f"| {entry['id']} |" in coverage, entry['id']
current_path = DOC / 'evidence/phase2/inventory.json'
current_entries = 0
if current_path.exists():
    current_inventory = json.loads(current_path.read_text())
    for entry in current_inventory['entries']:
        assert f"| P2-{entry['id']} |" in coverage, entry['id']
        assert (ROOT / entry['source']).exists(), entry['source']
    current_entries = len(current_inventory['entries'])
python_count = 0
for folder in ['services/admin-api/app', 'services/analytics/app', 'services/document/app', 'scripts']:
    for file in (ROOT / folder).rglob('*.py'):
        ast.parse(file.read_text(), filename=str(file))
        python_count += 1
try:
    import yaml
except ImportError:
    javascript = "const fs=require('fs'); let data; try { data=require('yaml').parse(fs.readFileSync('docker-compose.yml','utf8')); } catch(e) { data=require('js-yaml').load(fs.readFileSync('docker-compose.yml','utf8')); } if(!data.services.redis) process.exit(1); console.log(Object.keys(data.services).length);"
    result = subprocess.run(['node', '-e', javascript], cwd=ROOT, capture_output=True, text=True)
    assert result.returncode == 0, 'No usable Compose YAML parser or invalid YAML'
    compose = 'PASS — YAML parsed with local Node dependency; interpolation/images/Docker runtime not tested'
else:
    data = yaml.safe_load((ROOT / 'docker-compose.yml').read_text())
    assert 'redis' in data['services']
    compose = 'PASS — YAML parsed; interpolation, images and Docker runtime not tested'
print(json.dumps({'reports': len(reports), 'historical_covered_entries': len(inventory['entries']), 'phase2_covered_entries': current_entries, 'parsed_python_modules': python_count, 'compose': compose, 'links_and_fences': 'PASS'}))
