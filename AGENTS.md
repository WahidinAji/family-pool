# AGENTS.md

Context for any agent (or human) picking up work in this repo.
Always generate a commit message at the end of the summary after finishing the plan.*

## What this is

A self-hosted, invite-only web app for managing shared recurring costs (cost-split pools,
e.g. Spotify) and rotating savings pots (arisan) inside "rooms" (family/friends/colleagues).
Members upload transfer receipts; the app OCRs the amount and tracks a running balance
ledger per member per pool.

**`PLAN.md` is the source of truth for scope and product decisions.** It came out of a full
requirements interview — read its "Product Decisions (locked)" section before assuming
anything about behavior that isn't obvious from the code. Do not re-litigate those decisions
mid-implementation without flagging it to the user first. Work through `PLAN.md` phase by
phase, and check off tasks (`- [ ]` → `- [x]`) as they're completed.

## Stack

pnpm workspace · React + TanStack Router/Query + tRPC client (`apps/web`) · Effect + tRPC
server (`apps/server`) · Drizzle ORM + SQLite (`packages/db`) · Tailwind v4 + shadcn/ui.

Effect is backend-only — the frontend is plain React + TanStack, not Effect's Model/init/view
architecture. Don't introduce Effect on the frontend.

## Layout

```
apps/
  web/      React + TanStack Router/Query + tRPC client + Tailwind/shadcn
  server/   Effect + tRPC server (src/main.ts runs it; src/index.ts is a
            side-effect-free type-only export of AppRouter for the web app)
packages/
  db/       Drizzle schema (src/schema.ts), migrations/, dev seed script
  shared/   Types/zod schemas shared between web and server (mostly empty so far)
```

## Commands

```sh
pnpm install
cp .env.example .env       # fill in RESEND_API_KEY, VISION_API_KEY

pnpm db:generate            # regenerate SQL migration after editing schema.ts
pnpm db:migrate             # apply migrations to the local SQLite file
pnpm db:seed                # reset + seed dev data (5 users, 1 room, both pool types)

pnpm dev:server              # tRPC/Effect server on :4000
pnpm dev:web                 # Vite dev server on :5173
```

Typecheck a single package directly when iterating, e.g.
`pnpm --filter @family-pool/server exec tsc --noEmit -p .` or
`pnpm --filter @family-pool/web exec tsc -b --noEmit --force`.

## Conventions established so far

- **Balance model**: `pool_ledger_entries` is append-only and is the source of truth for a
  member's balance in a pool (`SUM(amount_delta)`). "Paid through month X" / arisan turn
  status is always a *derived* calculation from balance + price history — never store or
  hand-edit a derived value.
- **Money**: integer minor units, never floats. Single currency per room (default IDR).
- **IDs**: `text` primary keys via `crypto.randomUUID()` (see `id()` helper in `schema.ts`).
- **Timestamps**: `integer` with `mode: 'timestamp'`, DB-level default `(unixepoch())` so raw
  inserts always get one even outside the app layer.
- **Authorization**: every money-affecting mutation must check the caller is the room/pool
  **owner** — there's no co-admin role (deferred; see PLAN.md).
- **Comments**: only where the *why* isn't obvious from the code (e.g. a schema column's
  purpose that isn't self-evident). Don't narrate what code does.
- Package `index.ts` files that other workspace packages import types from must stay
  side-effect-free (see `apps/server/src/index.ts` vs `main.ts`) — importing for a type must
  never risk starting a server, opening a DB connection, etc.

## Known gotchas hit during setup

- The `shadcn` CLI (v4.21+) targets **Tailwind v4** CSS-first theming (`@theme inline`) —
  don't reintroduce a `tailwind.config.js`/PostCSS v3 setup, it's incompatible with the
  generated component styles.
- The `shadcn add` CLI has a bug in this environment where it sometimes writes files under a
  literal `./@/...` directory instead of resolving the `@/*` alias — check for a stray `@`
  folder after running it.
- `apps/server`'s dev process (`tsx watch`) can crash with `EADDRINUSE` if a previous
  background instance is still holding the port — check for and kill stray `tsx`/`node`
  processes before assuming the server code itself is broken.
