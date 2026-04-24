# Use a stable Python base
FROM python:3.11-slim

# Install system dependencies for Playwright, Chrome, and Node.js
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    curl \
    libglib2.0-0 \
    libnss3 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    libpangocairo-1.0-0 \
    libxshmfence1 \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (The Engine for the Dashboard)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# 1. Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. Install Playwright browsers
RUN playwright install chromium --with-deps

# 3. Copy everything from GitHub
COPY . .

# 4. INSTALL NODE MODULES (The missing piece!)
# This installs express, pino, and everything in your package.json
RUN npm install

# Ensure Playwright uses the system browser
ENV PLAYWRIGHT_BROWSERS_PATH=0

# Start the Bot in background and Server in foreground
CMD ["sh", "-c", "python bot_runner.py & node server.js"]
