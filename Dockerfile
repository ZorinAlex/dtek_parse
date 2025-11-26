########################
## 1. Build stage
########################

FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./

RUN npm ci

COPY src ./src
RUN npm run build
RUN npm cache clean --force && rm -rf /root/.npm


########################
## 2. Runtime stage
########################

FROM node:20-slim

# Ліби для Chromium / Puppeteer
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    chromium-sandbox \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgbm1 \
    libgcc1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    lsb-release \
    wget \
    xdg-utils \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force \
  && rm -rf /root/.npm

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

ENV TZ=Europe/Kyiv

RUN if ! id -u 1000 > /dev/null 2>&1; then \
      useradd -m -u 1000 appuser; \
    else \
      useradd -m appuser || true; \
    fi && \
    chown -R appuser:appuser /app
USER appuser

VOLUME ["/app/data"]

CMD ["node", "dist/index.js"]