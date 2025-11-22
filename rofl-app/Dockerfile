FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --production

# Copy built JavaScript (compiled from TypeScript)
COPY dist/ ./dist/

# Create data directory for sealed storage
RUN mkdir -p /data && chmod 700 /data

# Expose HTTP port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run ROFL app
CMD ["node", "dist/index.js"]

