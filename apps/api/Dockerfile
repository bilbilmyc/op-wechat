# Single-stage Dockerfile for Phase 1. Multi-stage build deferred to M8 polish.
# Use Debian slim (not Alpine) because Prisma's runtime OpenSSL detection is
# more reliable on glibc than musl.
FROM node:20-slim

WORKDIR /repo

# Copy root + workspace manifests first for better Docker layer caching
COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/webhook/package.json ./apps/webhook/
COPY apps/scheduler/package.json ./apps/scheduler/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm install --no-audit --no-fund

# Now copy the rest of the source
COPY . .

# Wipe any stale .prisma client cache (host-generated binaries linger and
# can confuse the engine's runtime detection), then regenerate for this
# architecture, then build shared and this app.
RUN rm -rf node_modules/.prisma \
 && npx prisma generate --schema=apps/api/prisma/schema.prisma \
 && npm run build -w packages/shared \
 && npm run build -w apps/api

WORKDIR /repo/apps/api
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/server.js"]
