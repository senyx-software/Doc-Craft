#!/usr/bin/env python3
"""Install reviewed Linux/amd64 CI binaries, verifying committed SHA256 pins."""
import hashlib,io,json,os,sys,tarfile,urllib.request,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
pins=json.loads((ROOT/'deploy/config/ci-tools.json').read_text());target=ROOT/'.local/ci-tools';target.mkdir(mode=0o700,parents=True,exist_ok=True)
for name in sys.argv[1:]:
 pin=pins[name]
 with urllib.request.urlopen(pin['url'],timeout=120) as response:data=response.read(150_000_001)
 if len(data)>150_000_000 or hashlib.sha256(data).hexdigest()!=pin['sha256']:raise RuntimeError('CI tool checksum mismatch')
 if pin['archive']=='zip':
  with zipfile.ZipFile(io.BytesIO(data)) as archive:binary=archive.read(pin['binary'])
 else:
  with tarfile.open(fileobj=io.BytesIO(data)) as archive:
   member=next(m for m in archive.getmembers() if m.name.lstrip('./')==pin['binary'] and m.isfile());binary=archive.extractfile(member).read()
 path=target/pin['binary'];path.write_bytes(binary);path.chmod(0o755);print('Verified '+name+' '+pin['version'])
if os.getenv('GITHUB_PATH'):
 with open(os.environ['GITHUB_PATH'],'a') as stream:stream.write(str(target)+'\n')
