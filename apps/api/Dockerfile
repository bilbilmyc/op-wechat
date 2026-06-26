# Single-stage Dockerfile for Phase 1. Multi-stage build deferred to M8 polish.
FROM node:20-alpine

WORKDIR /repo

# Copy root + workspace manifests first for better Docker layer caching
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/webhook/package.json ./apps/webhook/
COPY apps/scheduler/package.json ./apps/scheduler/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm install

# Now copy the rest of the source
COPY . .

# Build shared first, then this app
RUN npm run build -w packages/shared \
 && npm run build -w apps/api

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/server.js"]
