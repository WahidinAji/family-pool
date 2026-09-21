import { TRPCError } from '@trpc/server'
import { and, eq, isNull } from 'drizzle-orm'
import { schema, type Db } from '@family-pool/db'

export function requireRoomMembership(db: Db, roomId: string, userId: string) {
  const membership = db
    .select()
    .from(schema.roomMemberships)
    .where(
      and(
        eq(schema.roomMemberships.roomId, roomId),
        eq(schema.roomMemberships.userId, userId),
        isNull(schema.roomMemberships.leftAt),
      ),
    )
    .get()

  if (!membership) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'You are not a member of this room.' })
  }

  return membership
}

export function requireRoomOwner(membership: { role: 'owner' | 'member' }) {
  if (membership.role !== 'owner') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only the room owner can do this.' })
  }
}
