"""Run a named audit check and retain redacted command/output evidence.

Usage: python3 scripts/system_audit_check.py NAME DIRECTORY COMMAND [ARG ...]
The caller must select safe commands and explicitly configure isolated resources.
"""
import datetime
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs/system-audit/evidence"


def redact(text):
    # Remove configured secret values without recording their originals.
    for key, value in os.environ.items():
        if re.search(r"SECRET|TOKEN|PASSWORD|API_KEY|DATABASE_URL|DIRECT_URL", key) and len(value) > 8:
            text = text.replace(value, "[REDACTED]")
    text = re.sub(r"(postgres(?:ql)?://)[^\s\"']+", r"\1[REDACTED]", text)
    text = re.sub(r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED JWT]", text)
    text = re.sub(r"(temp password is|Verification code for [^\n]+ is) [^\s]+", r"\1 [REDACTED]", text)
    return text


def main():
    name, directory, *command = sys.argv[1:]
    if not re.fullmatch(r"[a-zA-Z0-9_-]+", name) or not command:
        raise SystemExit("Provide a safe evidence name and command")
    OUT.mkdir(parents=True, exist_ok=True)
    started = datetime.datetime.now(datetime.timezone.utc).isoformat()
    before = time.monotonic()
    try:
        process = subprocess.Popen(command, cwd=ROOT / directory, text=True,
                                   stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        output, _ = process.communicate(timeout=int(os.environ.get("AUDIT_CHECK_TIMEOUT", "180")))
        code = process.returncode
    except subprocess.TimeoutExpired:
        # Give owned harnesses a chance to close their children and retain evidence.
        os.killpg(process.pid, signal.SIGINT)
        try:
            output, _ = process.communicate(timeout=15)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            output, _ = process.communicate()
        code = 124
        output += "\nAUDIT TIMEOUT\n"
    output = redact(output)
    (OUT / f"{name}.log").write_text(output)
    record = {"id": name, "cwd": directory, "command": command, "started_utc": started,
              "seconds": round(time.monotonic() - before, 2), "exit_code": code,
              "result": "PASS" if code == 0 else "BLOCKED" if code == 124 else "FAIL",
              "log": f"evidence/{name}.log"}
    (OUT / f"{name}.json").write_text(json.dumps(record, indent=2) + "\n")
    print(json.dumps(record))
    print(output[-4500:])
    return code


if __name__ == "__main__":
    raise SystemExit(main())
