#!/bin/sh
set -eu
# Keep the distribution's public roots AND the private service CA. Replacing
# SSL_CERT_FILE with only the private CA breaks verified provider TLS.
public_ca=${DOCCRAFT_PUBLIC_CA_FILE:-/etc/ssl/certs/ca-certificates.crt}
private_ca=${DOCCRAFT_PRIVATE_CA_FILE:-/run/secrets/ca.crt}
if [ -f "$private_ca" ]; then
  test -s "$public_ca"
  umask 077
  bundle=$(mktemp /tmp/doccraft-trust-XXXXXX.pem)
  cat "$public_ca" "$private_ca" > "$bundle"
  export SSL_CERT_FILE="$bundle" REQUESTS_CA_BUNDLE="$bundle"
fi
exec "$@"
