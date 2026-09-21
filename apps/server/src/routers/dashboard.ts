import { and, eq, isNull } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import { computeCostSplitCoverage, effectivePriceAt } from '../pools/costSplitCalc.js'
import { protectedProcedure, router } from '../trpc.js'

export const dashboardRouter = router({
  summary: protectedProcedure.query(({ ctx }) => {
    const rooms = ctx.db
      .select({
        id: schema.rooms.id,
        name: schema.rooms.name,
        role: schema.roomMemberships.role,
      })
      .from(schema.roomMemberships)
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.roomMemberships.roomId))
      .where(and(eq(schema.roomMemberships.userId, ctx.currentUserId), isNull(schema.roomMemberships.leftAt)))
      .all()

    const costSplitMemberships = ctx.db
      .select({
        poolMembershipId: schema.poolMemberships.id,
        poolId: schema.pools.id,
        poolName: schema.pools.name,
        roomId: schema.rooms.id,
        roomName: schema.rooms.name,
        joinedAt: schema.poolMemberships.joinedAt,
        leftAt: schema.poolMemberships.leftAt,
      })
      .from(schema.poolMemberships)
      .innerJoin(schema.pools, eq(schema.pools.id, schema.poolMemberships.poolId))
      .innerJoin(schema.rooms, eq(schema.rooms.id, schema.pools.roomId))
      .innerJoin(schema.roomMemberships, eq(schema.roomMemberships.roomId, schema.rooms.id))
      .where(
        and(
          eq(schema.poolMemberships.userId, ctx.currentUserId),
          eq(schema.roomMemberships.userId, ctx.currentUserId),
          isNull(schema.poolMemberships.leftAt),
          isNull(schema.roomMemberships.leftAt),
          isNull(schema.pools.archivedAt),
          eq(schema.pools.type, 'cost_split'),
        ),
      )
      .all()

    const owedPools = costSplitMemberships
      .map((membership) => {
        const priceHistory = ctx.db
          .select({
            effectiveFrom: schema.poolPriceHistory.effectiveFrom,
            amount: schema.poolPriceHistory.perPersonAmount,
            createdAt: schema.poolPriceHistory.createdAt,
          })
          .from(schema.poolPriceHistory)
          .where(eq(schema.poolPriceHistory.poolId, membership.poolId))
          .all()

        const overrides = ctx.db
          .select({
            effectiveFrom: schema.poolMembershipOverrides.effectiveFrom,
            amount: schema.poolMembershipOverrides.amount,
            createdAt: schema.poolMembershipOverrides.createdAt,
          })
          .from(schema.poolMembershipOverrides)
          .where(eq(schema.poolMembershipOverrides.poolMembershipId, membership.poolMembershipId))
          .all()

        const ledgerRows = ctx.db
          .select({ amountDelta: schema.poolLedgerEntries.amountDelta })
          .from(schema.poolLedgerEntries)
          .where(eq(schema.poolLedgerEntries.poolMembershipId, membership.poolMembershipId))
          .all()
        const ledgerBalance = ledgerRows.reduce((sum, row) => sum + row.amountDelta, 0)
        const coverage = computeCostSplitCoverage({
          joinedAt: membership.joinedAt,
          leftAt: membership.leftAt,
          ledgerBalance,
          poolPriceHistory: priceHistory,
          memberOverrides: overrides,
        })

        return {
          poolMembershipId: membership.poolMembershipId,
          poolId: membership.poolId,
          poolName: membership.poolName,
          roomId: membership.roomId,
          roomName: membership.roomName,
          currentPricePerPerson: effectivePriceAt(new Date().toISOString().slice(0, 7), priceHistory),
          balance: coverage.balance,
          remainderAfterCoverage: coverage.remainderAfterCoverage,
          paidThroughPeriod: coverage.paidThroughPeriod,
          amountOwed: Math.max(0, -coverage.remainderAfterCoverage),
        }
      })
      .filter((pool) => pool.amountOwed > 0)
      .sort((a, b) => b.amountOwed - a.amountOwed)

    const pendingApprovals = rooms
      .filter((room) => room.role === 'owner')
      .map((room) => {
        const count = ctx.db
          .select({ id: schema.receipts.id })
          .from(schema.receipts)
          .innerJoin(schema.pools, eq(schema.pools.id, schema.receipts.poolId))
          .where(and(eq(schema.pools.roomId, room.id), eq(schema.receipts.status, 'pending')))
          .all().length
        return { roomId: room.id, roomName: room.name, count }
      })
      .filter((item) => item.count > 0)

    return {
      rooms,
      owedPools,
      pendingApprovals,
      totalOwed: owedPools.reduce((sum, pool) => sum + pool.amountOwed, 0),
      totalPendingApprovals: pendingApprovals.reduce((sum, item) => sum + item.count, 0),
    }
  }),
})
