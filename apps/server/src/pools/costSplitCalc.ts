// Pure calculation engine for cost-split pools — no DB/tRPC imports, so it's
// directly unit-testable (see costSplitCalc.test.ts). This is the riskiest
// piece of business logic in the app (PLAN.md); keep it isolated and covered.
//
// Model: a pool_membership's ledger balance (sum of pool_ledger_entries) is
// the source of truth. "Paid through period X" is *derived* here by walking
// forward month-by-month from the member's join period, consuming the
// balance at each period's effective price, until the balance can no longer
// cover the next period. Effective price = the member's override active as
// of that period if one exists, else the pool's default price active as of
// that period — both are append-only histories, looked up by "latest entry
// at or before this period."

import { comparePeriods, nextPeriod, periodFromDate, type Period } from './period.js'

export type { Period }

export interface PriceEntry {
  effectiveFrom: string // "YYYY-MM-DD" (or any string starting with "YYYY-MM")
  amount: number // integer minor units
  /** Tiebreaker when two entries share the same effectiveFrom period (e.g. the
   * price was changed twice in one day) — the later-created entry wins. */
  createdAt?: Date
}

export interface CostSplitCoverageInput {
  joinedAt: Date
  leftAt: Date | null
  ledgerBalance: number // pre-summed SUM(amount_delta), integer minor units
  poolPriceHistory: PriceEntry[]
  memberOverrides: PriceEntry[]
}

export interface CostSplitCoverageResult {
  balance: number
  /** Last period fully covered by the balance, or null if not even the join period is covered. */
  paidThroughPeriod: Period | null
  /** First period not yet covered — where the member needs to pay next (or is capped at leftAt+1). */
  nextUnpaidPeriod: Period | null
  /** Balance remaining after covering paidThroughPeriod (a partial credit toward nextUnpaidPeriod). */
  remainderAfterCoverage: number
}

// Safety valve against runaway loops from bad data (e.g. a leftAt far in the
// future, or a price of 0). 1200 months = 100 years, well beyond any real use.
const MAX_PERIODS = 1200

function periodFromDateString(dateStr: string): Period {
  return dateStr.slice(0, 7)
}

/** The entry with the latest effectiveFrom that is still <= period, or null if none applies yet.
 * Ties on effectiveFrom (same period) are broken by createdAt, most recent wins. */
function latestApplicable(entries: PriceEntry[], period: Period): PriceEntry | null {
  let best: PriceEntry | null = null
  for (const entry of entries) {
    const entryPeriod = periodFromDateString(entry.effectiveFrom)
    if (comparePeriods(entryPeriod, period) > 0) continue
    if (!best) {
      best = entry
      continue
    }
    const cmp = comparePeriods(entryPeriod, periodFromDateString(best.effectiveFrom))
    const isNewer =
      cmp > 0 || (cmp === 0 && (entry.createdAt?.getTime() ?? 0) >= (best.createdAt?.getTime() ?? 0))
    if (isNewer) best = entry
  }
  return best
}

export function effectivePriceAt(period: Period, poolPriceHistory: PriceEntry[]): number | null {
  return latestApplicable(poolPriceHistory, period)?.amount ?? null
}

function effectiveMemberPriceAt(
  period: Period,
  poolPriceHistory: PriceEntry[],
  memberOverrides: PriceEntry[],
): number | null {
  const override = latestApplicable(memberOverrides, period)
  if (override) return override.amount
  return effectivePriceAt(period, poolPriceHistory)
}

export function computeCostSplitCoverage(input: CostSplitCoverageInput): CostSplitCoverageResult {
  const stopPeriod = input.leftAt ? periodFromDate(input.leftAt) : null

  let period = periodFromDate(input.joinedAt)
  let remaining = input.ledgerBalance
  let paidThrough: Period | null = null

  for (let i = 0; i < MAX_PERIODS; i++) {
    if (stopPeriod && comparePeriods(period, stopPeriod) > 0) break

    const price = effectiveMemberPriceAt(period, input.poolPriceHistory, input.memberOverrides)
    if (price == null || remaining < price) break

    remaining -= price
    paidThrough = period
    period = nextPeriod(period)
  }

  return {
    balance: input.ledgerBalance,
    paidThroughPeriod: paidThrough,
    nextUnpaidPeriod: period,
    remainderAfterCoverage: remaining,
  }
}
