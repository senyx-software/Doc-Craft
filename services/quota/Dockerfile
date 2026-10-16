FROM node:20-alpine AS builder
WORKDIR /app
COPY shared /app/shared

# node:20-alpine ships OpenSSL 3, but without openssl installed at all,
# `prisma generate` can't detect any version and silently defaults to
# generating an openssl-1.1.x engine binary (verified via the real crash:
# "Error loading shared library libssl.so.1.1: No such file or directory") —
# installing it here fixes generation, and again in the runner stage below
# fixes the engine actually loading at runtime.
RUN apk add --no-cache openssl

# Copy root workspace files
COPY package.json ./
COPY tsconfig.base.json ./

# Copy service files
COPY services/quota/package.json ./services/quota/
COPY services/quota/tsconfig.json ./services/quota/
COPY services/quota/prisma ./services/quota/prisma/

# Install dependencies
RUN npm install --workspace=services/quota

# Generate Prisma client
WORKDIR /app/services/quota
RUN npx prisma generate

# Copy source
COPY services/quota/src ./src/

# Build TypeScript
RUN npm run build

# ─── Production image ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app/services/quota

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/node_modules           /app/node_modules
COPY --from=builder /app/services/quota/dist  ./dist
COPY --from=builder /app/services/quota/src/generated ./dist/generated
COPY --from=builder /app/services/quota/prisma ./prisma

EXPOSE 3015

CMD ["node", "dist/server.js"]
