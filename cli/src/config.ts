export const config = {
  database: {
    url: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:6100/dark_matter_market',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6380',
  },
  hedera: {
    mirrorNodeUrl: {
      mainnet: process.env.HEDERA_MIRROR_NODE_MAINNET_URL || 'https://mainnet-public.mirrornode.hedera.com',
      testnet: process.env.HEDERA_MIRROR_NODE_TESTNET_URL || 'https://testnet.mirrornode.hedera.com',
      localhost: process.env.HEDERA_MIRROR_NODE_URL || 'http://localhost:5551',
    },
  },
  cache: {
    // How often to refresh the cache (in milliseconds)
    refreshInterval: parseInt(process.env.CACHE_REFRESH_INTERVAL || '60000', 10), // Default: 60 seconds
  },
};

