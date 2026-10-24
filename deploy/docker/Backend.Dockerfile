FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY services ./services
RUN npm ci --ignore-scripts && npm run db:generate && npm run build
RUN for service in auth chat payment quota; do cp -r services/$service/src/generated services/$service/dist/generated; done
FROM build AS production-deps
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=production-deps --chown=node:node /app /app
COPY --chown=node:node scripts/staging_migrate_node.mjs /app/scripts/staging_migrate_node.mjs
COPY deploy/staging/service-entrypoint.sh /usr/local/bin/doccraft-entrypoint
RUN chmod 755 /usr/local/bin/doccraft-entrypoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD ["node", "/app/deploy/scripts/container-health.mjs"]
COPY deploy/scripts/container-health.mjs /app/deploy/scripts/container-health.mjs
USER node
ENTRYPOINT ["/usr/local/bin/doccraft-entrypoint"]
CMD ["node","services/gateway/dist/index.js"]

FROM build AS migration
COPY scripts/staging_migrate_node.mjs /app/scripts/staging_migrate_node.mjs
COPY deploy/staging/service-entrypoint.sh /usr/local/bin/doccraft-entrypoint
RUN chmod 755 /usr/local/bin/doccraft-entrypoint
USER node
ENTRYPOINT ["/usr/local/bin/doccraft-entrypoint"]
CMD ["node", "/app/scripts/staging_migrate_node.mjs"]

FROM runtime AS pdf
USER root
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
USER node
CMD ["node","services/document/dist/puppeteer/server.js"]
