FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

# Every file server.js imports, directly or not. Tests, preflight and tools are left out on purpose.
COPY access.js evaluateMetrics.js historyProof.js lessons.js muse.js outputScreen.js pedagogy.js ruleOptions.js safety.js safetyTerms.js server.js ./

USER node
EXPOSE 8080
CMD ["node", "server.js"]
