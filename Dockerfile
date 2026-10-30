FROM node:20-alpine AS base

WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci

EXPOSE 3000

FROM node:20-alpine AS frontend

WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM base AS dev

WORKDIR /app
COPY . .
COPY --from=frontend /app/client/dist /app/server/public
WORKDIR /app/server
CMD ["npm", "run", "dev"]

FROM node:20-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app/server

COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

COPY server/src ./src
COPY --from=frontend /app/client/dist ./public

USER node
EXPOSE 3000
CMD ["npm", "start"]
