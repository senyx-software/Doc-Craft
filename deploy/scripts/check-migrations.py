#!/usr/bin/env python3
"""Reject new destructive SQL until explicitly reviewed in the hash allowlist."""
import hashlib,json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
approved=json.loads((ROOT/'deploy/config/migration-baseline.json').read_text())
failures=[]
for path in sorted((ROOT/'services').glob('*/**/migrations/**/*.sql')):
 text=path.read_text();digest=hashlib.sha256(text.encode()).hexdigest();relative=str(path.relative_to(ROOT))
 if relative in approved and digest!=approved[relative]:failures.append(relative+': previously reviewed migration changed')
 if re.search(r'\b(?:DROP\s+(?:TABLE|COLUMN|DATABASE|SCHEMA|TYPE)|TRUNCATE|DELETE\s+FROM|ALTER\s+COLUMN\b[^;]*(?:SET\s+NOT\s+NULL|TYPE))\b',re.sub(r'--[^\n]*','',text),re.I) and approved.get(relative)!=digest:failures.append(relative+': destructive migration requires explicit review, backup and compatibility epoch decision')
if failures:print('\n'.join(failures),file=sys.stderr);sys.exit(1)
print('Migration immutability and destructive-SQL policy validated; application compatibility still requires review')
