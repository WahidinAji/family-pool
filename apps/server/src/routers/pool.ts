import { TRPCError } from '@trpc/server'
import { and, eq, isNull } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import { z } from 'zod'
import { requireRoomMembership, requireRoomOwner } from '../rooms/authorization.js'
import { requirePoolMembership, requirePoolOwner } from '../pools/authorization.js'
import { computeCostSplitCoverage, effectivePriceAt, periodFromDate } from '../pools/costSplitCalc.js'
import { protectedProcedure, router } from '../trpc.js'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export const poolRouter = router({
  listForRoom: protectedProcedure.input(z.object({ roomId: z.string() })).query(({ ctx, input }) => {
    requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
    return ctx.db
      .select()
      .from(schema.pools)
      .where(and(eq(schema.pools.roomId, input.roomId), isNull(schema.pools.archivedAt)))
      .all()
  }),

  create: protectedProcedure
    .input(
      z.object({
        roomId: z.string(),
        type: z.literal('cost_split'),
        name: z.string().trim().min(1).max(100),
        pricePerPerson: z.number().int().positive(),
        currencyCode: z.string().length(3).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const membership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
      requireRoomOwner(membership)

      const pool = ctx.db
        .insert(schema.pools)
        .values({
          roomId: input.roomId,
          type: 'cost_split',
          name: input.name,
          currencyCode: input.currencyCode ?? 'IDR',
        })
        .returning()
        .get()

      ctx.db
        .insert(schema.poolPriceHistory)
        .values({ poolId: pool.id, effectiveFrom: today(), perPersonAmount: input.pricePerPerson })
        .run()

      return pool
    }),

  addMember: protectedProcedure
    .input(z.object({ poolId: z.string(), userId: z.string() }))
    .mutation(({ ctx, input }) => {
      const { pool } = requirePoolOwner(ctx.db, input.poolId, ctx.currentUserId)
      // The target must actually be in the room — a pool can't have members the room doesn't.
      requireRoomMembership(ctx.db, pool.roomId, input.userId)

      const existing = ctx.db
        .select()
        .from(schema.poolMemberships)
        .where(and(eq(schema.poolMemberships.poolId, input.poolId), eq(schema.poolMemberships.userId, input.userId)))
        .get()

      if (existing && !existing.leftAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already a member of this pool.' })
      }

      if (existing) {
        ctx.db
          .update(schema.poolMemberships)
          .set({ leftAt: null, joinedAt: new Date() })
          .where(eq(schema.poolMemberships.id, existing.id))
          .run()
      } else {
        ctx.db.insert(schema.poolMemberships).values({ poolId: input.poolId, userId: input.userId }).run()
      }

      return { ok: true } as const
    }),

  removeMember: protectedProcedure
    .input(z.object({ poolId: z.string(), userId: z.string() }))
    .mutation(({ ctx, input }) => {
      requirePoolOwner(ctx.db, input.poolId, ctx.currentUserId)

      const membership = ctx.db
        .select()
        .from(schema.poolMemberships)
        .where(
          and(
            eq(schema.poolMemberships.poolId, input.poolId),
            eq(schema.poolMemberships.userId, input.userId),
            isNull(schema.poolMemberships.leftAt),
          ),
        )
        .get()
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' })

      ctx.db
        .update(schema.poolMemberships)
        .set({ leftAt: new Date() })
        .where(eq(schema.poolMemberships.id, membership.id))
        .run()
      return { ok: true } as const
    }),

  setMemberOverride: protectedProcedure
    .input(z.object({ poolMembershipId: z.string(), amount: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const membership = ctx.db
        .select()
        .from(schema.poolMemberships)
        .where(eq(schema.poolMemberships.id, input.poolMembershipId))
        .get()
      if (!membership) throw new TRPCError({ code: 'NOT_FOUND' })

      requirePoolOwner(ctx.db, membership.poolId, ctx.currentUserId)

      ctx.db
        .insert(schema.poolMembershipOverrides)
        .values({ poolMembershipId: input.poolMembershipId, effectiveFrom: today(), amount: input.amount })
        .run()
      return { ok: true } as const
    }),

  updatePrice: protectedProcedure
    .input(z.object({ poolId: z.string(), pricePerPerson: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      requirePoolOwner(ctx.db, input.poolId, ctx.currentUserId)

      ctx.db
        .insert(schema.poolPriceHistory)
        .values({ poolId: input.poolId, effectiveFrom: today(), perPersonAmount: input.pricePerPerson })
        .run()
      return { ok: true } as const
    }),

  getStatus: protectedProcedure.input(z.object({ poolId: z.string() })).query(({ ctx, input }) => {
    const { pool, roomMembership } = requirePoolMembership(ctx.db, input.poolId, ctx.currentUserId)

    const priceHistory = ctx.db
      .select({
        effectiveFrom: schema.poolPriceHistory.effectiveFrom,
        amount: schema.poolPriceHistory.perPersonAmount,
        createdAt: schema.poolPriceHistory.createdAt,
      })
      .from(schema.poolPriceHistory)
      .where(eq(schema.poolPriceHistory.poolId, input.poolId))
      .all()

    const memberships = ctx.db
      .select({
        membershipId: schema.poolMemberships.id,
        userId: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
        joinedAt: schema.poolMemberships.joinedAt,
        leftAt: schema.poolMemberships.leftAt,
      })
      .from(schema.poolMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.poolMemberships.userId))
      .where(and(eq(schema.poolMemberships.poolId, input.poolId), isNull(schema.poolMemberships.leftAt)))
      .all()

    const ledgerRows = ctx.db
      .select({
        poolMembershipId: schema.poolLedgerEntries.poolMembershipId,
        amountDelta: schema.poolLedgerEntries.amountDelta,
      })
      .from(schema.poolLedgerEntries)
      .innerJoin(schema.poolMemberships, eq(schema.poolMemberships.id, schema.poolLedgerEntries.poolMembershipId))
      .where(eq(schema.poolMemberships.poolId, input.poolId))
      .all()
    const balanceByMembership = new Map<string, number>()
    for (const row of ledgerRows) {
      balanceByMembership.set(row.poolMembershipId, (balanceByMembership.get(row.poolMembershipId) ?? 0) + row.amountDelta)
    }

    const overrideRows = ctx.db
      .select({
        poolMembershipId: schema.poolMembershipOverrides.poolMembershipId,
        effectiveFrom: schema.poolMembershipOverrides.effectiveFrom,
        amount: schema.poolMembershipOverrides.amount,
        createdAt: schema.poolMembershipOverrides.createdAt,
      })
      .from(schema.poolMembershipOverrides)
      .innerJoin(
        schema.poolMemberships,
        eq(schema.poolMemberships.id, schema.poolMembershipOverrides.poolMembershipId),
      )
      .where(eq(schema.poolMemberships.poolId, input.poolId))
      .all()
    const overridesByMembership = new Map<string, { effectiveFrom: string; amount: number; createdAt: Date }[]>()
    for (const row of overrideRows) {
      const list = overridesByMembership.get(row.poolMembershipId) ?? []
      list.push({ effectiveFrom: row.effectiveFrom, amount: row.amount, createdAt: row.createdAt })
      overridesByMembership.set(row.poolMembershipId, list)
    }
    // Sort each membership's overrides so ".at(-1)" below means "most recently
    // effective" (ties on effectiveFrom broken by createdAt), not "however SQL
    // happened to return the rows."
    for (const list of overridesByMembership.values()) {
      list.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.createdAt.getTime() - b.createdAt.getTime())
    }

    const members = memberships.map((m) => {
      const coverage = computeCostSplitCoverage({
        joinedAt: m.joinedAt,
        leftAt: m.leftAt,
        ledgerBalance: balanceByMembership.get(m.membershipId) ?? 0,
        poolPriceHistory: priceHistory,
        memberOverrides: overridesByMembership.get(m.membershipId) ?? [],
      })
      return {
        membershipId: m.membershipId,
        userId: m.userId,
        email: m.email,
        displayName: m.displayName,
        currentOverride: overridesByMembership.get(m.membershipId)?.at(-1) ?? null,
        ...coverage,
      }
    })

    return {
      pool,
      myRoomRole: roomMembership.role,
      currentPricePerPerson: effectivePriceAt(periodFromDate(new Date()), priceHistory),
      members,
    }
  }),
})
