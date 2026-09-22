import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import { createTestDb, callerAs } from '../test-helpers.js'

function createUser(db: ReturnType<typeof createTestDb>, email: string) {
  return db.insert(schema.users).values({ email }).returning().get()
}

describe('pool: archive (delete)', () => {
  test('the owner can delete a pool, and it disappears from listForRoom', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner@example.com')
    const room = await callerAs(db, owner.id).room.create({ name: 'Archive Test Room' })
    const pool = await callerAs(db, owner.id).pool.create({
      roomId: room.id,
      type: 'cost_split',
      name: 'To Delete',
      pricePerPerson: 100_000,
    })

    let pools = await callerAs(db, owner.id).pool.listForRoom({ roomId: room.id })
    assert.equal(pools.length, 1)

    await callerAs(db, owner.id).pool.archive({ poolId: pool.id })

    pools = await callerAs(db, owner.id).pool.listForRoom({ roomId: room.id })
    assert.equal(pools.length, 0)
  })

  test('deleting is a soft delete — the row and its history survive', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner2@example.com')
    const room = await callerAs(db, owner.id).room.create({ name: 'Soft Delete Room' })
    const pool = await callerAs(db, owner.id).pool.create({
      roomId: room.id,
      type: 'cost_split',
      name: 'To Soft Delete',
      pricePerPerson: 100_000,
    })

    await callerAs(db, owner.id).pool.archive({ poolId: pool.id })

    const row = db.select().from(schema.pools).where(eq(schema.pools.id, pool.id)).get()
    assert.ok(row, 'the pool row must still exist in the database')
    assert.ok(row!.archivedAt, 'archivedAt must be set')
  })

  test('only the owner can delete a pool', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner3@example.com')
    const member = createUser(db, 'member3@example.com')
    const room = await callerAs(db, owner.id).room.create({ name: 'Owner Only Delete Room' })
    const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })
    await callerAs(db, member.id).room.joinByInvite({ code: activeInvite!.code })
    const pool = await callerAs(db, owner.id).pool.create({
      roomId: room.id,
      type: 'cost_split',
      name: 'Protected Pool',
      pricePerPerson: 100_000,
    })

    await assert.rejects(() => callerAs(db, member.id).pool.archive({ poolId: pool.id }))
  })

  test('deleting an already-deleted pool is rejected', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner4@example.com')
    const room = await callerAs(db, owner.id).room.create({ name: 'Double Delete Room' })
    const pool = await callerAs(db, owner.id).pool.create({
      roomId: room.id,
      type: 'cost_split',
      name: 'Twice Deleted',
      pricePerPerson: 100_000,
    })

    await callerAs(db, owner.id).pool.archive({ poolId: pool.id })
    await assert.rejects(
      () => callerAs(db, owner.id).pool.archive({ poolId: pool.id }),
      /already been deleted/,
    )
  })
})
