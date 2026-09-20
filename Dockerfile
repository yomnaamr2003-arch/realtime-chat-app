# ---- Build stage ----
FROM node:20-alpine AS base
WORKDIR /usr/src/app

# Install dependencies first for better layer caching
COPY package*.json ./
RUN npm install --omit=dev

# Copy application source
COPY . .

# SQLite database lives outside the image in a mounted volume
RUN mkdir -p /usr/src/app/data
VOLUME ["/usr/src/app/data"]

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Basic container-level health check, mirrors GET /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]
