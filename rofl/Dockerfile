FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY facilitator/ ./facilitator/
COPY shared/ ./shared/

# Create data directory for TEE ledger
RUN mkdir -p /data && chmod 700 /data

# Expose HTTP port for facilitator
EXPOSE 4023

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4023/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Run facilitator server
CMD ["node", "facilitator/server.js"]

