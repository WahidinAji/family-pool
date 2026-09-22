import { TRPCError } from '@trpc/server'
import { and, eq, isNull, ne } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import { z } from 'zod'
import { requireRoomMembership, requireRoomOwner } from '../rooms/authorization.js'
import { requirePoolMembership, requirePoolOwner } from '../pools/authorization.js'
import { computeCostSplitCoverage, effectivePriceAt } from '../pools/costSplitCalc.js'
import { periodFromDate, formatPeriodLabel, nextPeriod } from '../pools/period.js'
import { pickRandomWinner } from '../pools/arisan.js'
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
      z.discriminatedUnion('type', [
        z.object({
          roomId: z.string(),
          type: z.literal('cost_split'),
          name: z.string().trim().min(1).max(100),
          pricePerPerson: z.number().int().positive(),
          currencyCode: z.string().length(3).optional(),
        }),
        z.object({
          roomId: z.string(),
          type: z.literal('rotating_pot'),
          name: z.string().trim().min(1).max(100),
          contributionAmount: z.number().int().positive(),
          currencyCode: z.string().length(3).optional(),
        }),
      ]),
    )
    .mutation(({ ctx, input }) => {
      const membership = requireRoomMembership(ctx.db, input.roomId, ctx.currentUserId)
      requireRoomOwner(membership)

      const pool = ctx.db
        .insert(schema.pools)
        .values({
          roomId: input.roomId,
          type: input.type,
          name: input.name,
          currencyCode: input.currencyCode ?? 'IDR',
        })
        .returning()
        .get()

      // Both pool types store their per-period amount the same way — a
      // rotating-pot's "contribution amount" is just its price history, same
      // as a cost-split's price, so the same lookup infra (effectivePriceAt)
      // works for both without duplicating a second amount-history table.
      const perPersonAmount = input.type === 'cost_split' ? input.pricePerPerson : input.contributionAmount
      ctx.db
        .insert(schema.poolPriceHistory)
        .values({ poolId: pool.id, effectiveFrom: today(), perPersonAmount })
        .run()

      // The creator doesn't automatically get a pool_memberships row just by
      // owning the room — a pool can have members the owner isn't part of
      // (e.g. a shared cost they administer but don't pay into). But the
      // common case is the owner also participates, so pre-add them; they
      // can remove themselves afterward like any other member.
      ctx.db.insert(schema.poolMemberships).values({ poolId: pool.id, userId: ctx.currentUserId }).run()

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
    if (pool.type !== 'cost_split') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This pool is not a cost-split pool.' })
    }

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

  // --- Rotating-pot (arisan) --------------------------------------------

  startCycle: protectedProcedure.input(z.object({ poolId: z.string() })).mutation(({ ctx, input }) => {
    const { pool } = requirePoolOwner(ctx.db, input.poolId, ctx.currentUserId)
    if (pool.type !== 'rotating_pot') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This pool is not a rotating-pot pool.' })
    }

    const activeCycle = ctx.db
      .select()
      .from(schema.rotatingPotCycles)
      .where(and(eq(schema.rotatingPotCycles.poolId, input.poolId), isNull(schema.rotatingPotCycles.endedAt)))
      .get()
    if (activeCycle) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'A cycle is already in progress for this pool.' })
    }

    const activeMemberships = ctx.db
      .select({ membershipId: schema.poolMemberships.id })
      .from(schema.poolMemberships)
      .where(and(eq(schema.poolMemberships.poolId, input.poolId), isNull(schema.poolMemberships.leftAt)))
      .all()
    if (activeMemberships.length === 0) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Add members before starting a cycle.' })
    }

    const previousCycles = ctx.db
      .select({ cycleNumber: schema.rotatingPotCycles.cycleNumber })
      .from(schema.rotatingPotCycles)
      .where(eq(schema.rotatingPotCycles.poolId, input.poolId))
      .all()
    const nextCycleNumber = previousCycles.reduce((max, c) => Math.max(max, c.cycleNumber), 0) + 1

    const cycle = ctx.db
      .insert(schema.rotatingPotCycles)
      .values({ poolId: input.poolId, cycleNumber: nextCycleNumber })
      .returning()
      .get()

    // One round per active member — round_number represents the chronological
    // sequence of draws, not any pre-assigned winner.
    let period = periodFromDate(new Date())
    for (let i = 0; i < activeMemberships.length; i++) {
      ctx.db
        .insert(schema.rotatingPotRounds)
        .values({ cycleId: cycle.id, roundNumber: i + 1, periodLabel: formatPeriodLabel(period) })
        .run()
      period = nextPeriod(period)
    }

    return cycle
  }),

  drawRound: protectedProcedure
    .input(z.object({ cycleId: z.string(), roundNumber: z.number().int().positive() }))
    .mutation(({ ctx, input }) => {
      const cycle = ctx.db
        .select()
        .from(schema.rotatingPotCycles)
        .where(eq(schema.rotatingPotCycles.id, input.cycleId))
        .get()
      if (!cycle) throw new TRPCError({ code: 'NOT_FOUND' })
      requirePoolOwner(ctx.db, cycle.poolId, ctx.currentUserId)

      if (cycle.endedAt) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This cycle has already ended.' })
      }

      const round = ctx.db
        .select()
        .from(schema.rotatingPotRounds)
        .where(
          and(
            eq(schema.rotatingPotRounds.cycleId, input.cycleId),
            eq(schema.rotatingPotRounds.roundNumber, input.roundNumber),
          ),
        )
        .get()
      if (!round) throw new TRPCError({ code: 'NOT_FOUND' })
      if (round.status !== 'pending') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This round has already been drawn.' })
      }

      // Rounds represent chronological months — drawing out of order would
      // break the "everyone wins exactly once per cycle" guarantee.
      const earlierPending = ctx.db
        .select({ roundNumber: schema.rotatingPotRounds.roundNumber })
        .from(schema.rotatingPotRounds)
        .where(
          and(eq(schema.rotatingPotRounds.cycleId, input.cycleId), eq(schema.rotatingPotRounds.status, 'pending')),
        )
        .all()
        .filter((r) => r.roundNumber < input.roundNumber)
      if (earlierPending.length > 0) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Earlier rounds in this cycle must be drawn first.' })
      }

      // 'drawn' and 'paid' both mean "already won this cycle" — only 'pending'
      // rounds haven't produced a winner yet.
      const wonAlreadyRows = ctx.db
        .select({ winnerId: schema.rotatingPotRounds.winnerPoolMembershipId })
        .from(schema.rotatingPotRounds)
        .where(
          and(eq(schema.rotatingPotRounds.cycleId, input.cycleId), ne(schema.rotatingPotRounds.status, 'pending')),
        )
        .all()
      const wonAlready = new Set(wonAlreadyRows.map((r) => r.winnerId).filter((id): id is string => id != null))

      const eligible = ctx.db
        .select({ membershipId: schema.poolMemberships.id })
        .from(schema.poolMemberships)
        .where(and(eq(schema.poolMemberships.poolId, cycle.poolId), isNull(schema.poolMemberships.leftAt)))
        .all()
        .map((m) => m.membershipId)
        .filter((membershipId) => !wonAlready.has(membershipId))

      if (eligible.length === 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'No eligible members left to draw from — someone may have left the pool.',
        })
      }

      const winnerPoolMembershipId = pickRandomWinner(eligible)

      ctx.db
        .update(schema.rotatingPotRounds)
        .set({ winnerPoolMembershipId, drawnAt: new Date(), status: 'drawn' })
        .where(eq(schema.rotatingPotRounds.id, round.id))
        .run()

      // Cycle completes once no pending rounds remain.
      const stillPending = ctx.db
        .select({ id: schema.rotatingPotRounds.id })
        .from(schema.rotatingPotRounds)
        .where(
          and(eq(schema.rotatingPotRounds.cycleId, input.cycleId), eq(schema.rotatingPotRounds.status, 'pending')),
        )
        .all()
      if (stillPending.length === 0) {
        ctx.db
          .update(schema.rotatingPotCycles)
          .set({ endedAt: new Date() })
          .where(eq(schema.rotatingPotCycles.id, input.cycleId))
          .run()
      }

      return { winnerPoolMembershipId } as const
    }),

  recordPayout: protectedProcedure.input(z.object({ roundId: z.string() })).mutation(({ ctx, input }) => {
    const round = ctx.db.select().from(schema.rotatingPotRounds).where(eq(schema.rotatingPotRounds.id, input.roundId)).get()
    if (!round) throw new TRPCError({ code: 'NOT_FOUND' })

    const cycle = ctx.db
      .select()
      .from(schema.rotatingPotCycles)
      .where(eq(schema.rotatingPotCycles.id, round.cycleId))
      .get()
    if (!cycle) throw new TRPCError({ code: 'NOT_FOUND' })

    requirePoolOwner(ctx.db, cycle.poolId, ctx.currentUserId)

    if (round.status === 'pending') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: "This round hasn't been drawn yet." })
    }
    if (round.status === 'paid') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This round has already been paid out.' })
    }
    if (!round.winnerPoolMembershipId) {
      throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Drawn round is missing a winner.' })
    }

    const priceHistory = ctx.db
      .select({
        effectiveFrom: schema.poolPriceHistory.effectiveFrom,
        amount: schema.poolPriceHistory.perPersonAmount,
        createdAt: schema.poolPriceHistory.createdAt,
      })
      .from(schema.poolPriceHistory)
      .where(eq(schema.poolPriceHistory.poolId, cycle.poolId))
      .all()
    const contributionAmount = effectivePriceAt(periodFromDate(new Date()), priceHistory)
    if (contributionAmount == null) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'No contribution amount set for this pool.' })
    }

    const activeMemberCount = ctx.db
      .select({ id: schema.poolMemberships.id })
      .from(schema.poolMemberships)
      .where(and(eq(schema.poolMemberships.poolId, cycle.poolId), isNull(schema.poolMemberships.leftAt)))
      .all().length

    // Crediting the winner (see PLAN.md Phase 5): a positive ledger entry,
    // same sign convention as a cost-split contribution. Unlike cost-split,
    // this isn't "coverage" — it's the lump sum the winner actually receives.
    const potAmount = contributionAmount * activeMemberCount
    ctx.db
      .insert(schema.poolLedgerEntries)
      .values({ poolMembershipId: round.winnerPoolMembershipId, amountDelta: potAmount, reason: 'pot_payout' })
      .run()

    ctx.db.update(schema.rotatingPotRounds).set({ status: 'paid' }).where(eq(schema.rotatingPotRounds.id, round.id)).run()

    return { ok: true, amount: potAmount } as const
  }),

  getArisanStatus: protectedProcedure.input(z.object({ poolId: z.string() })).query(({ ctx, input }) => {
    const { pool, roomMembership } = requirePoolMembership(ctx.db, input.poolId, ctx.currentUserId)
    if (pool.type !== 'rotating_pot') {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'This pool is not a rotating-pot pool.' })
    }

    const priceHistory = ctx.db
      .select({
        effectiveFrom: schema.poolPriceHistory.effectiveFrom,
        amount: schema.poolPriceHistory.perPersonAmount,
        createdAt: schema.poolPriceHistory.createdAt,
      })
      .from(schema.poolPriceHistory)
      .where(eq(schema.poolPriceHistory.poolId, input.poolId))
      .all()

    const members = ctx.db
      .select({
        membershipId: schema.poolMemberships.id,
        userId: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
      })
      .from(schema.poolMemberships)
      .innerJoin(schema.users, eq(schema.users.id, schema.poolMemberships.userId))
      .where(and(eq(schema.poolMemberships.poolId, input.poolId), isNull(schema.poolMemberships.leftAt)))
      .all()

    const cycles = ctx.db
      .select()
      .from(schema.rotatingPotCycles)
      .where(eq(schema.rotatingPotCycles.poolId, input.poolId))
      .all()
      .sort((a, b) => a.cycleNumber - b.cycleNumber)

    const cycleIds = cycles.map((c) => c.id)
    const roundsByCycle = new Map<string, (typeof schema.rotatingPotRounds.$inferSelect)[]>()
    for (const cycleId of cycleIds) {
      const rounds = ctx.db
        .select()
        .from(schema.rotatingPotRounds)
        .where(eq(schema.rotatingPotRounds.cycleId, cycleId))
        .all()
        .sort((a, b) => a.roundNumber - b.roundNumber)
      roundsByCycle.set(cycleId, rounds)
    }

    const userByMembership = new Map(members.map((m) => [m.membershipId, m]))
    const currentCycle = cycles.find((c) => !c.endedAt) ?? null

    return {
      pool,
      myRoomRole: roomMembership.role,
      contributionAmount: effectivePriceAt(periodFromDate(new Date()), priceHistory),
      members,
      currentCycle,
      cycles: cycles.map((cycle) => ({
        ...cycle,
        rounds: (roundsByCycle.get(cycle.id) ?? []).map((round) => ({
          ...round,
          winner: round.winnerPoolMembershipId ? (userByMembership.get(round.winnerPoolMembershipId) ?? null) : null,
        })),
      })),
    }
  }),
})
