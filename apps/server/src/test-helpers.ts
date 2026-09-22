import type { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createDb, type Db } from '@family-pool/db'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { createContextFactory } from './context.js'
import { appRouter } from './routers/app.js'
import { createCallerFactory } from './trpc.js'

const migrationsFolder = path.resolve(import.meta.dirname, '../../../packages/db/migrations')
const createCaller = createCallerFactory(appRouter)

// receipt.ts writes uploaded images under RECEIPT_UPLOAD_DIR at call time —
// point it away from the real data/receipts dir so tests never write there.
process.env.RECEIPT_UPLOAD_DIR ??= path.join(tmpdir(), 'family-pool-test-receipts')

export function createTestDb(): Db {
  // In-memory — no temp files to clean up, and it's faster.
  const db = createDb(':memory:')
  migrate(db, { migrationsFolder })
  return db
}

/** Bypasses cookie/session machinery — for tests where auth itself isn't the subject. */
export function callerAs(db: Db, userId: string | null) {
  return createCaller({ db, req: {} as IncomingMessage, res: {} as ServerResponse, currentUserId: userId })
}

export function fakeReq(overrides: { cookie?: string; ip?: string } = {}): IncomingMessage {
  return {
    headers: { cookie: overrides.cookie },
    socket: { remoteAddress: overrides.ip ?? '127.0.0.1' },
  } as unknown as IncomingMessage
}

export function fakeRes(): ServerResponse & { setCookieHeader: string | null } {
  let setCookieHeader: string | null = null
  return {
    setHeader: (name: string, value: string) => {
      if (name === 'Set-Cookie') setCookieHeader = value
    },
    get setCookieHeader() {
      return setCookieHeader
    },
  } as unknown as ServerResponse & { setCookieHeader: string | null }
}

/** Runs requests through the real createContextFactory — for exercising cookie/session/rate-limit middleware. */
export function httpCaller(db: Db, req: IncomingMessage, res: ServerResponse) {
  const createContext = createContextFactory(db)
  return createCaller(createContext({ req, res }))
}

export function extractSessionCookie(setCookieHeader: string): string {
  return setCookieHeader.split(';')[0]!
}

export async function captureConsoleLog<T>(fn: () => Promise<T>): Promise<{ result: T; lines: string[] }> {
  const lines: string[] = []
  const original = console.log
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(' '))
  }
  try {
    const result = await fn()
    return { result, lines }
  } finally {
    console.log = original
  }
}

export function extractMagicLinkToken(lines: string[], email: string): string {
  const line = lines.find((l) => l.includes(`magic link for ${email}`))
  if (!line) throw new Error(`no magic link logged for ${email}`)
  const url = new URL(line.slice(line.indexOf('http')))
  const token = url.searchParams.get('token')
  if (!token) throw new Error('no token in magic link url')
  return token
}
