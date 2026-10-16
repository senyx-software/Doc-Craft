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

COPY package.json ./
COPY tsconfig.base.json ./

COPY services/auth/package.json ./services/auth/
COPY services/auth/tsconfig.json ./services/auth/
COPY services/auth/prisma ./services/auth/prisma/

RUN npm install --workspace=services/auth

WORKDIR /app/services/auth
RUN npx prisma generate

COPY services/auth/src ./src/

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/services/auth

RUN apk add --no-cache openssl

ENV NODE_ENV=production

COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/services/auth/dist ./dist
COPY --from=builder /app/services/auth/src/generated ./dist/generated
COPY --from=builder /app/services/auth/prisma ./prisma

EXPOSE 3011

CMD ["node", "dist/server.js"]
