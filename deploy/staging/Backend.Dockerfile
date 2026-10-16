FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json tsconfig.base.json ./
COPY shared ./shared
COPY services ./services
RUN npm ci --ignore-scripts && npm run db:generate && npm run build
RUN for service in auth chat payment quota; do cp -r services/$service/src/generated services/$service/dist/generated; done
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PUPPETEER_SKIP_DOWNLOAD=true
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
COPY --chown=node:node scripts/staging_migrate_node.mjs /app/scripts/staging_migrate_node.mjs
COPY deploy/staging/service-entrypoint.sh /usr/local/bin/doccraft-entrypoint
RUN chmod 755 /usr/local/bin/doccraft-entrypoint
USER node
ENTRYPOINT ["/usr/local/bin/doccraft-entrypoint"]
CMD ["node","services/gateway/dist/index.js"]

FROM runtime AS pdf
USER root
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation && rm -rf /var/lib/apt/lists/*
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
USER node
CMD ["node","services/document/dist/puppeteer/server.js"]
