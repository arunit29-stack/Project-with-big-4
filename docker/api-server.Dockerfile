# syntax=docker/dockerfile:1.7
FROM node:22-alpine AS base
WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build:server

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodejs && adduser -S api -G nodejs
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
USER api
EXPOSE 4000
CMD ["node", "dist/server.js"]
