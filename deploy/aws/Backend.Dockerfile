FROM node:24-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN npm install --global --ignore-scripts npm@12.2.1
RUN apk upgrade --no-cache && apk add --no-cache openssl ca-certificates
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY services ./services
RUN npm ci --ignore-scripts && npm run db:generate && npm run build
RUN for service in auth chat payment quota; do cp -r services/$service/src/generated services/$service/dist/generated; done
FROM build AS production-deps
RUN npm prune --omit=dev --ignore-scripts

FROM node:24-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53 AS runtime
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
RUN apk upgrade --no-cache && apk add --no-cache openssl ca-certificates
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
RUN apk add --no-cache chromium font-liberation && test -x /usr/bin/chromium-browser
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
USER node
CMD ["node","services/document/dist/puppeteer/server.js"]
