FROM python:3.13-slim-bookworm@sha256:e32be0e55814a08977501ca863271d9bd02443710db8f2afaf8372e2c4508530 AS dependencies
WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -u 1000 -m runtime
COPY deploy/staging/python.constraints.txt /app/constraints.txt
COPY services/admin-api/requirements.txt /tmp/admin.txt
COPY services/document/requirements.txt /tmp/document.txt
COPY services/analytics/requirements.txt /tmp/analytics.txt
RUN python -m pip install --no-cache-dir --upgrade pip==26.2.2 setuptools==80.10.2 \
    && sed -i '/^pytest/d' /tmp/admin.txt \
    && pip install --no-cache-dir -c /app/constraints.txt -r /tmp/admin.txt -r /tmp/document.txt -r /tmp/analytics.txt
FROM python:3.13-slim-bookworm@sha256:e32be0e55814a08977501ca863271d9bd02443710db8f2afaf8372e2c4508530 AS runtime
WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
RUN useradd -u 1000 -m runtime
COPY --from=dependencies /usr/local /usr/local
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
