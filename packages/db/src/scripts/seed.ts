import { createDb } from '../client.js'
import * as schema from '../schema.js'

const databasePath = process.env.DATABASE_PATH ?? '../../data/app.sqlite'
const db = createDb(databasePath)

// Dev-only reset, reverse FK order.
for (const table of [
  schema.rotatingPotRounds,
  schema.rotatingPotCycles,
  schema.poolLedgerEntries,
  schema.receipts,
  schema.poolMembershipOverrides,
  schema.poolMemberships,
  schema.poolPriceHistory,
  schema.pools,
  schema.roomInvites,
  schema.roomMemberships,
  schema.rooms,
  schema.sessions,
  schema.magicLinkTokens,
  schema.users,
]) {
  db.delete(table).run()
}

const [alice, bob, carol, dave, erin] = [
  { email: 'alice@example.com', displayName: 'Alice' },
  { email: 'bob@example.com', displayName: 'Bob' },
  { email: 'carol@example.com', displayName: 'Carol' },
  { email: 'dave@example.com', displayName: 'Dave' },
  { email: 'erin@example.com', displayName: 'Erin' },
].map((user) => db.insert(schema.users).values(user).returning().get())

const members = [alice, bob, carol, dave, erin]

const room = db
  .insert(schema.rooms)
  .values({ name: 'The Wahidin Family', createdByUserId: alice.id })
  .returning()
  .get()

for (const [user, role] of [
  [alice, 'owner'],
  [bob, 'member'],
  [carol, 'member'],
  [dave, 'member'],
  [erin, 'member'],
] as const) {
  db.insert(schema.roomMemberships).values({ roomId: room.id, userId: user.id, role }).run()
}

db.insert(schema.roomInvites)
  .values({ roomId: room.id, code: 'WAHIDIN-FAM', createdByUserId: alice.id })
  .run()

// Cost-split pool: Spotify, 5 members, 1,000,000 IDR / 5 per month.
const spotify = db
  .insert(schema.pools)
  .values({ roomId: room.id, type: 'cost_split', name: 'Spotify Family' })
  .returning()
  .get()

db.insert(schema.poolPriceHistory)
  .values({ poolId: spotify.id, effectiveFrom: '2026-01-01', perPersonAmount: 200_000 })
  .run()

for (const user of members) {
  db.insert(schema.poolMemberships).values({ poolId: spotify.id, userId: user.id }).run()
}

// Rotating-pot pool: Arisan, 5 members, 100,000/month.
const arisan = db
  .insert(schema.pools)
  .values({ roomId: room.id, type: 'rotating_pot', name: 'Arisan Bulanan' })
  .returning()
  .get()

db.insert(schema.poolPriceHistory)
  .values({ poolId: arisan.id, effectiveFrom: '2026-01-01', perPersonAmount: 100_000 })
  .run()

for (const user of members) {
  db.insert(schema.poolMemberships).values({ poolId: arisan.id, userId: user.id }).run()
}

console.log('Seeded:', {
  room: room.name,
  users: members.map((u) => u.email),
  pools: [spotify.name, arisan.name],
  inviteCode: 'WAHIDIN-FAM',
})
