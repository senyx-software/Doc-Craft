#!/bin/sh
set -eu
# libpq does not expand a connection URI supplied only through PGDATABASE.
# Use explicit connection fields and a mounted password without putting it in argv.
: "${PGHOST:?}" "${PGPORT:?}" "${PGUSER:?}" "${PGDATABASE:?}"
PGPASSWORD=$(cat /run/secrets/postgres_migrator_password)
test -n "$PGPASSWORD"
PGSSLMODE=verify-full
PGSSLROOTCERT=/run/secrets/ca.crt
export PGPASSWORD PGSSLMODE PGSSLROOTCERT
exec pg_dump --format=custom --no-owner --no-acl
