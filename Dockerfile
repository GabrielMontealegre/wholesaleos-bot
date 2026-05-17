FROM node:20-slim
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=0
COPY package*.json ./
RUN npm install --production
RUN npx playwright install chromium --with-deps \
  && node -e "const { chromium } = require('playwright'); console.log('Playwright Chromium:', chromium.executablePath())"
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
