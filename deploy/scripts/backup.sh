#!/bin/sh
set -eu
# Parse the one controller-generated URI without putting its password in argv.
# The value has no newlines or shell syntax; never source an arbitrary env file.
connection=$(sed -n 's/^STAGING_MIGRATION_DATABASE_URL=//p' /run/secrets/backup_connection)
test -n "$connection"
PGDATABASE="$connection" PGSSLMODE=verify-full PGSSLROOTCERT=/run/secrets/ca.crt pg_dump --format=custom --no-owner --no-acl
