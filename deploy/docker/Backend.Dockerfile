FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --global --ignore-scripts npm@12.2.1
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY services ./services
RUN npm ci --ignore-scripts && npm run db:generate && npm run build
RUN for service in auth chat payment quota; do cp -r services/$service/src/generated services/$service/dist/generated; done
FROM build AS production-deps
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS runtime
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
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
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
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
