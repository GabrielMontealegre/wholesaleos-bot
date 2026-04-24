FROM mcr.microsoft.com/playwright:v1.44.0-jammy

WORKDIR /app

COPY package*.json ./

RUN npm install --prefer-offline=false

COPY . .

RUN npx playwright install --with-deps

EXPOSE 3000

CMD ["npm", "start"]
