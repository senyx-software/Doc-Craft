FROM python:3.13-alpine3.24@sha256:bf12ecc0bea3f171d55145dd02c78b5eeb09f30ee2ac9cc2b4c9e4e8f5e30741 AS dependencies
WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates libstdc++
RUN adduser -D -u 1000 runtime
COPY deploy/staging/python.constraints.txt /app/constraints.txt
COPY services/admin-api/requirements.txt /tmp/admin.txt
COPY services/document/requirements.txt /tmp/document.txt
COPY services/analytics/requirements.txt /tmp/analytics.txt
RUN python -m pip install --no-cache-dir --upgrade pip==26.2.2 setuptools==84.1.0 \
    && sed -i '/^pytest/d' /tmp/admin.txt \
    && pip install --only-binary=:all: --no-cache-dir -c /app/constraints.txt -r /tmp/admin.txt -r /tmp/document.txt -r /tmp/analytics.txt
FROM python:3.13-alpine3.24@sha256:bf12ecc0bea3f171d55145dd02c78b5eeb09f30ee2ac9cc2b4c9e4e8f5e30741 AS runtime
WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
RUN apk upgrade --no-cache && apk add --no-cache ca-certificates libstdc++
RUN adduser -D -u 1000 runtime
COPY --from=dependencies /usr/local /usr/local
# Services use the installed dependencies. Remove unused pip and its bootstrap
# wheel, which carry separate copies of package-manager dependencies.
RUN python -m pip uninstall --yes pip && rm -rf /usr/local/lib/python3.13/ensurepip
COPY --chown=runtime:runtime shared /app/shared
COPY --chown=runtime:runtime services/admin-api/app /app/services/admin-api/app
COPY --chown=runtime:runtime services/admin-api/migrations /app/services/admin-api/migrations
COPY --chown=runtime:runtime services/document/app /app/services/document/app
COPY --chown=runtime:runtime services/analytics/app /app/services/analytics/app
COPY --chown=runtime:runtime scripts/staging_migrate_python.py scripts/staging_database_roles.py /app/scripts/
COPY --chown=runtime:runtime deploy/scripts /app/deploy/scripts
RUN mkdir /app/storage && chown runtime:runtime /app/storage
COPY deploy/staging/service-entrypoint.sh /usr/local/bin/doccraft-entrypoint
RUN chmod 755 /usr/local/bin/doccraft-entrypoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 CMD ["python", "/app/deploy/scripts/container_health.py"]
USER runtime
ENTRYPOINT ["/usr/local/bin/doccraft-entrypoint"]
CMD ["python","-m","uvicorn","app.main:app","--app-dir","/app/services/admin-api","--host","0.0.0.0","--port","3018"]
