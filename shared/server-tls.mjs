import { readFileSync } from 'node:fs';
import { createServer as httpServer } from 'node:http';
import { createServer as httpsServer } from 'node:https';

export function serverTlsOptions() {
  const cert=process.env.SERVICE_TLS_CERT_FILE, key=process.env.SERVICE_TLS_KEY_FILE;
  if(!!cert!==!!key)throw new Error('Both service TLS certificate and key are required');
  if(!cert) {
    if(process.env.SERVICE_REQUIRE_TLS==='true')throw new Error('TLS is required for this listener');
    return undefined;
  }
  return {cert:readFileSync(cert),key:readFileSync(key),minVersion:'TLSv1.2'};
}
export function createAppServer(app) {
  const tls=serverTlsOptions();
  return tls?httpsServer(tls,app):httpServer(app);
}
export function fastifyTlsOptions() {
  const tls=serverTlsOptions();
  return tls?{https:tls}:{};
}
