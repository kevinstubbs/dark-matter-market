# Topic Cache CLI

This CLI application caches Hedera Consensus Service (HCS) topic messages in Redis for fast retrieval by the web application.

## Setup

1. Install dependencies:
```bash
pnpm install
```

2. Create a `.env.local` file in the `cli/` directory (or project root) with your configuration:
```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dark_matter_market
REDIS_URL=redis://localhost:6379
HEDERA_MIRROR_NODE_MAINNET_URL=https://mainnet-public.mirrornode.hedera.com
HEDERA_MIRROR_NODE_TESTNET_URL=https://testnet.mirrornode.hedera.com
CACHE_REFRESH_INTERVAL=60000
```

The CLI will automatically load `.env.local` from either the `cli/` directory or the project root.

## Usage

Run the cache update once:
```bash
pnpm dev
# or
pnpm cache:topics
```

Build and run:
```bash
pnpm build
pnpm start
```

## How it works

1. Fetches all DMM topics from the database
2. For each topic, checks if there's cached data in Redis
3. If cached data exists, fetches only new messages (incremental update)
4. If no cached data, fetches all messages from Hedera mirror node
5. Stores messages in Redis with keys: `topic:{topicId}:messages`
6. Stores last sequence number for incremental updates: `topic:{topicId}:last_sequence`

## Running as a service

You can run this as a scheduled job (e.g., using cron) to keep the cache updated:

```bash
# Run every minute
* * * * * cd /path/to/cli && pnpm cache:topics
```

Or use a process manager like PM2 to run it continuously with a delay:

```bash
pm2 start "pnpm cache:topics" --cron "*/1 * * * *" --name topic-cache
```

