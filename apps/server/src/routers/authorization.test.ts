import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { schema } from '@family-pool/db'
import { createTestDb, callerAs } from '../test-helpers.js'

function createUser(db: ReturnType<typeof createTestDb>, email: string) {
  return db.insert(schema.users).values({ email }).returning().get()
}

async function setUpRoomWithMember(db: ReturnType<typeof createTestDb>) {
  const owner = createUser(db, `owner-${Math.random()}@example.com`)
  const member = createUser(db, `member-${Math.random()}@example.com`)
  const room = await callerAs(db, owner.id).room.create({ name: 'Auth Test Room' })
  const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })
  await callerAs(db, member.id).room.joinByInvite({ code: activeInvite!.code })
  return { owner, member, room }
}

describe('abuse prevention: owner-only mutation checks', () => {
  test('only the room owner can create a pool', async () => {
    const db = createTestDb()
    const { member, room } = await setUpRoomWithMember(db)

    await assert.rejects(() =>
      callerAs(db, member.id).pool.create({
        roomId: room.id,
        type: 'cost_split',
        name: 'Should Fail',
        pricePerPerson: 100_000,
      }),
    )
  })

  test('only the pool owner can add or remove pool members', async () => {
    const db = createTestDb()
    const { owner, member, room } = await setUpRoomWithMember(db)
    const pool = await callerAs(db, owner.id).pool.create({
      roomId: room.id,
      type: 'cost_split',
      name: 'Owner Only Pool',
      pricePerPerson: 100_000,
    })

    await assert.rejects(() => callerAs(db, member.id).pool.addMember({ poolId: pool.id, userId: member.id }))

    await callerAs(db, owner.id).pool.addMember({ poolId: pool.id, userId: member.id })
    await assert.rejects(() => callerAs(db, member.id).pool.removeMember({ poolId: pool.id, userId: member.id }))
  })

  test('only the pool owner can change the price or set an override', async () => {
    const db = createTestDb()
    const { owner, member, room } = await setUpRoomWithMember(db)
    const pool = await callerAs(db, owner.id).pool.create({
      roomId: room.id,
      type: 'cost_split',
      name: 'Price Test Pool',
      pricePerPerson: 100_000,
    })
    await callerAs(db, owner.id).pool.addMember({ poolId: pool.id, userId: member.id })
    const status = await callerAs(db, owner.id).pool.getStatus({ poolId: pool.id })
    const memberMembershipId = status.members.find((m) => m.userId === member.id)!.membershipId

    await assert.rejects(() =>
      callerAs(db, member.id).pool.updatePrice({ poolId: pool.id, pricePerPerson: 999_999 }),
    )
    await assert.rejects(() =>
      callerAs(db, member.id).pool.setMemberOverride({ poolMembershipId: memberMembershipId, amount: 1 }),
    )
  })

  test('only the room owner can remove a room member, and cannot remove themself', async () => {
    const db = createTestDb()
    const { owner, member, room } = await setUpRoomWithMember(db)

    await assert.rejects(() => callerAs(db, member.id).room.removeMember({ roomId: room.id, userId: member.id }))
    await assert.rejects(() => callerAs(db, owner.id).room.removeMember({ roomId: room.id, userId: owner.id }))

    // The owner removing someone else is fine.
    await callerAs(db, owner.id).room.removeMember({ roomId: room.id, userId: member.id })
  })

  test('receipt upload rejects a MIME type outside the JPG/PNG/WebP allowlist, even bypassing the client type', async () => {
    const db = createTestDb()
    const { owner, member, room } = await setUpRoomWithMember(db)
    const pool = await callerAs(db, owner.id).pool.create({
      roomId: room.id,
      type: 'cost_split',
      name: 'Mime Test Pool',
      pricePerPerson: 100_000,
    })
    await callerAs(db, owner.id).pool.addMember({ poolId: pool.id, userId: member.id })

    await assert.rejects(() =>
      callerAs(db, member.id).receipt.uploadAndExtract({
        poolId: pool.id,
        fileName: 'evil.svg',
        // A real attacker wouldn't respect the TS union type — only the
        // server's runtime zod validation stands between this and disk.
        mimeType: 'image/svg+xml' as never,
        dataBase64: 'PHN2Zz48L3N2Zz4=',
      }),
    )
  })
})
