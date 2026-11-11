FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S glimms && adduser -S glimms -G glimms
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
# SQL migrations are read at runtime by `node dist/scripts/migrate.js`
# (and at boot when DB_MIGRATE_ON_START=true). Resolved as ../../supabase from dist/db.
COPY supabase/migrations ./supabase/migrations
USER glimms
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/server.js"]
