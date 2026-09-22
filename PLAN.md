# Family/Group Subscription & Arisan Manager — Implementation Plan

Source of truth for scope: this doc reflects a full requirements interview (grilling session), not just the initial idea. Decisions already locked in are listed in **Product Decisions** — do not re-litigate them mid-implementation without flagging it to the user first.

## Product Decisions (locked)

- **Multi-tenant, public app.** Anyone can sign up. Self-signup is via **magic link email only** (no passwords), sent through **Resend** (already has free-tier account).
- **Rooms** are the top-level container (family/friends/colleagues/etc — generic, not just "family"). A room has one **Owner** (full admin) and **Members**. No other roles.
  - Joining a room happens only via a **reusable, owner-revocable invite link/code** — no public room directory.
  - A user can belong to many rooms.
- A room contains one or more **Pools**. Two pool types:
  - **Cost-split** (e.g. Spotify): recurring fixed price, equal split by default, optional per-member override amount.
  - **Rotating-pot** (Arisan): recurring contribution; each period the app runs a **random draw** for who receives the pot; a member is excluded from future draws in the current cycle once they've won, until everyone in the cycle has won once; **owner manually starts** each new cycle.
- **Pool membership is dynamic**: join/leave dates are tracked; calculations only apply to a member's active date range. Leaving with a nonzero balance just marks the membership **inactive** — balance is preserved as a historical record, never blocked or force-zeroed.
- **Receipts**: member uploads a receipt image. Amount is extracted via a **server-side OCR boundary** (self-hosted Go + Tesseract service for v1, replaceable later; never from the browser directly). Owner **approves/rejects**; only approved receipts count toward balance. Images stored on a **local Docker volume**.
- **Balance model**: a running **currency balance per member per pool** is the source of truth (ledger of deltas). "Paid through month X" / "whose turn in arisan" is a **derived display calculation** from balance + price history — never hand-edited directly.
- **Currency**: single currency per room, integer minor-unit storage (no floats), default IDR.
- **Notifications**: in-app only for v1. No email beyond the magic-link login itself.
- **Stack**: pnpm monorepo; **React + TanStack Router + TanStack Query + tRPC** frontend; **Effect** on the backend only; **Drizzle ORM + SQLite**; **Tailwind + shadcn/ui**.
- **Infra**: self-hosted on homelab via **Docker**, exposed through the existing **cloudflared tunnel** (Cloudflare Zero Trust). Single-node deployment — this is why SQLite is the right call (no serverless/ephemeral-filesystem problem). Back up the SQLite file with **Litestream** or a volume-snapshot cron given it tracks real money.
- **Accessibility**: target **WCAG 2.1 Level AA** across the app (color contrast ratios — 4.5:1 for normal text, 3:1 for large text/UI components — keyboard navigation, focus indicators, semantic HTML/ARIA labels). For color specifically, follow **colorblind-safe design** (the **Okabe–Ito palette** / **Color Universal Design (CUD)** principles, the internationally-cited standard for this): never encode meaning in color alone — pair it with text, an icon, or a sign (e.g. balance owed already renders as "-Rp400.000" not just red text; keep that pattern everywhere status is shown). This is a standing constraint on every phase from here on, not a one-time Phase 7 task.
- **UI themes**: the app ships **two visual themes** — `modern` (default shadcn look) and `retro` (a Windows XP "Luna" pastiche) — toggled by the user exactly like dark/light mode (a class on `<html>`, persisted to localStorage), not separate pages or a build flag. Implemented entirely as CSS keyed off shadcn's `data-slot` attributes (see `apps/web/src/index.css` and `AGENTS.md`); no component file forks between themes. Any new component or page must render acceptably in both.
- Explicitly deferred to post-v1 (do not build now): co-admin role, email/push notifications beyond login, multi-currency per room, object storage (MinIO), OAuth login.

---

## Phase 0 — Repo & Tooling Scaffolding

