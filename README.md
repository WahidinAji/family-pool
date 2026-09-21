# family-pool

Self-hosted app for managing shared recurring costs (cost-split pools like Spotify) and
rotating savings pots (arisan) within invite-only rooms. See [PLAN.md](./PLAN.md) for the
full build plan and locked-in product decisions.

## Stack

pnpm workspace · React + TanStack Router/Query + tRPC (web) · Effect (server) ·
Drizzle ORM + SQLite (db) · Tailwind + shadcn/ui.

## Local dev setup

1. **Install dependencies** (from repo root):

   ```sh
   pnpm install
   ```

2. **Configure environment**:

   ```sh
   cp .env.example .env
   ```

   Fill in `RESEND_API_KEY` (magic-link login emails) and `VISION_API_KEY` (receipt OCR).
   Defaults are fine for everything else in local dev.

3. **Run database migrations**:

   ```sh
   pnpm db:generate   # generate SQL from packages/db/src/schema.ts
   pnpm db:migrate    # apply migrations to the local SQLite file
   ```

4. **Run the app** (two terminals):

   ```sh
   pnpm dev:server    # tRPC/Effect server on :4000
   pnpm dev:web       # Vite dev server on :5173
   ```

   Open http://localhost:5173 — the homepage pings the server over tRPC to confirm the
   two are wired up.

## Project layout

```
apps/
  web/      React + TanStack Router/Query + tRPC client + Tailwind/shadcn
  server/   Effect + tRPC server, talks to packages/db
packages/
  db/       Drizzle ORM schema + SQLite client, migrations
  shared/   Types/zod schemas shared between web and server
```
