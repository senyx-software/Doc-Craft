FROM node:24-bookworm-slim AS build
ARG APP=user-frontend
WORKDIR /app
COPY shared ./shared
COPY ${APP} ./frontend
WORKDIR /app/frontend
ENV VITE_API_BASE_URL=/v1 VITE_ADMIN_API_BASE_URL=/api/v1
RUN npm ci --ignore-scripts && npm run build
FROM nginx:stable-alpine
COPY deploy/staging/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx","-g","daemon off;"]
