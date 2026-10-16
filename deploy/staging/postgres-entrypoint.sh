#!/bin/sh
set -eu
mkdir -p /run/doccraft-tls
cp /run/secrets/postgres.key /run/doccraft-tls/server.key
cp /run/secrets/postgres.crt /run/doccraft-tls/server.crt
chown -R postgres:postgres /run/doccraft-tls
chmod 700 /run/doccraft-tls
chmod 600 /run/doccraft-tls/server.key
exec /usr/local/bin/docker-entrypoint.sh "$@"