- [x] 0.1 Init pnpm monorepo (`pnpm-workspace.yaml`) with `apps/web`, `apps/server` (or a single `apps/app` if frontend+backend are colocated — decide based on whether tRPC server lives inside the same process as the web server), `packages/db`, `packages/shared` (shared types/schemas).
- [x] 0.2 Add root `tsconfig.base.json`, ESLint + Prettier config, `.editorconfig`.
- [x] 0.3 Set up `packages/db`: Drizzle ORM + `better-sqlite3` (or `libsql` driver), `drizzle-kit` config pointing at a local SQLite file under a `data/` dir (gitignored).
- [x] 0.4 Scaffold `apps/web` with Vite + React + TanStack Router + TanStack Query.
- [x] 0.5 Install and configure Tailwind + shadcn/ui in `apps/web` (init, theme tokens, base components: button, input, card, dialog, dropdown, toast).
- [x] 0.6 Scaffold the server app (Node/Effect) exposing a tRPC HTTP endpoint; wire a health-check route.
- [x] 0.7 Wire tRPC client in `apps/web` to the server, confirm a round-trip `ping` query works end to end.
- [x] 0.8 Add `.env.example` covering: `DATABASE_PATH`, `RESEND_API_KEY`, `RESEND_FROM_ADDRESS`, `VISION_API_KEY`, `SESSION_SECRET`, `PUBLIC_APP_URL`.
- [x] 0.9 Write root `README.md` with local dev setup steps (install, env, migrate, run).

## Phase 1 — Core Schema & Migrations

Build tables in dependency order; one migration per numbered item so history stays reviewable.

- [x] 1.1 `users` (id, email unique, display_name nullable, created_at).
- [x] 1.2 `magic_link_tokens` (id, email, token_hash, expires_at, consumed_at nullable, created_at).
- [x] 1.3 `sessions` (id, user_id, expires_at, created_at) — DB-backed sessions (not JWT), so a session can be revoked by deleting the row.
- [x] 1.4 `rooms` (id, name, created_by_user_id, created_at).
- [x] 1.5 `room_memberships` (id, room_id, user_id, role enum['owner','member'], joined_at, left_at nullable). Unique constraint on (room_id, user_id).
- [x] 1.6 `room_invites` (id, room_id, code unique, created_by_user_id, revoked_at nullable, created_at).
- [x] 1.7 `pools` (id, room_id, type enum['cost_split','rotating_pot'], name, currency_code default 'IDR', period enum['monthly'] for now, created_at, archived_at nullable).
- [x] 1.8 `pool_price_history` (id, pool_id, effective_from date, per_person_amount integer, created_at) — the pool's default equal-split price over time.
- [x] 1.9 `pool_memberships` (id, pool_id, user_id, joined_at, left_at nullable). Unique on (pool_id, user_id).
- [x] 1.10 `pool_membership_overrides` (id, pool_membership_id, effective_from date, amount integer, created_at) — optional custom price overriding the pool default for that member from that date.
- [x] 1.11 `receipts` (id, pool_id, uploaded_by_user_id, image_path, extracted_amount integer nullable, confirmed_amount integer nullable, status enum['pending','approved','rejected'], reviewed_by_user_id nullable, reviewed_at nullable, ocr_raw jsonb/text nullable, created_at).
- [x] 1.12 `pool_ledger_entries` (id, pool_membership_id, receipt_id nullable, amount_delta integer, reason enum['contribution','adjustment','pot_payout'], created_at) — append-only; balance = SUM(amount_delta) per pool_membership.
- [x] 1.13 `rotating_pot_cycles` (id, pool_id, cycle_number, started_at, ended_at nullable).
- [x] 1.14 `rotating_pot_rounds` (id, cycle_id, round_number, period_label, winner_pool_membership_id nullable, drawn_at nullable, status enum['pending','drawn','paid'] — 'paid' added in Phase 5 for recordPayout idempotency).
- [x] 1.15 Seed script: one test room, one cost-split pool, one rotating-pot pool, a few fake users/memberships — for local dev only.

## Phase 2 — Auth (Magic Link via Resend)

- [x] 2.1 Server: `requestMagicLink(email)` — create/find user by email, generate token, store hashed token + expiry (e.g. 15 min) in `magic_link_tokens`.
- [x] 2.2 Integrate Resend SDK; send the magic-link email (plain, clear subject/body — this is the *only* login path, so make it unmistakable and check spam-safe formatting).
- [x] 2.3 Server: `verifyMagicLink(token)` — validate token (exists, unexpired, unconsumed), mark consumed, create a session row, return session cookie.
- [x] 2.4 Rate-limit `requestMagicLink` per email/IP (e.g. max 3 requests / 10 min) to prevent email-bombing abuse — this is a public signup form.
- [x] 2.5 Session middleware: read session cookie, attach `currentUser` to tRPC context; reject/redirect when missing or expired.
- [x] 2.6 Frontend: "enter your email" page → "check your email" confirmation state.
- [x] 2.7 Frontend: `/auth/callback?token=...` route that calls `verifyMagicLink` and redirects into the app on success, shows a clear error + "request a new link" CTA on failure/expiry.
- [x] 2.8 Logout: delete session row, clear cookie.
- [x] 2.9 Auth guard on the router: unauthenticated users get bounced to the login page for any protected route.

