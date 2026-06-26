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

WORKDIR /repo/apps/web
EXPOSE 5173

# Dev server with HMR. Volumes in docker-compose mount ./apps/web for hot reload.
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
