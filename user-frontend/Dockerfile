FROM node:20-alpine
WORKDIR /app/user-frontend
COPY user-frontend/package.json user-frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY user-frontend/ ./
COPY shared/ /app/shared/
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
