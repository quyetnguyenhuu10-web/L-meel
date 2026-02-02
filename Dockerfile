# Multi-stage build for Batch Patch System

# Stage 1: Build dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Stage 2: Production image
FROM node:20-alpine

WORKDIR /app

# Copy built dependencies from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy application code
COPY src/ ./src/
COPY phases/ ./phases/
COPY tests/ ./tests/
COPY package*.json ./
COPY README.md ./
COPY promp.md ./

# Expose monitoring port (for Prometheus if needed)
EXPOSE 9090

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "require('./src/core/PATCH_EXECUTOR.js')" || exit 1

# Set NODE_ENV
ENV NODE_ENV=production

# Run tests on container start (optional - comment out for production)
# CMD ["npm", "run", "test:all-phases"]

# Default: start bash for interactive use
CMD ["bash"]
