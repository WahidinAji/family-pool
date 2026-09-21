import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

function id() {
  return text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID())
}

function createdAt() {
  return integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`)
}

// --- Auth -------------------------------------------------------------

export const users = sqliteTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: createdAt(),
})

export const magicLinkTokens = sqliteTable('magic_link_tokens', {
  id: id(),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  consumedAt: integer('consumed_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
})

export const sessions = sqliteTable('sessions', {
  id: id(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: createdAt(),
})

// --- Rooms --------------------------------------------------------------

export const rooms = sqliteTable('rooms', {
  id: id(),
  name: text('name').notNull(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id),
  createdAt: createdAt(),
})

export const roomMemberships = sqliteTable(
  'room_memberships',
  {
    id: id(),
    roomId: text('room_id')
      .notNull()
      .references(() => rooms.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role', { enum: ['owner', 'member'] }).notNull(),
    joinedAt: integer('joined_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    leftAt: integer('left_at', { mode: 'timestamp' }),
  },
  (table) => [uniqueIndex('room_memberships_room_user_idx').on(table.roomId, table.userId)],
)

export const roomInvites = sqliteTable('room_invites', {
  id: id(),
  roomId: text('room_id')
    .notNull()
    .references(() => rooms.id),
  code: text('code').notNull().unique(),
  createdByUserId: text('created_by_user_id')
    .notNull()
    .references(() => users.id),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: createdAt(),
})

// --- Pools ----------------------------------------------------------------

export const pools = sqliteTable('pools', {
  id: id(),
  roomId: text('room_id')
    .notNull()
    .references(() => rooms.id),
  type: text('type', { enum: ['cost_split', 'rotating_pot'] }).notNull(),
  name: text('name').notNull(),
  currencyCode: text('currency_code').notNull().default('IDR'),
  period: text('period', { enum: ['monthly'] })
    .notNull()
    .default('monthly'),
  createdAt: createdAt(),
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
})

// The pool's default equal-split price over time. Never mutated — a price
// change appends a new row (see PLAN.md 4.4).
export const poolPriceHistory = sqliteTable('pool_price_history', {
  id: id(),
  poolId: text('pool_id')
    .notNull()
    .references(() => pools.id),
  effectiveFrom: text('effective_from').notNull(),
  perPersonAmount: integer('per_person_amount').notNull(),
  createdAt: createdAt(),
})

export const poolMemberships = sqliteTable(
  'pool_memberships',
  {
    id: id(),
    poolId: text('pool_id')
      .notNull()
      .references(() => pools.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    joinedAt: integer('joined_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    leftAt: integer('left_at', { mode: 'timestamp' }),
  },
  (table) => [uniqueIndex('pool_memberships_pool_user_idx').on(table.poolId, table.userId)],
)

// Optional custom price overriding the pool default for one member from a
// given date. Absence means "use the pool's default price history."
export const poolMembershipOverrides = sqliteTable('pool_membership_overrides', {
  id: id(),
  poolMembershipId: text('pool_membership_id')
    .notNull()
    .references(() => poolMemberships.id),
  effectiveFrom: text('effective_from').notNull(),
  amount: integer('amount').notNull(),
  createdAt: createdAt(),
})

// --- Receipts ---------------------------------------------------------

export const receipts = sqliteTable('receipts', {
  id: id(),
  poolId: text('pool_id')
    .notNull()
    .references(() => pools.id),
  uploadedByUserId: text('uploaded_by_user_id')
    .notNull()
    .references(() => users.id),
  imagePath: text('image_path').notNull(),
  extractedAmount: integer('extracted_amount'),
  confirmedAmount: integer('confirmed_amount'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] })
    .notNull()
    .default('pending'),
  reviewedByUserId: text('reviewed_by_user_id').references(() => users.id),
  reviewedAt: integer('reviewed_at', { mode: 'timestamp' }),
  ocrRaw: text('ocr_raw'),
  createdAt: createdAt(),
})

// Append-only. A pool_membership's balance is SUM(amount_delta) over its
// entries — this table is the source of truth (see PLAN.md "Balance model").
export const poolLedgerEntries = sqliteTable('pool_ledger_entries', {
  id: id(),
  poolMembershipId: text('pool_membership_id')
    .notNull()
    .references(() => poolMemberships.id),
  receiptId: text('receipt_id').references(() => receipts.id),
  amountDelta: integer('amount_delta').notNull(),
  reason: text('reason', { enum: ['contribution', 'adjustment', 'pot_payout'] }).notNull(),
  createdAt: createdAt(),
})

// --- Rotating-pot (arisan) --------------------------------------------

export const rotatingPotCycles = sqliteTable('rotating_pot_cycles', {
  id: id(),
  poolId: text('pool_id')
    .notNull()
    .references(() => pools.id),
  cycleNumber: integer('cycle_number').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  endedAt: integer('ended_at', { mode: 'timestamp' }),
})

export const rotatingPotRounds = sqliteTable('rotating_pot_rounds', {
  id: id(),
  cycleId: text('cycle_id')
    .notNull()
    .references(() => rotatingPotCycles.id),
  roundNumber: integer('round_number').notNull(),
  periodLabel: text('period_label').notNull(),
  winnerPoolMembershipId: text('winner_pool_membership_id').references(() => poolMemberships.id),
  drawnAt: integer('drawn_at', { mode: 'timestamp' }),
  // 'paid' added in Phase 5 for recordPayout idempotency — a plain text
  // column with app-level enum typing (no SQL CHECK constraint), so widening
  // it needs no migration; see PLAN.md Phase 5 notes.
  status: text('status', { enum: ['pending', 'drawn', 'paid'] })
    .notNull()
    .default('pending'),
})
