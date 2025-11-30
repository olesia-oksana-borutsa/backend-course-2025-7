FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps
COPY . .
EXPOSE 3000
CMD ["node", "main.js", "--host", "0.0.0.0", "--port", "3000", "--cache", "./my-cache"]
