# syntax=docker/dockerfile:1

# ─── Build stage ──────────────────────────────────────────────────────
FROM oven/bun:1.2.15 AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# ─── Production stage ─────────────────────────────────────────────────
FROM oven/bun:1.2.15-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy built assets from builder
COPY --from=builder /app/build ./build
COPY --from=builder /app/public ./public
COPY --from=builder /app/server ./server
COPY --from=builder /app/app/lib/required-env-keys.mjs ./app/lib/required-env-keys.mjs

# Copy package files for runtime dependencies
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/bun.lock ./bun.lock

# Install production dependencies only
RUN bun install --frozen-lockfile --production

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/healthz || exit 1

# Expose port
EXPOSE 3000

# Start with Bun server
ENTRYPOINT ["bun", "run", "./server/bun.ts"]
