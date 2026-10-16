FROM node:24-bookworm-slim

# Install system dependencies (Python3, pip, venv, and Chromium)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    chromium \
    fonts-liberation \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV PYTHONPATH=/app

# Copy root workspace configurations
COPY package.json ./
COPY shared /app/shared
COPY tsconfig.base.json ./

# Copy document service configurations
COPY services/document/package.json ./services/document/
COPY services/document/tsconfig.json ./services/document/
COPY services/document/requirements.txt ./services/document/

# Set up Python virtual environment and dependencies
RUN python3 -m venv /app/services/document/.venv
RUN /app/services/document/.venv/bin/pip install --no-cache-dir -r /app/services/document/requirements.txt

# Use the system Chromium just installed above instead of letting puppeteer's
# own postinstall download a second, redundant copy — puppeteer.launch() in
# puppeteer/server.ts reads PUPPETEER_EXECUTABLE_PATH automatically, no code
# change needed. Without this, `npm install` re-downloads ~170MB of Chromium
# it never actually uses.
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Install Node.js dependencies
RUN npm install --workspace=services/document

# Copy the rest of the code
COPY services/document/ /app/services/document/

# Build TypeScript code
WORKDIR /app/services/document
RUN npm run build

EXPOSE 3013
EXPOSE 3023

CMD [".venv/bin/python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "3013"]
