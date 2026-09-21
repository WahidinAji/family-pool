import { TRPCError } from '@trpc/server'
import { and, eq, isNull } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import { z } from 'zod'
import { generateInviteCode } from '../rooms/inviteCode.js'
import { requireRoomMembership, requireRoomOwner } from '../rooms/authorization.js'
import { protectedProcedure, router } from '../trpc.js'

export const roomRouter = router({
  create: protectedProcedure
    .input(z.object({ name: z.string().trim().min(1).max(100) }))
    .mutation(({ ctx, input }) => {
      const room = ctx.db
        .insert(schema.rooms)
        .values({ name: input.name, createdByUserId: ctx.currentUserId })
        .returning()
        .get()

      ctx.db
        .insert(schema.roomMemberships)
        .values({ roomId: room.id, userId: ctx.currentUserId, role: 'owner' })
        .run()

      // Every room gets a reusable invite link immediately — the owner shouldn't
      // have to take a separate "create an invite" action before they can share it.
      ctx.db
        .insert(schema.roomInvites)
        .values({ roomId: room.id, code: generateInviteCode(), createdByUserId: ctx.currentUserId })
        .run()

      return room
    }),

  listMine: protectedProcedure.query(({ ctx }) => {
    const rows = ctx.db
      .select({ room: schema.rooms, role: schema.roomMemberships.role })
      .from(schema.roomMemberships)
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomMemberships.roomId))
      .where(and(eq(schema.roomMemberships.userId, ctx.currentUserId), isNull(schema.roomMemberships.leftAt)))
      .all()

    return rows.map(({ room, role }) => ({ ...room, role }))
  }),

  get: protectedProcedure.input(z.object({ roomId: z.string() })).query(({ ctx, input }) => {
    const room = ctx.db.select().from(schema.rooms).where(eq(schema.rooms.id, input.roomId)).get()
    if (!room) throw new TRPCError({ code: 'NOT_FOUND' })

    const membership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)

    const members = ctx.db
      .select({
        membershipId: schema.roomMemberships.id,
        userId: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        role: schema.roomMemberships.role,
        joinedAt: schema.roomMemberships.joinedAt,
      })
      .from(schema.roomMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.roomMemberships.userId))
      .where(and(eq(schema.roomMemberships.roomId, input.roomId), isNull(schema.roomMemberships.leftAt)))
      .all()

    const activeInvite =
      membership.role === 'owner'
        ? (ctx.db
            .select()
            .from(schema.roomInvites)
            .where(and(eq(schema.roomInvites.roomId, input.roomId), isNull(schema.roomInvites.revokedAt)))
            .get() ?? null)
        : null

    return { room, members, myRole: membership.role, activeInvite }
  }),

  createInvite: protectedProcedure.input(z.object({ roomId: z.string() })).mutation(({ ctx, input }) => {
    const membership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
    requireRoomOwner(membership)

    // Only one active invite per room — regenerating revokes the old one.
    ctx.db
      .update(schema.roomInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.roomInvites.roomId, input.roomId), isNull(schema.roomInvites.revokedAt)))
      .run()

    return ctx.db
      .insert(schema.roomInvites)
      .values({ roomId: input.roomId, code: generateInviteCode(), createdByUserId: ctx.currentUserId })
      .returning()
      .get()
  }),

  revokeInvite: protectedProcedure.input(z.object({ roomId: z.string() })).mutation(({ ctx, input }) => {
    const membership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
    requireRoomOwner(membership)

    ctx.db
      .update(schema.roomInvites)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.roomInvites.roomId, input.roomId), isNull(schema.roomInvites.revokedAt)))
      .run()

    return { ok: true } as const
  }),

  joinByInvite: protectedProcedure.input(z.object({ code: z.string().trim().min(1) })).mutation(({ ctx, input }) => {
    const invite = ctx.db.select().from(schema.roomInvites).where(eq(schema.roomInvites.code, input.code)).get()
    if (!invite || invite.revokedAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This invite link is invalid or has been revoked.' })
    }

    const existing = ctx.db
      .select()
      .from(schema.roomMemberships)
      .where(and(eq(schema.roomMemberships.roomId, invite.roomId), eq(schema.roomMemberships.userId, ctx.currentUserId)))
      .get()

    if (!existing) {
      ctx.db
        .insert(schema.roomMemberships)
        .values({ roomId: invite.roomId, userId: ctx.currentUserId, role: 'member' })
        .run()
    } else if (existing.leftAt) {
      // Rejoining after having left previously — reactivate rather than duplicate.
      ctx.db
        .update(schema.roomMemberships)
        .set({ leftAt: null, joinedAt: new Date() })
        .where(eq(schema.roomMemberships.id, existing.id))
        .run()
    }

    const room = ctx.db.select().from(schema.rooms).where(eq(schema.rooms.id, invite.roomId)).get()
    return { roomId: invite.roomId, roomName: room?.name ?? null }
  }),

  // The owner can't leave or be removed — there's no ownership-transfer or
  // room-deletion feature yet (out of scope for v1, see PLAN.md), so allowing
  // it would leave a room permanently ownerless. Revisit if those ship later.
  leaveRoom: protectedProcedure.input(z.object({ roomId: z.string() })).mutation(({ ctx, input }) => {
    const membership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
    if (membership.role === 'owner') {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: "The owner can't leave a room. Ownership transfer isn't supported yet.",
      })
    }

    ctx.db.update(schema.roomMemberships).set({ leftAt: new Date() }).where(eq(schema.roomMemberships.id, membership.id)).run()
    return { ok: true } as const
  }),

  removeMember: protectedProcedure
    .input(z.object({ roomId: z.string(), userId: z.string() }))
    .mutation(({ ctx, input }) => {
      const callerMembership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
      requireRoomOwner(callerMembership)

      if (input.userId === ctx.currentUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: "The owner can't remove themself. Ownership transfer isn't supported yet.",
        })
      }

      const targetMembership = ctx.db
        .select()
        .from(schema.roomMemberships)
        .where(
          and(
            eq(schema.roomMemberships.roomId, input.roomId),
            eq(schema.roomMemberships.userId, input.userId),
            isNull(schema.roomMemberships.leftAt),
          ),
        )
        .get()
      if (!targetMembership) throw new TRPCError({ code: 'NOT_FOUND' })

      ctx.db
        .update(schema.roomMemberships)
        .set({ leftAt: new Date() })
        .where(eq(schema.roomMemberships.id, targetMembership.id))
        .run()
      return { ok: true } as const
    }),
})
