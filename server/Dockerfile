FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

COPY access.js evaluateMetrics.js muse.js pedagogy.js server.js ./

USER node
EXPOSE 8080
CMD ["node", "server.js"]
