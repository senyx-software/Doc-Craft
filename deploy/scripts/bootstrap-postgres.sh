#!/bin/sh
set -eu
# Runs once for EMPTY PGDATA only. Password stays in stdin, never psql argv.
migrator_password=$(cat /run/secrets/postgres_migrator_password)
case "$POSTGRES_DB" in *[!a-zA-Z0-9_-]*|'') exit 1;; esac
case "$migrator_password" in *[!a-zA-Z0-9_-]*|'') exit 1;; esac
{
 printf "CREATE ROLE doccraft_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '%s';\n" "$migrator_password"
 printf 'ALTER DATABASE "%s" OWNER TO doccraft_migrator;\n' "$POSTGRES_DB"
} | psql --username postgres --dbname postgres --set ON_ERROR_STOP=1 --quiet
