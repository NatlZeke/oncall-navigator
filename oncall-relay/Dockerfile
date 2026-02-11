FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
RUN npx tsc
EXPOSE 8080
CMD ["node", "dist/server.js"]
