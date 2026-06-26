FROM node:20-alpine

WORKDIR /repo

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/
COPY apps/webhook/package.json ./apps/webhook/
COPY apps/scheduler/package.json ./apps/scheduler/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm install

COPY . .

RUN npm run build -w packages/shared \
 && npm run build -w apps/scheduler

WORKDIR /repo/apps/scheduler
ENV NODE_ENV=production
EXPOSE 3003

CMD ["node", "dist/server.js"]
