FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Set polling mode for Windows Docker volume compatibility
ENV WATCHPACK_POLLING=true
ENV CHOKIDAR_USEPOLLING=true

CMD ["npm", "run", "dev"]
