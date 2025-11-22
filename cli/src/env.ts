import { config } from 'dotenv';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local file from the CLI directory
config({ path: resolve(__dirname, '../.env.local') });

// Also try loading from parent directory (project root) if .env.local exists there
config({ path: resolve(__dirname, '../../.env.local') });

