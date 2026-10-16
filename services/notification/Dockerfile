FROM node:20-alpine AS builder

WORKDIR /app
COPY shared /app/shared

COPY package.json ./
COPY tsconfig.base.json ./

COPY services/notification/package.json ./services/notification/
COPY services/notification/tsconfig.json ./services/notification/

RUN npm install --workspace=services/notification

COPY services/notification/src ./services/notification/src/

WORKDIR /app/services/notification
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app/services/notification

ENV NODE_ENV=production

COPY --from=builder /app/shared /app/shared
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/services/notification/dist ./dist
# `tsc` only compiles .ts -> .js — it never copied these .hbs template files,
# so email.service.ts's fs.existsSync(dist/templates/<type>.hbs) was always
# false in every Docker build, and every "templated" email (welcome,
# verify_email, password_reset, etc.) silently fell back to the generic
# "Your code/token is: {{token}}" template instead of its real one.
COPY services/notification/src/templates ./dist/templates

EXPOSE 3012

CMD ["node", "dist/server.js"]
