FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --production
RUN npx playwright install chromium --with-deps
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
