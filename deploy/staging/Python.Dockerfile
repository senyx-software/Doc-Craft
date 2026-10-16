FROM python:3.13-slim-bookworm
WORKDIR /app
ENV PYTHONPATH=/app PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN useradd -u 1000 -m runtime
COPY deploy/staging/python.constraints.txt /app/constraints.txt
COPY services/admin-api/requirements.txt /tmp/admin.txt
COPY services/document/requirements.txt /tmp/document.txt
COPY services/analytics/requirements.txt /tmp/analytics.txt
RUN pip install --no-cache-dir -c /app/constraints.txt -r /tmp/admin.txt -r /tmp/document.txt -r /tmp/analytics.txt
COPY --chown=runtime:runtime shared /app/shared
COPY --chown=runtime:runtime services/admin-api /app/services/admin-api
COPY --chown=runtime:runtime services/document/app /app/services/document/app
COPY --chown=runtime:runtime services/analytics/app /app/services/analytics/app
COPY --chown=runtime:runtime scripts /app/scripts
RUN mkdir /app/storage && chown runtime:runtime /app/storage
COPY deploy/staging/service-entrypoint.sh /usr/local/bin/doccraft-entrypoint
RUN chmod 755 /usr/local/bin/doccraft-entrypoint
USER runtime
ENTRYPOINT ["/usr/local/bin/doccraft-entrypoint"]
CMD ["python","-m","uvicorn","app.main:app","--app-dir","/app/services/admin-api","--host","0.0.0.0","--port","3018"]
