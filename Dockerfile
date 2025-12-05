# ==============================================
# Dockerfile for PlanificacionDH - Cloud Run
# ==============================================

# Build stage - install dependencies
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (production only)
RUN npm ci --only=production && npm cache clean --force

# ==============================================
# Production stage - minimal image
# ==============================================
FROM node:20-alpine

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs \
    && adduser -S nodejs -u 1001

# Copy node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy only necessary application files
COPY package*.json ./
COPY server.js ./
COPY db.js ./
COPY database-pg.js ./
COPY public/ ./public/

# Create uploads directory with correct permissions
RUN mkdir -p uploads && chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Cloud Run uses PORT env variable (default 8080)
ENV NODE_ENV=production
ENV PORT=8080

# Expose port
EXPOSE 8080

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 8080) + '/api/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "server.js"]
