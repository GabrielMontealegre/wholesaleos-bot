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

# Install Node.js
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

WORKDIR /app

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium --with-deps

# Copy everything from GitHub
COPY . .

# Ensure Playwright uses the system browser
ENV PLAYWRIGHT_BROWSERS_PATH=0

# THE MASTER COMMAND:
# This tells Railway: "Open a shell, start the bot in the background, 
# then start the server." No separate scripts, no permission errors.
CMD ["sh", "-c", "python bot_runner.py & node server.js"]
