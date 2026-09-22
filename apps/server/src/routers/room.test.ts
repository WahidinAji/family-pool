import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { schema } from '@family-pool/db'
import { createTestDb, callerAs } from '../test-helpers.js'

function createUser(db: ReturnType<typeof createTestDb>, email: string) {
  return db.insert(schema.users).values({ email }).returning().get()
}

describe('room: invite join flow', () => {
  test('a valid code lets a new user join as a member', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner@example.com')
    const joiner = createUser(db, 'joiner@example.com')

    const room = await callerAs(db, owner.id).room.create({ name: 'The Wahidins' })
    const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })
    assert.ok(activeInvite, 'room.create should seed an active invite')

    const joined = await callerAs(db, joiner.id).room.joinByInvite({ code: activeInvite!.code })
    assert.equal(joined.roomId, room.id)

    const detail = await callerAs(db, joiner.id).room.get({ roomId: room.id })
    const membership = detail.members.find((m) => m.userId === joiner.id)
    assert.equal(membership?.role, 'member')
  })

  test('a revoked code is rejected', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner2@example.com')
    const joiner = createUser(db, 'joiner2@example.com')

    const room = await callerAs(db, owner.id).room.create({ name: 'Revoked Test' })
    const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })
    await callerAs(db, owner.id).room.revokeInvite({ roomId: room.id })

    await assert.rejects(
      () => callerAs(db, joiner.id).room.joinByInvite({ code: activeInvite!.code }),
      /invalid or has been revoked/,
    )
  })

  test('an unknown code is rejected', async () => {
    const db = createTestDb()
    const joiner = createUser(db, 'joiner3@example.com')
    await assert.rejects(() => callerAs(db, joiner.id).room.joinByInvite({ code: 'NOT-A-REAL-CODE' }))
  })

  test('joining twice with the same code is idempotent, not a duplicate membership', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner4@example.com')
    const joiner = createUser(db, 'joiner4@example.com')

    const room = await callerAs(db, owner.id).room.create({ name: 'Idempotent Test' })
    const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })

    await callerAs(db, joiner.id).room.joinByInvite({ code: activeInvite!.code })
    await callerAs(db, joiner.id).room.joinByInvite({ code: activeInvite!.code })

    const rows = db
      .select()
      .from(schema.roomMemberships)
      .all()
      .filter((m) => m.roomId === room.id && m.userId === joiner.id)
    assert.equal(rows.length, 1, 'joining twice should not create a second membership row')
  })

  test('regenerating an invite revokes the old code', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner5@example.com')
    const joiner = createUser(db, 'joiner5@example.com')

    const room = await callerAs(db, owner.id).room.create({ name: 'Regenerate Test' })
    const { activeInvite: original } = await callerAs(db, owner.id).room.get({ roomId: room.id })
    await callerAs(db, owner.id).room.createInvite({ roomId: room.id })

    await assert.rejects(() => callerAs(db, joiner.id).room.joinByInvite({ code: original!.code }))
  })

  test('only the owner can create or revoke invites', async () => {
    const db = createTestDb()
    const owner = createUser(db, 'owner6@example.com')
    const member = createUser(db, 'member6@example.com')

    const room = await callerAs(db, owner.id).room.create({ name: 'Owner Only Test' })
    const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })
    await callerAs(db, member.id).room.joinByInvite({ code: activeInvite!.code })

    await assert.rejects(() => callerAs(db, member.id).room.createInvite({ roomId: room.id }))
    await assert.rejects(() => callerAs(db, member.id).room.revokeInvite({ roomId: room.id }))
  })
})
