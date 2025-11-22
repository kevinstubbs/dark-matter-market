# Dark Matter Market

A decentralized governance platform for Dark Matter Markets (DMMs) built on Hedera Consensus Service.

## Project Structure

This is a monorepo managed with pnpm workspaces and Turbo:

- `web/` - Next.js web application
- `cli/` - CLI application for caching Hedera topic messages in Redis

## Prerequisites

- Node.js >= 20.0.0
- pnpm >= 8.0.0
- Docker and Docker Compose (for PostgreSQL and Redis)

## Setup

1. Install dependencies from the root:
```bash
pnpm install
```

2. Set up environment variables:
   - Create `.env.local` in the `web/` directory for the web app
   - Create `.env.local` in the `cli/` directory (or project root) for the CLI

3. Start Docker services (PostgreSQL and Redis):
```bash
docker-compose up -d
```

4. Run database migrations:
```bash
pnpm db:migrate
```

5. Seed the database:
```bash
pnpm db:seed
```

## Development

Run all packages in development mode:
```bash
pnpm dev
```

Run specific package:
```bash
# Web app only
pnpm --filter web dev

# CLI only
pnpm --filter topic-cache-cli dev
```

## Building

Build all packages:
```bash
pnpm build
```

Build specific package:
```bash
pnpm --filter web build
pnpm --filter topic-cache-cli build
```

## Available Scripts

### Root Level
- `pnpm dev` - Run all packages in dev mode
- `pnpm build` - Build all packages
- `pnpm lint` - Lint all packages
- `pnpm clean` - Clean all build artifacts
- `pnpm db:migrate` - Run database migrations
- `pnpm db:seed` - Seed the database
- `pnpm cache:topics` - Run the topic cache CLI

### Web Package
- `pnpm --filter web dev` - Start Next.js dev server
- `pnpm --filter web build` - Build Next.js app
- `pnpm --filter web db:migrate` - Run migrations
- `pnpm --filter web db:seed` - Seed database

### CLI Package
- `pnpm --filter topic-cache-cli dev` - Run CLI in dev mode
- `pnpm --filter topic-cache-cli build` - Build CLI
- `pnpm --filter topic-cache-cli cache:topics` - Cache topic messages

## Docker

Build and run all services:
```bash
docker-compose up -d
```

This will start:
- PostgreSQL on port 5433
- Redis on port 6379
- Web application on port 3000 (if built)

## Architecture

- **Web App**: Next.js application that displays DMMs and proposals, reads topic messages from Redis cache
- **CLI**: Background service that fetches topic messages from Hedera mirror node and caches them in Redis
- **Database**: PostgreSQL stores DMMs, proposals, and related data
- **Cache**: Redis stores cached Hedera topic messages for fast retrieval

