"""Entrypoint must preserve public/provider roots while adding the private CA."""
import os,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
def test_staging_combines_roots_and_rejects_untrusted_ca(tmp_path):
    roots=[]
    for name in ['public','private','untrusted']:
        crt=tmp_path/(name+'.crt');key=tmp_path/(name+'.key')
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-keyout',str(key),'-out',str(crt),'-subj','/CN='+name,'-days','1','-addext','basicConstraints=critical,CA:TRUE'],check=True,capture_output=True)
        roots.append(crt)
    script='test -s "$SSL_CERT_FILE" && test "$SSL_CERT_FILE" = "$REQUESTS_CA_BUNDLE" && openssl verify -CAfile "$SSL_CERT_FILE" "$1" "$2" && ! openssl verify -CAfile "$SSL_CERT_FILE" "$3"; result=$?; rm -f "$SSL_CERT_FILE"; exit "$result"'
    result=subprocess.run(['sh',str(ROOT/'deploy/staging/service-entrypoint.sh'),'sh','-c',script,'trust-test',*map(str,roots)],env={**os.environ,'DOCCRAFT_PUBLIC_CA_FILE':str(roots[0]),'DOCCRAFT_PRIVATE_CA_FILE':str(roots[1])},capture_output=True,text=True)
    assert result.returncode==0,result.stdout+result.stderr
def test_staging_fails_closed_without_public_roots(tmp_path):
    private=tmp_path/'private.crt';private.write_text('fixture')
    result=subprocess.run(['sh',str(ROOT/'deploy/staging/service-entrypoint.sh'),'true'],env={**os.environ,'DOCCRAFT_PUBLIC_CA_FILE':str(tmp_path/'missing'),'DOCCRAFT_PRIVATE_CA_FILE':str(private)},capture_output=True)
    assert result.returncode!=0
