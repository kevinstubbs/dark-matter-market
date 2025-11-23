# Database Setup

This directory contains database initialization scripts, migrations, and seeding utilities.

## Structure

- `init/` - SQL scripts that run automatically when the database is first created
- `migrations/` - Database migration files managed by node-pg-migrate
- `seed.ts` - TypeScript script for seeding the database with initial data

## Database Schema

The database schema supports Dark Matter Markets (DMMs) with the following tables:

### Core Tables

- **`dmms`** - Stores Dark Matter Market information including Hedera topic ID
- **`proposals`** - Stores proposals with description, voting deadline, quorum requirements, and status

### Key Features

- **DMM Management**: Each DMM has a unique Hedera topic ID
- **Proposal Tracking**: Proposals are linked to DMMs and track voting deadlines and quorum requirements
- **Status Management**: Proposals have status tracking (active, passed, failed, expired)

## Getting Started

### 1. Start the PostgreSQL Database

```bash
docker compose up -d
```

This will:
- Start a PostgreSQL 16 container
- Create the `dark_matter_market` database
- Run any SQL files in `init/` directory on first startup

### 2. Set Environment Variables

Create a `.env.local` file in the web directory with:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/dark_matter_market

# For node-pg-migrate
PGHOST=localhost
PGPORT=6100
PGDATABASE=dark_matter_market
PGUSER=postgres
PGPASSWORD=postgres
```

### 3. Install Dependencies

```bash
pnpm install
```

### 4. Run Migrations

```bash
# Run all pending migrations
pnpm db:migrate:up

# Or use the shorthand
pnpm db:migrate
```

### 5. Seed the Database (Optional)

```bash
pnpm db:seed
```

## Migration Commands

- `pnpm db:migrate:create <migration-name>` - Create a new migration file
- `pnpm db:migrate:up` - Run all pending migrations
- `pnpm db:migrate:down` - Rollback the last migration
- `pnpm db:migrate` - Alias for `db:migrate:up`

## Creating Migrations

To create a new migration:

```bash
pnpm db:migrate:create add-users-table
```

This will create a new file in `database/migrations/` with `up` and `down` functions.

Example migration:

```javascript
exports.up = (pgm) => {
  pgm.createTable('users', {
    id: 'id',
    email: { type: 'varchar(255)', notNull: true, unique: true },
    created_at: {
      type: 'timestamp',
      notNull: true,
      default: pgm.func('current_timestamp'),
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('users');
};
```

## Initialization Scripts

Any SQL files in the `init/` directory will be executed automatically when the database container is first created. Files are executed in alphabetical order.

**Note:** These scripts only run on the first initialization. If you need to modify the schema after the database is created, use migrations instead.

## Stopping the Database

```bash
docker compose down
```

To remove all data:

```bash
docker compose down -v
```

