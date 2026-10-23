#!/usr/bin/env python3
"""Check compiled assets for backend credential names and private key material."""
import re,sys
from pathlib import Path
rules=[rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',rb'(?:postgres(?:ql)?|rediss?)://[^\s"<>]*:[^\s"<>]*@',rb'(?:sk-ant-api\d+-|sk-proj-)[A-Za-z0-9_-]{20,}',rb'AI_CREDENTIAL_KEYRING_FILE',rb'SERVICE_AUTH_CONFIG_JSON']
failed=[]
for folder in sys.argv[1:]:
 for path in Path(folder).rglob('*'):
  if path.is_file() and path.suffix in ('.js','.html','.css','.map'):
   raw=path.read_bytes()
   if any(re.search(rule,raw) for rule in rules):failed.append(str(path))
if failed:print('Potential backend secret/configuration exposure in assets: '+','.join(failed),file=sys.stderr);sys.exit(1)
print('Compiled asset secret-pattern checks passed; public Firebase web identifiers are intentionally allowed')
