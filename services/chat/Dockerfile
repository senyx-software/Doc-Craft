FROM node:20-bookworm-slim AS builder

WORKDIR /app

RUN apt-get update -y \
    && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY shared /app/shared
COPY tsconfig.base.json ./tsconfig.base.json
COPY services/chat/package.json ./services/chat/package.json
COPY services/chat/package-lock.json ./services/chat/package-lock.json
COPY services/chat/tsconfig.json ./services/chat/tsconfig.json
COPY services/chat/prisma ./services/chat/prisma

WORKDIR /app/services/chat

RUN npm install --legacy-peer-deps --no-audit --no-fund

# Generate Prisma Client
RUN npx prisma generate

COPY services/chat/src ./src

RUN npm run build
# Copy the Prisma generated client into dist, explicitly excluding Windows binaries.
# The Linux .so.node library engine is the only binary needed in the container.
# `runtime/` (holding library.js, the module index.js actually requires) was
# previously missing from this list, which crashed the container at startup:
# "Cannot find module './runtime/library.js'".
RUN mkdir -p dist/generated/prisma && \
    cp -r src/generated/prisma/*.js \
           src/generated/prisma/*.d.ts \
           src/generated/prisma/package.json \
           src/generated/prisma/schema.prisma \
           src/generated/prisma/runtime \
           dist/generated/prisma/ && \
    cp src/generated/prisma/libquery_engine-debian-openssl-3.0.x.so.node \
       dist/generated/prisma/ 2>/dev/null || true


FROM node:20-bookworm-slim AS runner

WORKDIR /app/services/chat

RUN apt-get update -y \
    && apt-get install -y openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=builder /app/services/chat/package.json ./package.json
COPY --from=builder /app/services/chat/package-lock.json ./package-lock.json
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund

COPY --from=builder /app/services/chat/dist ./dist
COPY --from=builder /app/shared /app/shared
RUN npm install --prefix /app/shared --omit=dev --ignore-scripts --no-audit --no-fund
COPY --from=builder /app/services/chat/prisma ./prisma

EXPOSE 3016

CMD ["node", "dist/server.js"]
