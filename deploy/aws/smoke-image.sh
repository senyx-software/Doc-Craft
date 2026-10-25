#!/bin/bash
# Disposable container acceptance for staging's libc/native-library change.
set -euo pipefail
umask 077
case "$IMAGE_NAME" in
  node)
    docker run --rm "doccraft-ci:$IMAGE_NAME" node --input-type=module -e \
      'await import("pg"); await import("ioredis"); await import("jose"); console.log("Native Node runtime imports passed")'
    exit
    ;;
  pdf)
    docker run --rm --cap-drop ALL --security-opt no-new-privileges:true \
      --security-opt "seccomp=$PWD/deploy/aws/chromium-seccomp.json" \
      --shm-size 256m --tmpfs /tmp:rw,nosuid,size=256m "doccraft-ci:$IMAGE_NAME" \
      node --input-type=module -e '
        import puppeteer from "puppeteer";
        const browser=await puppeteer.launch({headless:true,args:["--disable-dev-shm-usage","--disable-gpu"]});
        try {
          const status=await browser.newPage();
          await status.goto("chrome://sandbox");
          const report=await status.evaluate(()=>document.body.innerText);
          console.log(report);
          if(!/PID namespaces\s+Yes/i.test(report) || !/Network namespaces\s+Yes/i.test(report)
            || !/Seccomp-BPF sandbox\s+Yes/i.test(report)) throw new Error("Chromium sandbox layers are not active");
          await status.close();
          const page=await browser.newPage();
          await page.setJavaScriptEnabled(false);
          await page.setContent("<!doctype html><h1>Sandboxed staging renderer</h1>");
          const pdf=await page.pdf();
          if(!Buffer.from(pdf).subarray(0,4).equals(Buffer.from("%PDF"))) throw new Error("Invalid PDF");
          console.log("Actual sandboxed PDF render passed:",await browser.version());
        } finally {await browser.close();}'
    exit
    ;;
  migration|python|postgres) ;;
  edge|admin|user) exit ;;
  *) echo 'Unexpected staging image target' >&2; exit 1 ;;
esac
name="doccraft-ci-$IMAGE_NAME-${GITHUB_RUN_ID:?}"
network="$name-network"
certificates=$(mktemp -d)
cleanup() {
  status=$?
  trap - EXIT
  docker rm --force --volumes "$name" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  rm -rf "$certificates"
  exit "$status"
}
trap cleanup EXIT
docker network create "$network" >/dev/null
database=$(python3 -c 'import json; print(json.load(open("deploy/aws/base-images.json"))["postgres"])')
if [[ "$IMAGE_NAME" == postgres ]]; then database=doccraft-ci:postgres; fi
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=DocCraft disposable CI CA' \
  -keyout "$certificates/ca.key" -out "$certificates/ca.crt" >/dev/null 2>&1
openssl req -new -newkey rsa:2048 -nodes -subj '/CN=database' \
  -keyout "$certificates/server.key" -out "$certificates/server.csr" >/dev/null 2>&1
printf '%s\n' 'subjectAltName=DNS:database,IP:127.0.0.1' 'extendedKeyUsage=serverAuth' \
  'basicConstraints=CA:FALSE' > "$certificates/server.ext"
openssl x509 -req -in "$certificates/server.csr" -CA "$certificates/ca.crt" \
  -CAkey "$certificates/ca.key" -CAcreateserial -days 1 -extfile "$certificates/server.ext" \
  -out "$certificates/server.crt" >/dev/null 2>&1
chmod 444 "$certificates/ca.crt"
docker run --detach --name "$name" --network "$network" --network-alias database \
  --mount "type=bind,source=$certificates,target=/ci-input,readonly" \
  --env POSTGRES_USER=ci --env POSTGRES_PASSWORD=ci-only-disposable \
  --env POSTGRES_DB=doccraft_staging_ci --entrypoint sh "$database" -c '
    mkdir -p /tmp/ci-tls
    cp /ci-input/server.key /ci-input/server.crt /tmp/ci-tls/
    chown -R postgres:postgres /tmp/ci-tls
    chmod 700 /tmp/ci-tls
    chmod 600 /tmp/ci-tls/server.key
    exec /usr/local/bin/docker-entrypoint.sh postgres -c ssl=on \
      -c ssl_cert_file=/tmp/ci-tls/server.crt -c ssl_key_file=/tmp/ci-tls/server.key' >/dev/null
ready=false
for _ in {1..60}; do
  if docker exec "$name" pg_isready -U ci -d doccraft_staging_ci >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then docker logs "$name"; exit 1; fi
connection=postgresql://ci:ci-only-disposable@database:5432/doccraft_staging_ci
case "$IMAGE_NAME" in
  postgres)
    docker exec --env PGSSLMODE=verify-full --env PGSSLROOTCERT=/ci-input/ca.crt \
      --env PGPASSWORD=ci-only-disposable "$name" psql -h database -U ci -d doccraft_staging_ci -v ON_ERROR_STOP=1 \
      -c "SELECT version(), current_setting('server_encoding'), 'සිංහල'::text, ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid();"
    ;;
  migration)
    connection="$connection?sslmode=require&sslaccept=strict&sslcert=/ci-ca.crt"
    docker run --rm --network "$network" \
      --mount "type=bind,source=$certificates/ca.crt,target=/ci-ca.crt,readonly" \
      --env DATABASE_URL="$connection" --env DIRECT_URL="$connection" \
      --env PG_REQUIRE_TLS=true --env PGSSLROOTCERT=/ci-ca.crt doccraft-ci:migration
    ;;
  python)
    docker run --rm --network "$network" \
      --mount "type=bind,source=$certificates/ca.crt,target=/ci-ca.crt,readonly" \
      --env DATABASE_URL="$connection?sslmode=verify-full&sslrootcert=/ci-ca.crt" doccraft-ci:python python -c '
import io,os
import cryptography,numpy,pandas,psycopg2,pymupdf
from PIL import Image
with psycopg2.connect(os.environ["DATABASE_URL"]) as connection:
    with connection.cursor() as cursor:
        cursor.execute("SELECT %s::text", ("සිංහල",))
        assert cursor.fetchone()[0] == "සිංහල"
document=pymupdf.open();page=document.new_page();page.insert_text((72,72),"Staging native PDF test")
assert document.tobytes().startswith(b"%PDF")
buffer=io.BytesIO();Image.new("RGB",(2,2)).save(buffer,format="PNG")
assert numpy.arange(3).sum()==3
assert pandas.DataFrame({"value":[1,2]}).value.sum()==3
print("Native Python database, PDF, image and numeric operations passed")'
    ;;
esac
