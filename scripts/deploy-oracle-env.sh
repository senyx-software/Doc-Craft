#!/bin/sh
# Staging entry point: --check-local, --discover, or explicitly approved --transfer.
# No shell evaluation of environment files; SSH/atomic backup logic lives in Python.
set -eu
set +x
umask 077
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec python3 "$script_dir/oracle_env_deploy.py" "$@"