## Phase 3 — Rooms & Invites

- [x] 3.1 tRPC: `room.create` (name) — creates room + an owner `room_memberships` row for the creator.
- [x] 3.2 tRPC: `room.listMine` — rooms the current user belongs to (owner or member), with role.
- [x] 3.3 tRPC: `room.get(roomId)` — room detail + membership list; enforce caller is a member.
- [x] 3.4 tRPC: `room.createInvite(roomId)` / `room.revokeInvite(roomId)` — owner-only; generates/revokes the reusable code.
- [x] 3.5 tRPC: `room.joinByInvite(code)` — validates invite is not revoked, creates a `room_memberships` row for the caller (role = member) if not already a member.
- [x] 3.6 tRPC: `room.removeMember` / `room.leaveRoom` — owner can't leave/remove themself without transferring ownership or deleting the room (decide + document this edge case explicitly in code comments since it's a real corner case).
- [x] 3.7 Frontend: room list/dashboard page.
- [x] 3.8 Frontend: room detail page shell (tabs: Pools, Members, Settings) — pools/members tabs get filled in later phases.
- [x] 3.9 Frontend: "join a room" flow (paste/open invite link → confirm → join).
- [x] 3.10 Frontend: invite management UI (owner-only): show current link, copy button, regenerate/revoke.

## Phase 4 — Cost-Split Pools (Spotify-style)

- [x] 4.1 tRPC: `pool.create` (roomId, type='cost_split', name, initialPricePerPerson, currency) — owner-only; writes `pools` + first `pool_price_history` row.
- [x] 4.2 tRPC: `pool.addMember` / `pool.removeMember` (sets joined_at/left_at on `pool_memberships`) — owner-only; only room members can be added.
- [x] 4.3 tRPC: `pool.setMemberOverride` (poolMembershipId, amount, effectiveFrom) — owner-only; writes `pool_membership_overrides`.
- [x] 4.4 tRPC: `pool.updatePrice` (poolId, newPricePerPerson, effectiveFrom) — owner-only; appends a new `pool_price_history` row (never mutates old rows).
- [x] 4.5 Core calc module (pure functions, unit-testable): given a pool_membership's ledger balance + effective price-per-period history, compute "paid through" period and current balance in currency. This is the single most important piece of business logic — isolate it from tRPC/DB code so it can be tested directly.
- [x] 4.6 Unit tests for the calc module: on-time payment, prepay multiple periods, underpay/partial period, price change mid-history, member joined mid-cycle, member left with residual balance.
- [x] 4.7 tRPC: `pool.getStatus(poolId)` — returns per-member computed status (balance, paid-through period) using the calc module.
- [x] 4.8 Frontend: pool detail page — member list with balance/paid-through, "add pool" form, price/override edit UI (owner-only).

## Phase 5 — Rotating-Pot Pools (Arisan)

- [x] 5.1 tRPC: `pool.create` variant for `type='rotating_pot'` (roomId, name, contributionAmount, currency).
- [x] 5.2 tRPC: `pool.startCycle(poolId)` — owner-only; creates a `rotating_pot_cycles` row and one `rotating_pot_rounds` row per active pool member (round_number 1..N), all `status='pending'`.
- [x] 5.3 tRPC: `pool.drawRound(cycleId, roundNumber)` — owner-only; randomly selects a winner from members who haven't won *this cycle* yet, writes `winner_pool_membership_id` + `drawn_at`, sets `status='drawn'`.
- [x] 5.4 tRPC: `pool.recordPayout(roundId)` — writes a `pool_ledger_entries` row (reason='pot_payout') crediting the winner (or however payout is represented — confirm sign convention with the balance model before building).
- [x] 5.5 Cycle-completion detection: when every member has won once, mark `cycle.ended_at`; block `drawRound` calls until owner explicitly calls `startCycle` again for a new cycle.
- [x] 5.6 Frontend: arisan pool page — current cycle status, "who's left to win," draw button (owner-only) with a satisfying reveal animation, cycle history.

## Phase 6 — Receipts & OCR Approval Flow

