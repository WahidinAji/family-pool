import type { IncomingMessage, ServerResponse } from 'node:http'
import { eq } from 'drizzle-orm'
import { schema, type Db } from '@family-pool/db'
import { parseCookies, SESSION_COOKIE_NAME } from './auth/cookies.js'

export interface Context {
  db: Db
  req: IncomingMessage
  res: ServerResponse
  currentUserId: string | null
}

export function createContextFactory(db: Db) {
  return function createContext({
    req,
    res,
  }: {
    req: IncomingMessage
    res: ServerResponse
  }): Context {
    const cookies = parseCookies(req.headers.cookie)
    const sessionId = cookies[SESSION_COOKIE_NAME]

    let currentUserId: string | null = null
    if (sessionId) {
      const session = db.select().from(schema.sessions).where(eq(schema.sessions.id, sessionId)).get()
      if (session && session.expiresAt.getTime() > Date.now()) {
        currentUserId = session.userId
      }
    }

    return { db, req, res, currentUserId }
  }
}
