# Use a stable Python base
FROM python:3.11-slim

# Install system dependencies for Playwright and Node.js
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

# Install Node.js (This ensures your server.js has its engine)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium --with-deps

# Copy everything from GitHub to the server
COPY . .

# Ensure Playwright uses the system browser
ENV PLAYWRIGHT_BROWSERS_PATH=0

# THE MASTER COMMAND: 
# This starts the bot in the background (&) and the server in the foreground.
# This is the most stable way to run a hybrid app on Railway.
CMD python bot_runner.py & node server.js