- [x] 6.1 File upload endpoint: accept image, validate type/size, store on the local Docker volume under a per-room/per-pool path, save `image_path` in a new `receipts` row (status='pending').
- [x] 6.2 OCR integration: server-side call (never from the browser directly) that extracts a transfer amount from the uploaded image; store raw response in `ocr_raw`, best-guess amount in `extracted_amount`. (Provider adapter is isolated server-side; local/dev fallback records raw metadata and can extract amounts from filename text until `OCR_SERVICE_URL` is configured.)
- [x] 6.3 Uploader confirmation step: show extracted amount, let the uploader confirm or correct it before final submit (`confirmed_amount`) — OCR won't be perfect, this is the safety net before it ever reaches the owner.
- [x] 6.4 tRPC: `receipt.approve(receiptId)` — owner-only; writes a `pool_ledger_entries` row (reason='contribution', amount_delta = confirmed_amount) and sets status='approved'.
- [x] 6.5 tRPC: `receipt.reject(receiptId, reason?)` — owner-only; sets status='rejected'; rejected receipts never touch the ledger.
- [x] 6.6 tRPC: `receipt.listForPool(poolId)` / `receipt.listPendingForRoom(roomId)` (owner inbox view across all their pools).
- [x] 6.7 Frontend: upload flow (pick pool → upload image → review extracted amount → submit).
- [x] 6.8 Frontend: owner's pending-approvals inbox (image preview, extracted vs confirmed amount, approve/reject buttons).
- [x] 6.9 Frontend: member-facing receipt history/status list on the pool page.

## Phase 7 — Dashboard & Polish

- [x] 7.1 Home dashboard: rooms the user's in, a rollup of "pools where you owe money" and "pending approvals waiting on you as owner."
- [x] 7.2 Empty states for every list view (no rooms yet, no pools yet, no receipts yet).
- [x] 7.3 Toast/error handling conventions wired consistently through tRPC error boundaries.
- [x] 7.4 Mobile-responsive pass on all pages (this will very likely be used from phones for photo uploads).
- [x] 7.5 Basic loading/skeleton states for async data via TanStack Query.
- [x] 7.6 Accessibility audit pass: run an automated contrast/a11y checker (e.g. axe-core or Lighthouse) against every page in both themes (modern + retro), fix WCAG 2.1 AA contrast failures, verify keyboard-only navigation through the core flows (login, approve/reject a receipt, run an arisan draw), and check focus indicators are visible on every interactive element. (axe-core via Playwright against every route + every dialog/tab state, both themes: fixed an unlabeled invite-link input, a missing `<main>` landmark app-wide, a missing page heading on `/login`, and an empty table header cell — zero WCAG 2.1 A/AA violations and zero axe best-practice violations remain. Login, receipt-approval, and arisan-draw flows verified keyboard-only end to end with visible focus rings confirmed in both themes.)

## Phase 8 — Deployment

- [x] 8.1 `Dockerfile` for the app (implemented as separate `web` nginx build and `server` runtime Dockerfiles, plus the OCR service image).
- [x] 8.2 `docker-compose.yml`: app service + volumes for SQLite data dir and receipt-image dir.
- [x] 8.3 Wire environment variables (Resend key, OCR service URL, session secret, public URL) via `.env` consumed by compose.
- [x] 8.4 Drizzle migration run step on container startup (or a separate one-shot migrate job before the app starts).
- [x] 8.5 Hook up the existing cloudflared tunnel config to point at the app's container port.
- [x] 8.6 Set up Litestream (or a cron `sqlite3 .backup` script) writing snapshots to a separate volume/remote target.
- [ ] 8.7 Smoke-test the full flow against the deployed instance: signup via magic link → create room → invite → join → create both pool types → upload+approve a receipt → run an arisan draw.

## Phase 9 — Tests & Hardening (ongoing, not strictly sequential)

- [ ] 9.1 Unit tests for the balance/calc module (Phase 4.6 — front-load this, it's the highest-risk logic).
- [ ] 9.2 Integration tests for auth (magic link request/verify/expiry/rate-limit).
- [ ] 9.3 Integration tests for invite join flow (valid code, revoked code, already-a-member).
- [ ] 9.4 Integration tests for receipt approve/reject → ledger effects.
- [ ] 9.5 Integration tests for arisan draw fairness (no repeat winner within a cycle, cycle completion detection).
- [ ] 9.6 Basic abuse-prevention review: magic-link rate limiting, upload size/type limits, owner-only mutation checks on every pool/room mutation.

---

## Notes for whoever (human or agent) picks this up

- Work top-to-bottom by phase; within a phase, tasks are mostly sequential but some (e.g. frontend page shells) can start once their backing tRPC procedure exists.
- Phase 4.5/4.6 (the balance calculation engine) is the riskiest, most bug-prone part of the whole app — get it right and unit-tested before building UI on top of it.
- Every mutation that changes money-related state must check the caller is the room/pool **owner** — there's no co-admin role yet, so authorization checks are simple (owner or not) but must not be skipped anywhere.
- Don't reach for a notification system, multi-currency, or OAuth — those were explicitly deferred; adding them now is scope creep against the agreed plan.
