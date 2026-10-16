"""Verify generated private configuration and the checked-in deployment contract."""
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import tempfile
from create_service_credentials import generate
from create_redis_credentials import generate as redis_generate
ROOT=Path(__file__).resolve().parents[1]
checks=[]


def record(name,ok):
    checks.append({'check':name,'status':'PASS' if ok else 'FAIL'})
    if not ok: raise AssertionError(name)


with tempfile.TemporaryDirectory(prefix='doccraft-private-configuration-') as name:
    folder=Path(name)/'secrets'
    run=subprocess.run([ROOT/'.venv-local/bin/python',ROOT/'scripts/create_service_credentials.py',folder],capture_output=True,text=True)
    record('Credential CLI succeeds without printing key values',run.returncode==0 and 'secret' not in run.stdout.lower())
    configs={file.stem:json.loads(file.read_text()) for file in folder.glob('*.json')}
    record('Only Auth receives the user signing private key',all(('private_key' in item['user_jwt'])==(identity=='auth') for identity,item in configs.items()))
    record('PDF has no outgoing HTTP permissions',not configs['pdf']['send'])
    record('Pairwise HTTP keys are independent',len({item['secret'] for config in configs.values() for item in config['send'].values()})==sum(len(config['send']) for config in configs.values()))
    redis_generate(folder,'127.0.0.1',6379)
    record('All private configuration files have mode 0600',all(stat.S_IMODE(file.stat().st_mode)==0o600 for file in folder.iterdir()))
    before={file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in folder.iterdir()}
    duplicate=subprocess.run([ROOT/'.venv-local/bin/python',ROOT/'scripts/create_service_credentials.py',folder],capture_output=True,text=True)
    record('Regeneration refuses overwrites and preserves all files',duplicate.returncode!=0 and before=={file.name:hashlib.sha256(file.read_bytes()).hexdigest() for file in folder.iterdir()})
    code="const assert=require('node:assert/strict');const fs=require('node:fs');assert.equal(JSON.parse(fs.readFileSync(process.env.SERVICE_AUTH_CONFIG_FILE)).identity,'document');assert.equal(JSON.parse(fs.readFileSync(process.env.PDF_SERVICE_AUTH_CONFIG_FILE)).identity,'pdf');assert.match(process.env.REDIS_URL,/document:/);assert.match(process.env.PDF_REDIS_URL,/pdf:/);console.log('PASS private native launcher');"
    launched=subprocess.run(['node',ROOT/'scripts/with-service-identity.cjs','document','node','-e',code],env={**os.environ,'DOCCRAFT_SECRETS_DIR':str(folder)},capture_output=True,text=True,cwd=ROOT)
    record('Native document launcher separates document/PDF identities and Redis accounts',launched.returncode==0)

javascript="""const assert=require('node:assert/strict'),fs=require('fs'),d=require('yaml').parse(fs.readFileSync('docker-compose.yml','utf8'));for(const name of ['auth','quota','chat','document','payment','notification','analytics','redis'])assert.equal(d.services[name].ports,undefined);for(const name of ['gateway','admin-api','user','admin'])assert.ok(d.services[name].ports.every(value=>value.startsWith('127.0.0.1:')));assert.equal(d.networks.backend.internal,true);assert.ok(d.services.pdf.secrets.some(value=>value.source==='pdf_identity'));assert.equal(d.services.pdf.env_file.length,1);assert.equal(d.services.pdf.ports,undefined);assert.ok(d.services.redis.command.includes('--aclfile'));console.log('PASS configuration only; Docker runtime and TLS are not verified');"""
run=subprocess.run(['node','-e',javascript],cwd=ROOT,capture_output=True,text=True)
record('Compose private ports, private network and per-service secrets parse correctly',run.returncode==0)
output=ROOT/'docs/system-audit/evidence/phase3/configuration-checks.json'
output.write_text(json.dumps(checks,indent=2)+'\n')
print(json.dumps(checks,indent=2))
