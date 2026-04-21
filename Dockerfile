FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package.json ./
RUN npm install && npx playwright install --with-deps --production

# Copy source
COPY . .

# Create data directory
RUN mkdir -p data

EXPOSE 3000

CMD ["node", "bot.js"]
