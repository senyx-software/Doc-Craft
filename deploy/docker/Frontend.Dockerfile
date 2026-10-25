FROM node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205 AS build
ARG APP=user-frontend
WORKDIR /app
RUN npm install --global --ignore-scripts npm@12.2.1
COPY shared ./shared
COPY ${APP} ./frontend
WORKDIR /app/frontend
ENV VITE_API_BASE_URL=/v1 VITE_ADMIN_API_BASE_URL=/api/v1
RUN npm ci --ignore-scripts && npm run build
FROM nginx:stable-alpine@sha256:47928bf67eb62a1863cb08d9ecb52d3e704304ba614eaee17884204677702951
RUN apk upgrade --no-cache
COPY deploy/staging/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/
USER nginx
EXPOSE 8080
CMD ["nginx","-g","daemon off;"]
