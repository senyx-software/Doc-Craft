"""Read raw GitHub secret values or their quoted dotenv representations."""
import ipaddress
import json
import os
from pathlib import Path
import sys


def dotenv_literal(value):
    candidate = value.strip()
    if len(candidate) >= 2 and candidate[0] == candidate[-1] and candidate[0] in ("'", '"'):
        return candidate[1:-1]
    return value


def admin_cidrs(value):
    values = json.loads(dotenv_literal(value))
    if not isinstance(values, list) or not values:
        raise ValueError("Explicit administrator source networks are required")
    result = []
    for value in values:
        network = ipaddress.IPv4Network(value)
        if network.prefixlen == 0:
            raise ValueError("Unrestricted administrator access is prohibited")
        result.append(str(network))
    return list(dict.fromkeys(result))


if __name__ == "__main__":
    try:
        networks = admin_cidrs(os.environ["ADMIN_CIDRS"])
        if os.getenv("GITHUB_ACTIONS") == "true":
            for network in networks:
                print("::add-mask::" + network)
        with open(Path(sys.argv[1]), "x", opener=lambda p, f: os.open(p, f, 0o600)) as stream:
            json.dump({"admin_source_cidrs": networks}, stream)
        print("Administrator network inputs validated")
    except Exception as error:
        print("Invalid administrator network input (" + type(error).__name__ + "). Values are not printed.", file=sys.stderr)
        sys.exit(1)
