#!/usr/bin/env python3
"""Reject private config/state artifacts even if force-added past .gitignore."""
import re,subprocess,sys
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z']).decode().split('\0')
bad=[]
for path in paths:
 if not path:continue
 if path.endswith(('.env.example','.env.template','.tfvars.example')):continue
 if re.search(r'(^|/)(?:\.env(?:\.[^/]*)?|[^/]+\.env)$|\.(?:tfstate(?:\..*)?|tfplan|rdb|aof|pem|key)$|^deploy/(?:runtime|secrets)/',path):
  if path!='deploy/secrets/README.md':bad.append(path)
if bad:print('Private configuration/state cannot enter Git: '+','.join(sorted(set(bad))),file=sys.stderr);sys.exit(1)
print('Git configuration and state boundaries passed')
