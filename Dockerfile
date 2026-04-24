# Use a stable Python version
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

# Install Node.js (The Receptionist)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs

# Set the working directory
WORKDIR /app

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install Playwright browsers
RUN playwright install chromium --with-deps

# Copy the rest of the application code
COPY . .

# Ensure Playwright uses the system browser
ENV PLAYWRIGHT_BROWSERS_PATH=0

# Run the Master Start Script
CMD ["sh", "start.sh"]
