import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { schema, type Db } from '@family-pool/db'
import { requireRoomMembership, requireRoomOwner } from '../rooms/authorization.js'

export function getPoolOrThrow(db: Db, poolId: string) {
  const pool = db.select().from(schema.pools).where(eq(schema.pools.id, poolId)).get()
  if (!pool) throw new TRPCError({ code: 'NOT_FOUND' })
  return pool
}

export function requirePoolMembership(db: Db, poolId: string, userId: string) {
  const pool = getPoolOrThrow(db, poolId)
  const roomMembership = requireRoomMembership(db, pool.roomId, userId)
  return { pool, roomMembership }
}

export function requirePoolOwner(db: Db, poolId: string, userId: string) {
  const { pool, roomMembership } = requirePoolMembership(db, poolId, userId)
  requireRoomOwner(roomMembership)
  return { pool, roomMembership }
}
