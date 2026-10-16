FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json tsconfig.base.json ./
COPY shared ./shared
COPY services/document/package.json services/document/tsconfig.json ./services/document/
RUN npm install --workspace=services/document --ignore-scripts
COPY services/document/puppeteer ./services/document/puppeteer
WORKDIR /app/services/document
RUN npm run build

FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends chromium fonts-liberation ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app/services/document
ENV NODE_ENV=production PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/services/document/dist ./dist
USER node
CMD ["node","dist/puppeteer/server.js"]
