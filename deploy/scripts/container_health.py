"""Local TLS liveness; readiness and authenticated rendering are release gates."""
import os,ssl,sys,http.client
connection=http.client.HTTPSConnection(os.environ['DOCCRAFT_SERVICE'],int(os.environ['PORT']),timeout=4,context=ssl.create_default_context(cafile='/run/secrets/ca.crt'))
try:
 connection.request('GET','/health');response=connection.getresponse();sys.exit(0 if response.status==200 else 1)
except Exception:sys.exit(1)
finally:connection.close()
