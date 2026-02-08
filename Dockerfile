# --- STAGE 1: Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (better caching)
COPY package*.json ./
COPY prisma ./prisma/
RUN npm install

# Copy source and build TypeScript
COPY . .
RUN npx prisma generate
RUN npm run build

# --- STAGE 2: Runtime ---
FROM node:20-alpine

WORKDIR /app

# Copy production dependencies and compiled code
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Create directory for SQLite database
RUN mkdir -p /app/data

# Environment variable for the SQLite path
ENV DATABASE_URL="file:/app/data/dev.db"
ENV PORT=3000

EXPOSE 3000

# Run migrations and start the app
CMD npx prisma migrate deploy && node dist/app.js