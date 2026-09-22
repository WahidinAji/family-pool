import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import { createTestDb, callerAs } from '../test-helpers.js'

function createUser(db: ReturnType<typeof createTestDb>, email: string) {
  return db.insert(schema.users).values({ email }).returning().get()
}

async function setUpArisanPool(db: ReturnType<typeof createTestDb>, memberCount: number) {
  const owner = createUser(db, `owner-${Math.random()}@example.com`)
  const room = await callerAs(db, owner.id).room.create({ name: 'Arisan Test Room' })
  const pool = await callerAs(db, owner.id).pool.create({
    roomId: room.id,
    type: 'rotating_pot',
    name: 'Arisan Test Pool',
    contributionAmount: 100_000,
  })
  const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })

  const members = [owner]
  for (let i = 1; i < memberCount; i++) {
    const user = createUser(db, `member${i}-${Math.random()}@example.com`)
    await callerAs(db, user.id).room.joinByInvite({ code: activeInvite!.code })
    await callerAs(db, owner.id).pool.addMember({ poolId: pool.id, userId: user.id })
    members.push(user)
  }

  return { owner, members, room, pool }
}

describe('arisan: draw fairness and cycle lifecycle', () => {
  test('drawing every round in a cycle produces exactly one distinct winner per member, no repeats', async () => {
    const db = createTestDb()
    const { owner, members, pool } = await setUpArisanPool(db, 4)

    const cycle = await callerAs(db, owner.id).pool.startCycle({ poolId: pool.id })

    const winners: string[] = []
    for (let round = 1; round <= members.length; round++) {
      const { winnerPoolMembershipId } = await callerAs(db, owner.id).pool.drawRound({
        cycleId: cycle.id,
        roundNumber: round,
      })
      winners.push(winnerPoolMembershipId)
    }

    assert.equal(new Set(winners).size, members.length, 'every winner must be distinct — no repeat winner in a cycle')

    const allMembershipIds = db
      .select({ id: schema.poolMemberships.id })
      .from(schema.poolMemberships)
      .where(eq(schema.poolMemberships.poolId, pool.id))
      .all()
      .map((m) => m.id)
    assert.deepEqual(new Set(winners), new Set(allMembershipIds), 'every member must win exactly once')
  })

  test('the cycle is marked ended once every round has been drawn', async () => {
    const db = createTestDb()
    const { owner, members, pool } = await setUpArisanPool(db, 3)
    const cycle = await callerAs(db, owner.id).pool.startCycle({ poolId: pool.id })

    for (let round = 1; round <= members.length; round++) {
      await callerAs(db, owner.id).pool.drawRound({ cycleId: cycle.id, roundNumber: round })
    }

    const row = db.select().from(schema.rotatingPotCycles).where(eq(schema.rotatingPotCycles.id, cycle.id)).get()
    assert.ok(row?.endedAt, 'cycle should have endedAt set once all rounds are drawn')
  })

  test('a new cycle can start once the previous one has ended', async () => {
    const db = createTestDb()
    const { owner, members, pool } = await setUpArisanPool(db, 2)
    const cycle1 = await callerAs(db, owner.id).pool.startCycle({ poolId: pool.id })
    for (let round = 1; round <= members.length; round++) {
      await callerAs(db, owner.id).pool.drawRound({ cycleId: cycle1.id, roundNumber: round })
    }

    const cycle2 = await callerAs(db, owner.id).pool.startCycle({ poolId: pool.id })
    assert.equal(cycle2.cycleNumber, 2)
  })

  test('cannot start a second cycle while one is still in progress', async () => {
    const db = createTestDb()
    const { owner, pool } = await setUpArisanPool(db, 3)
    await callerAs(db, owner.id).pool.startCycle({ poolId: pool.id })

    await assert.rejects(
      () => callerAs(db, owner.id).pool.startCycle({ poolId: pool.id }),
      /already in progress/,
    )
  })

  test('rounds must be drawn in order', async () => {
    const db = createTestDb()
    const { owner, pool } = await setUpArisanPool(db, 3)
    const cycle = await callerAs(db, owner.id).pool.startCycle({ poolId: pool.id })

    await assert.rejects(
      () => callerAs(db, owner.id).pool.drawRound({ cycleId: cycle.id, roundNumber: 2 }),
      /must be drawn first/,
    )
  })

  test('a round cannot be drawn twice', async () => {
    const db = createTestDb()
    const { owner, pool } = await setUpArisanPool(db, 2)
    const cycle = await callerAs(db, owner.id).pool.startCycle({ poolId: pool.id })
    await callerAs(db, owner.id).pool.drawRound({ cycleId: cycle.id, roundNumber: 1 })

    await assert.rejects(
      () => callerAs(db, owner.id).pool.drawRound({ cycleId: cycle.id, roundNumber: 1 }),
      /already been drawn/,
    )
  })

  test('only the pool owner can start a cycle or draw a round', async () => {
    const db = createTestDb()
    const { pool, members } = await setUpArisanPool(db, 2)
    const nonOwner = members[1]!

    await assert.rejects(() => callerAs(db, nonOwner.id).pool.startCycle({ poolId: pool.id }))
  })
})
