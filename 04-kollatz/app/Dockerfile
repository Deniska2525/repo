FROM node:22-alpine
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY scripts.js worker.js status.js ./
CMD ["node", "worker.js"]

