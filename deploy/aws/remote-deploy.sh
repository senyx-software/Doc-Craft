#!/bin/bash
set -euo pipefail
umask 077
directory="$RUNNER_TEMP/aws-staging"
[[ "$GITHUB_SHA" =~ ^[0-9a-f]{40}$ && "$GITHUB_RUN_ID" =~ ^[0-9]+$ ]]
[[ "$SSH_USER" =~ ^[a-z_][a-z0-9_-]*$ && "$SSH_USER" != root ]]
[[ "$REGISTRY_USER" =~ ^[a-zA-Z0-9_-]+$ ]]
python3 -c 'import ipaddress,sys; ipaddress.IPv4Address(sys.argv[1])' "$HOST"
options=(-i "$directory/key" -o BatchMode=yes -o IdentitiesOnly=yes
         -o HostKeyAlias=i-098228a0d829d7eb2
         -o StrictHostKeyChecking=yes -o UserKnownHostsFile="$directory/known_hosts"
         -o GlobalKnownHostsFile=/dev/null -o PasswordAuthentication=no
         -o ForwardAgent=no -o ConnectTimeout=10
         -o ServerAliveInterval=15 -o ServerAliveCountMax=40)
target="$SSH_USER@$HOST"
remote="/tmp/doccraft-aws-$GITHUB_RUN_ID"
registry="/tmp/doccraft-aws-registry-$GITHUB_RUN_ID"
cleanup() {
  status=$?
  trap - EXIT
  ssh "${options[@]}" "$target" "sudo rm -rf '$registry'
    rm -rf '$remote'" >/dev/null 2>&1 || true
  exit "$status"
}
trap cleanup EXIT
ssh "${options[@]}" "$target" "umask 077
  mkdir -p '$remote/control'"
scp "${options[@]}" "$directory/controller.tar.gz" "$directory/settings.json" "$directory/release.json" "$target:$remote/"
ssh "${options[@]}" "$target" "umask 077
  tar -xzf '$remote/controller.tar.gz' -C '$remote/control'
  sudo -n bash '$remote/control/deploy/aws/install-host.sh' '$remote/control' '$remote/settings.json' '$GITHUB_SHA'
  sudo -n install -d -m 700 '$registry'"
printf '%s' "$REGISTRY_TOKEN" | ssh "${options[@]}" "$target" \
  "sudo -n env DOCKER_CONFIG='$registry' docker login ghcr.io --username '$REGISTRY_USER' --password-stdin" >/dev/null
ssh "${options[@]}" "$target" \
  "sudo -n env DOCKER_CONFIG='$registry' python3 '/opt/doccraft-aws/releases/$GITHUB_SHA/deploy/aws/staging.py' deploy" < "$directory/release.json"
python3 - "$directory/settings.json" >> "$GITHUB_STEP_SUMMARY" <<'PY'
import json, sys
from pathlib import Path
configuration = json.loads(Path(sys.argv[1]).read_text())['configuration']
domain = next(line.split('=', 1)[1] for line in configuration.splitlines() if line.startswith('APP_DOMAIN='))
print('AWS staging deployed and verified: https://' + domain)
PY
