# ============================================
# Stage 1: Build
# ============================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-factor 2 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    (npm ci --no-audit --prefer-offline || npm ci --no-audit --prefer-offline || npm ci --no-audit --prefer-offline)

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build TypeScript
RUN npm run build

# ============================================
# Stage 2: Production
# ============================================
FROM node:20-alpine

# Install wget for health checks and production dependencies
RUN apk add --no-cache wget

WORKDIR /app

# Install production dependencies only
COPY package*.json ./
RUN npm config set fetch-retries 5 && \
    npm config set fetch-retry-factor 2 && \
    npm config set fetch-retry-mintimeout 10000 && \
    npm config set fetch-retry-maxtimeout 120000 && \
    (npm ci --only=production --no-audit --prefer-offline || npm ci --only=production --no-audit --prefer-offline || npm ci --only=production --no-audit --prefer-offline)

# Copy built files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma/engines ./node_modules/@prisma/engines
COPY --from=builder /app/prisma ./prisma

# Create directories
RUN mkdir -p /app/uploads /app/logs

# Set permissions
RUN addgroup -g 1001 -S lea && \
    adduser -S lea -u 1001 && \
    chown -R lea:lea /app

USER lea

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:3001/health || exit 1

# Run migrations then start the application
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
