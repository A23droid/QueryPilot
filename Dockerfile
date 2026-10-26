# syntax=docker/dockerfile:1

# ── Stage 1: Build & Prune ──
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./

# Install all dependencies (including devDependencies for TypeScript compiler)
RUN npm ci

# Copy configuration and source files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to dist/
RUN npm run build

# Prune development dependencies to keep production image minimal
RUN npm prune --omit=dev

# ── Stage 2: Production Runner ──
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Switch to non-root user built into Node.js image
USER node

# Copy runtime files with correct ownership
COPY --chown=node:node package*.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/dist ./dist

# Cloud Run injects PORT (default 8080)
EXPOSE 8080

# Run compiled MCP Server without requiring tsx in production
CMD ["node", "dist/mcp/server.js"]
