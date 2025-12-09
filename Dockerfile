FROM node:18-alpine
WORKDIR /app

# Add build argument for cache busting (Railway: set RAILWAY_CACHE_BUST env var)
ARG CACHE_BUST=1
RUN echo "Cache bust: $CACHE_BUST"

# Copy package files first for better layer caching
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Clear any existing build artifacts to avoid stale cache issues
# This ensures fresh builds on Railway (case-sensitive filesystem)
RUN rm -rf build public/build node_modules/.cache

# Build the application
RUN npm run build

# Railway automatically provides PORT environment variable
# Expose default port (Railway will override with their PORT)
EXPOSE 3000

# Start the application
CMD npm start
