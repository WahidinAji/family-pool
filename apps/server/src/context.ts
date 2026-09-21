import type { Db } from '@family-pool/db'

export interface Context {
  db: Db
  // populated once Phase 2 (auth) lands; null means unauthenticated
  currentUserId: string | null
}

export function createContextFactory(db: Db) {
  return function createContext(): Context {
    return { db, currentUserId: null }
  }
}
