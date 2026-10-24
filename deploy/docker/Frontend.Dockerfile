FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
ARG APP=user-frontend
WORKDIR /app
COPY shared ./shared
COPY ${APP} ./frontend
WORKDIR /app/frontend
ENV VITE_API_BASE_URL=/v1 VITE_ADMIN_API_BASE_URL=/api/v1
RUN npm ci --ignore-scripts && npm run build
FROM nginx:stable-alpine@sha256:970364228b1e4f932abc22d321932816782cca8a20b85a77552a7cfe9acfb3b5
COPY deploy/staging/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/
USER nginx
EXPOSE 8080
CMD ["nginx","-g","daemon off;"]
