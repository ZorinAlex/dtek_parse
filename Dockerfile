# Use Node.js LTS version
FROM node:20-slim

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
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
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci --only=production=false

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Remove dev dependencies and source files
RUN npm ci --only=production && \
    rm -rf src tsconfig.json node_modules/@types

# Create data directory
RUN mkdir -p /app/data

# Set Puppeteer to use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set timezone
ENV TZ=Europe/Kyiv

# Run as non-root user (check if user exists first)
RUN if ! id -u 1000 > /dev/null 2>&1; then \
      useradd -m -u 1000 appuser; \
    else \
      useradd -m appuser || true; \
    fi && \
    chown -R appuser:appuser /app
USER appuser

# Expose data directory as volume
VOLUME ["/app/data"]

# Start the application
CMD ["node", "dist/index.js"]

