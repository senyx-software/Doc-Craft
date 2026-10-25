#!/bin/bash
set -euo pipefail
umask 077
source_directory=$(realpath "$1")
settings=$(realpath "$2")
commit=$3
[[ $EUID == 0 && "$commit" =~ ^[0-9a-f]{40}$ ]]
# Verify the supplied EC2 identity before installing packages or writing config.
python3 -c 'import sys; sys.path.insert(0, sys.argv[1]); from staging import verify_instance; verify_instance()' "$source_directory/deploy/aws"
. /etc/os-release
case "$ID" in
  ubuntu|debian)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq docker.io ca-certificates curl python3 python3-cryptography openssl
    ;;
  amzn)
    dnf install -y docker ca-certificates curl python3 python3-cryptography openssl
    ;;
  *) echo "Supported EC2 images: Ubuntu, Debian, Amazon Linux 2023" >&2; exit 1 ;;
esac
systemctl enable --now docker
if ! docker compose version >/dev/null 2>&1; then
  # Verify the upstream release checksum before installing the Compose plugin.
  temporary=$(mktemp -d)
  trap 'rm -rf "$temporary"' EXIT
  compose_version=v2.40.3
  curl --fail --silent --show-error --location "https://github.com/docker/compose/releases/download/$compose_version/docker-compose-linux-x86_64" -o "$temporary/docker-compose-linux-x86_64"
  printf '%s\n' 'dba9d98e1ba5bfe11d88c99b9bd32fc4a0624a30fafe68eea34d61a3e42fd372  docker-compose-linux-x86_64' > "$temporary/checksums.txt"
  (cd "$temporary" && sha256sum --check checksums.txt)
  install -D -m 755 "$temporary/docker-compose-linux-x86_64" /usr/local/lib/docker/cli-plugins/docker-compose
fi
# Refuse Compose versions which cannot read raw env_file values.
python3 -c 'import re,subprocess; v=subprocess.check_output(["docker","compose","version","--short"],text=True); assert tuple(map(int,re.search(r"(\d+)\.(\d+)\.(\d+)",v).groups())) >= (2,30,0)'
destination="/opt/doccraft-aws/releases/$commit"
if [[ ! -d "$destination" ]]; then
  install -d -m 755 /opt/doccraft-aws/releases
  cp -R "$source_directory" "$destination"
  chown -R root:root "$destination"
  find "$destination" -type d -exec chmod 755 {} +
  find "$destination" -type f -exec chmod 644 {} +
  printf '%s\n' "$commit" > "$destination/.release-commit"
fi
python3 "$destination/deploy/aws/prepare-host.py" "$settings"
printf '%s\n' "Staging host prepared at $destination"
