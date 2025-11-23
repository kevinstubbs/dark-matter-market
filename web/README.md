# Dark Matter Markets Web

This is a [Next.js](https://nextjs.org) project for Dark Matter Markets (DMMs) - a DAO governance system built on Hedera.

## Prerequisites

- [Node.js](https://nodejs.org/) (v20 or higher)
- [pnpm](https://pnpm.io/) (or npm/yarn)
- [Docker](https://www.docker.com/) and Docker Compose

## Getting Started

Follow these steps to set up and run the project:

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start the Database

Start the PostgreSQL database using Docker Compose:

```bash
docker compose up -d
```

This will:
- Start a PostgreSQL 16 container
- Create the `dark_matter_market` database
- Expose PostgreSQL on port `6100` (to avoid conflicts with local PostgreSQL)

To verify the database is running:
```bash
docker compose ps
```

### 3. Configure Environment Variables

Create a `.env.local` file in the `web` directory:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:6100/dark_matter_market

# For node-pg-migrate
PGHOST=localhost
PGPORT=6100
PGDATABASE=dark_matter_market
PGUSER=postgres
PGPASSWORD=postgres
```

### 4. Run Database Migrations

Set up the database schema:

```bash
pnpm db:migrate
```

This will create the necessary tables (`dmms` and `proposals`).

### 5. Seed the Database (Optional)

Populate the database with initial test data:

```bash
pnpm db:seed
```

This will create a test DMM for Hedera testnet.

### 6. Start the Development Server

Run the Next.js development server:

```bash
pnpm dev
```

The application will be available at [http://localhost:3000](http://localhost:3000).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Available Scripts

- `pnpm dev` - Start the development server
- `pnpm build` - Build the application for production
- `pnpm start` - Start the production server
- `pnpm lint` - Run ESLint
- `pnpm db:migrate` - Run all pending database migrations
- `pnpm db:migrate:up` - Run all pending migrations (alias for `db:migrate`)
- `pnpm db:migrate:down` - Rollback the last migration
- `pnpm db:migrate:create <name>` - Create a new migration file
- `pnpm db:seed` - Seed the database with initial data

## Database Management

### Stop the Database

```bash
docker compose down
```

### Remove All Database Data

```bash
docker compose down -v
```

**Warning:** This will delete all data in the database.

### View Database Logs

```bash
docker compose logs -f postgres
```

For more detailed database information, see [database/README.md](./database/README.md).

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
