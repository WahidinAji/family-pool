import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { schema } from '@family-pool/db'
import { createTestDb, callerAs } from '../test-helpers.js'

function createUser(db: ReturnType<typeof createTestDb>, email: string) {
  return db.insert(schema.users).values({ email }).returning().get()
}

// 1x1 PNG — content doesn't matter, OCR falls back to parsing the filename
// text when VISION_API_KEY/OCR_SERVICE_URL aren't configured (they aren't in tests).
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function setUpPoolWithMember(db: ReturnType<typeof createTestDb>) {
  const owner = createUser(db, `owner-${Math.random()}@example.com`)
  const member = createUser(db, `member-${Math.random()}@example.com`)
  const room = await callerAs(db, owner.id).room.create({ name: 'Receipt Test Room' })
  const pool = await callerAs(db, owner.id).pool.create({
    roomId: room.id,
    type: 'cost_split',
    name: 'Receipt Test Pool',
    pricePerPerson: 200_000,
  })
  const { activeInvite } = await callerAs(db, owner.id).room.get({ roomId: room.id })
  await callerAs(db, member.id).room.joinByInvite({ code: activeInvite!.code })
  await callerAs(db, owner.id).pool.addMember({ poolId: pool.id, userId: member.id })
  return { owner, member, room, pool }
}

describe('receipt: approve/reject → ledger effects', () => {
  test('approve creates a ledger entry and marks the receipt approved', async () => {
    const db = createTestDb()
    const { owner, member, pool } = await setUpPoolWithMember(db)

    const uploaded = await callerAs(db, member.id).receipt.uploadAndExtract({
      poolId: pool.id,
      fileName: 'transfer-Rp150.000.png',
      mimeType: 'image/png',
      dataBase64: TINY_PNG_BASE64,
    })
    assert.equal(uploaded.extractedAmount, 150_000, 'filename-fallback OCR should extract the amount')

    const confirmed = await callerAs(db, member.id).receipt.confirmAmount({
      receiptId: uploaded.id,
      confirmedAmount: 150_000,
    })
    assert.equal(confirmed.status, 'pending')

    const approved = await callerAs(db, owner.id).receipt.approve({ receiptId: uploaded.id })
    assert.equal(approved.status, 'approved')

    const ledgerRows = db.select().from(schema.poolLedgerEntries).all().filter((r) => r.receiptId === uploaded.id)
    assert.equal(ledgerRows.length, 1)
    assert.equal(ledgerRows[0]!.amountDelta, 150_000)
    assert.equal(ledgerRows[0]!.reason, 'contribution')
  })

  test('reject leaves the ledger untouched', async () => {
    const db = createTestDb()
    const { owner, member, pool } = await setUpPoolWithMember(db)

    const uploaded = await callerAs(db, member.id).receipt.uploadAndExtract({
      poolId: pool.id,
      fileName: 'transfer-Rp200.000.png',
      mimeType: 'image/png',
      dataBase64: TINY_PNG_BASE64,
    })
    await callerAs(db, member.id).receipt.confirmAmount({ receiptId: uploaded.id, confirmedAmount: 200_000 })

    const rejected = await callerAs(db, owner.id).receipt.reject({ receiptId: uploaded.id })
    assert.equal(rejected.status, 'rejected')

    const ledgerRows = db.select().from(schema.poolLedgerEntries).all().filter((r) => r.receiptId === uploaded.id)
    assert.equal(ledgerRows.length, 0)
  })

  test('approving the same receipt twice is rejected (idempotency)', async () => {
    const db = createTestDb()
    const { owner, member, pool } = await setUpPoolWithMember(db)

    const uploaded = await callerAs(db, member.id).receipt.uploadAndExtract({
      poolId: pool.id,
      fileName: 'transfer-Rp150.000.png',
      mimeType: 'image/png',
      dataBase64: TINY_PNG_BASE64,
    })
    await callerAs(db, member.id).receipt.confirmAmount({ receiptId: uploaded.id, confirmedAmount: 150_000 })
    await callerAs(db, owner.id).receipt.approve({ receiptId: uploaded.id })

    await assert.rejects(
      () => callerAs(db, owner.id).receipt.approve({ receiptId: uploaded.id }),
      /already been reviewed/,
    )

    const ledgerRows = db.select().from(schema.poolLedgerEntries).all().filter((r) => r.receiptId === uploaded.id)
    assert.equal(ledgerRows.length, 1, 'a second approve attempt must not create a second ledger entry')
  })

  test('only the pool owner can approve or reject', async () => {
    const db = createTestDb()
    const { member, pool } = await setUpPoolWithMember(db)
    const outsider = createUser(db, 'outsider@example.com')

    const uploaded = await callerAs(db, member.id).receipt.uploadAndExtract({
      poolId: pool.id,
      fileName: 'transfer-Rp150.000.png',
      mimeType: 'image/png',
      dataBase64: TINY_PNG_BASE64,
    })
    await callerAs(db, member.id).receipt.confirmAmount({ receiptId: uploaded.id, confirmedAmount: 150_000 })

    // The uploader themselves isn't the pool owner here, so they can't approve their own receipt.
    await assert.rejects(() => callerAs(db, member.id).receipt.approve({ receiptId: uploaded.id }))
    await assert.rejects(() => callerAs(db, outsider.id).receipt.approve({ receiptId: uploaded.id }))
  })

  test('only the uploader can confirm the amount', async () => {
    const db = createTestDb()
    const { owner, member, pool } = await setUpPoolWithMember(db)

    const uploaded = await callerAs(db, member.id).receipt.uploadAndExtract({
      poolId: pool.id,
      fileName: 'transfer-Rp150.000.png',
      mimeType: 'image/png',
      dataBase64: TINY_PNG_BASE64,
    })

    await assert.rejects(
      () => callerAs(db, owner.id).receipt.confirmAmount({ receiptId: uploaded.id, confirmedAmount: 150_000 }),
      /Only the uploader/,
    )
  })

  test('approval requires a confirmed amount first', async () => {
    const db = createTestDb()
    const { owner, member, pool } = await setUpPoolWithMember(db)

    const uploaded = await callerAs(db, member.id).receipt.uploadAndExtract({
      poolId: pool.id,
      fileName: 'no-amount-here.png',
      mimeType: 'image/png',
      dataBase64: TINY_PNG_BASE64,
    })

    await assert.rejects(
      () => callerAs(db, owner.id).receipt.approve({ receiptId: uploaded.id }),
      /must be confirmed before approval/,
    )
  })

  test('upload is rejected for non-pool-members', async () => {
    const db = createTestDb()
    const { pool } = await setUpPoolWithMember(db)
    const outsider = createUser(db, 'outsider2@example.com')

    await assert.rejects(() =>
      callerAs(db, outsider.id).receipt.uploadAndExtract({
        poolId: pool.id,
        fileName: 'transfer-Rp150.000.png',
        mimeType: 'image/png',
        dataBase64: TINY_PNG_BASE64,
      }),
    )
  })

  test('upload is rejected above the 5MB size limit', async () => {
    const db = createTestDb()
    const { member, pool } = await setUpPoolWithMember(db)
    const oversized = Buffer.alloc(6 * 1024 * 1024, 1).toString('base64')

    await assert.rejects(
      () =>
        callerAs(db, member.id).receipt.uploadAndExtract({
          poolId: pool.id,
          fileName: 'huge.png',
          mimeType: 'image/png',
          dataBase64: oversized,
        }),
      /5MB or smaller/,
    )
  })
})
