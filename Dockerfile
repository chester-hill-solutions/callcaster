# syntax=docker/dockerfile:1

# ─── Build stage ──────────────────────────────────────────────────────
FROM oven/bun:1.3.5 AS builder

WORKDIR /app

# Copy dependency manifests and vendored packages (file: deps in package.json)
COPY package.json bun.lock ./
COPY vendor ./vendor

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build the application
RUN bun run build

# Prune devDependencies so the production stage ships runtime deps only
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# ─── Production stage ─────────────────────────────────────────────────
FROM oven/bun:1.3.5-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# ffmpeg is a runtime dependency, not a build tool: app/lib/audio.server.ts
# spawns it to normalize and trim uploaded audio. Without it every upload
# fails with "Audio transcoding is unavailable".
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

# Copy built assets and runtime source from builder
COPY --from=builder --chown=bun:bun /app/build ./build
COPY --from=builder --chown=bun:bun /app/public ./public
COPY --from=builder --chown=bun:bun /app/server ./server
COPY --from=builder --chown=bun:bun /app/app ./app
COPY --from=builder --chown=bun:bun /app/shared ./shared
COPY --from=builder --chown=bun:bun /app/node_modules ./node_modules
COPY --from=builder --chown=bun:bun /app/package.json ./package.json
# Bun resolves the "@/*" import alias from tsconfig paths at runtime
COPY --from=builder --chown=bun:bun /app/tsconfig.json ./tsconfig.json

USER bun

# Health check (bun fetch — curl is not available in the slim image)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD bun -e "fetch(\`http://localhost:\${process.env.PORT || 3000}/healthz\`).then((r) => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Expose port
EXPOSE 3000

# Start with Bun server
ENTRYPOINT ["bun", "run", "./server/bun.ts"]
