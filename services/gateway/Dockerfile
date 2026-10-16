FROM node:20-alpine AS builder
WORKDIR /app
COPY shared /app/shared

# Copy workspace dependencies
COPY package.json ./
COPY tsconfig.base.json ./

# Copy gateway service files
COPY services/gateway/package.json ./services/gateway/
COPY services/gateway/tsconfig.json ./services/gateway/

# Install dependencies
RUN npm install --workspace=services/gateway

# Copy source code
COPY services/gateway/src ./services/gateway/src/

# Compile TypeScript
WORKDIR /app/services/gateway
RUN npm run build

# ─── Production Runner ────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app/services/gateway

ENV NODE_ENV=production

COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/node_modules           /app/node_modules
COPY --from=builder /app/services/gateway/dist  ./dist

EXPOSE 3001

CMD ["node", "dist/index.js"]
