# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy workspace configuration files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy web package files
COPY web/package.json ./web/

# Install dependencies (this will install for the workspace)
RUN pnpm install --frozen-lockfile

# Copy web source code
COPY web/ ./web/

# Build the application
WORKDIR /app/web
RUN pnpm build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV production

# Install pnpm
RUN npm install -g pnpm

# Create .npmrc to set pnpm store location (accessible to all users)
RUN echo "store-dir=/app/.pnpm-store" > /app/.npmrc

# Copy workspace configuration files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy web package files
COPY web/package.json ./web/

# Install production dependencies only
# Note: We need TypeScript for next.config.ts, so install it in the web package
RUN pnpm install --prod --frozen-lockfile && \
    cd web && pnpm add --save-prod typescript@^5

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application from builder to web directory
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/web/public ./web/public
COPY --from=builder /app/web/next.config.ts ./web/
COPY --from=builder /app/web/tsconfig.json ./web/

# Change ownership of app directory (including node_modules and pnpm store)
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

WORKDIR /app/web
CMD ["pnpm", "start"]

