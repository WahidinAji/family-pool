import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { eq } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import {
  createTestDb,
  httpCaller,
  fakeReq,
  fakeRes,
  extractSessionCookie,
  captureConsoleLog,
  extractMagicLinkToken,
} from '../test-helpers.js'

describe('auth: magic link request/verify', () => {
  test('happy path: request, verify, and use the session', async () => {
    const db = createTestDb()
    const email = 'alice@example.com'

    const { lines } = await captureConsoleLog(async () => {
      const res = fakeRes()
      await httpCaller(db, fakeReq({ ip: '10.0.0.1' }), res).auth.requestMagicLink({ email })
    })
    const token = extractMagicLinkToken(lines, email)

    const verifyRes = fakeRes()
    const verified = await httpCaller(db, fakeReq({ ip: '10.0.0.1' }), verifyRes).auth.verifyMagicLink({ token })
    assert.equal(verified.user.email, email)
    assert.ok(verifyRes.setCookieHeader, 'expected a Set-Cookie header on successful verify')

    const cookie = extractSessionCookie(verifyRes.setCookieHeader!)
    const me = await httpCaller(db, fakeReq({ cookie }), fakeRes()).auth.me()
    assert.equal(me?.email, email)
  })

  test('verifying with no session cookie returns null from auth.me', async () => {
    const db = createTestDb()
    const me = await httpCaller(db, fakeReq(), fakeRes()).auth.me()
    assert.equal(me, null)
  })

  test('an expired token is rejected', async () => {
    const db = createTestDb()
    const email = 'expired@example.com'

    const { lines } = await captureConsoleLog(async () => {
      await httpCaller(db, fakeReq({ ip: '10.0.0.2' }), fakeRes()).auth.requestMagicLink({ email })
    })
    const token = extractMagicLinkToken(lines, email)

    // Force the token into the past instead of waiting out the real 15-minute TTL.
    db.update(schema.magicLinkTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.magicLinkTokens.email, email))
      .run()

    await assert.rejects(
      () => httpCaller(db, fakeReq({ ip: '10.0.0.2' }), fakeRes()).auth.verifyMagicLink({ token }),
      /invalid or has expired/,
    )
  })

  test('a token can only be consumed once', async () => {
    const db = createTestDb()
    const email = 'onceonly@example.com'

    const { lines } = await captureConsoleLog(async () => {
      await httpCaller(db, fakeReq({ ip: '10.0.0.3' }), fakeRes()).auth.requestMagicLink({ email })
    })
    const token = extractMagicLinkToken(lines, email)

    await httpCaller(db, fakeReq({ ip: '10.0.0.3' }), fakeRes()).auth.verifyMagicLink({ token })
    await assert.rejects(() => httpCaller(db, fakeReq({ ip: '10.0.0.3' }), fakeRes()).auth.verifyMagicLink({ token }))
  })

  test('an unknown token is rejected', async () => {
    const db = createTestDb()
    await assert.rejects(() =>
      httpCaller(db, fakeReq({ ip: '10.0.0.4' }), fakeRes()).auth.verifyMagicLink({ token: 'not-a-real-token' }),
    )
  })

  test('rate limit: blocks a 4th request within the window for the same email+IP', async () => {
    const db = createTestDb()
    const email = 'ratelimited@example.com'
    const ip = '10.0.0.99'

    for (let i = 0; i < 3; i++) {
      await captureConsoleLog(() => httpCaller(db, fakeReq({ ip }), fakeRes()).auth.requestMagicLink({ email }))
    }

    await assert.rejects(
      () => httpCaller(db, fakeReq({ ip }), fakeRes()).auth.requestMagicLink({ email }),
      /Too many login attempts/,
    )
  })

  test('rate limit is per email/IP, not global — a different email+IP is unaffected', async () => {
    const db = createTestDb()
    // Exhaust the limit for one email+IP pair.
    for (let i = 0; i < 3; i++) {
      await captureConsoleLog(() =>
        httpCaller(db, fakeReq({ ip: '10.0.0.50' }), fakeRes()).auth.requestMagicLink({ email: 'busy@example.com' }),
      )
    }
    // A different email+IP should still succeed.
    const { result } = await captureConsoleLog(() =>
      httpCaller(db, fakeReq({ ip: '10.0.0.51' }), fakeRes()).auth.requestMagicLink({ email: 'fresh@example.com' }),
    )
    assert.deepEqual(result, { ok: true })
  })
})
