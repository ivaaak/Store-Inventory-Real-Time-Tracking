# --- STAGE 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci

# Copy source and build TypeScript
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate && npm run build

# Drop dev dependencies for the runtime image (keeps the generated client)
RUN npm prune --omit=dev

# --- STAGE 2: Runtime ---
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

RUN mkdir -p /app/uploads /app/logs && chown -R node:node /app/uploads /app/logs
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q --spider http://localhost:3000/health || exit 1

# Apply pending migrations, then start the API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
