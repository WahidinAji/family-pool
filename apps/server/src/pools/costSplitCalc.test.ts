import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { computeCostSplitCoverage, effectivePriceAt } from './costSplitCalc.js'
import { nextPeriod, periodFromDate } from './period.js'

const d = (iso: string) => new Date(`${iso}T00:00:00Z`)

describe('periodFromDate / nextPeriod', () => {
  test('formats YYYY-MM in UTC', () => {
    assert.equal(periodFromDate(d('2026-03-15')), '2026-03')
  })

  test('rolls over December to next January', () => {
    assert.equal(nextPeriod('2026-12'), '2027-01')
  })

  test('increments within a year', () => {
    assert.equal(nextPeriod('2026-05'), '2026-06')
  })
})

describe('effectivePriceAt', () => {
  const history = [
    { effectiveFrom: '2026-01-01', amount: 100 },
    { effectiveFrom: '2026-04-01', amount: 150 },
  ]

  test('returns null before any entry applies', () => {
    assert.equal(effectivePriceAt('2025-12', history), null)
  })

  test('returns the entry in effect for a given period', () => {
    assert.equal(effectivePriceAt('2026-02', history), 100)
    assert.equal(effectivePriceAt('2026-04', history), 150)
    assert.equal(effectivePriceAt('2026-12', history), 150)
  })

  test('two changes on the same day: the later-created one wins (regression)', () => {
    // Found via E2E testing: updating a price twice in one day silently kept
    // the old value because same-period entries need a tiebreaker.
    const sameDayHistory = [
      { effectiveFrom: '2026-09-21', amount: 200_000, createdAt: new Date('2026-09-21T06:54:00Z') },
      { effectiveFrom: '2026-09-21', amount: 250_000, createdAt: new Date('2026-09-21T07:10:00Z') },
    ]
    assert.equal(effectivePriceAt('2026-09', sameDayHistory), 250_000)
  })
})

describe('computeCostSplitCoverage', () => {
  test('on-time payment covers exactly one period', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: null,
      ledgerBalance: 100,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [],
    })
    assert.equal(result.paidThroughPeriod, '2026-01')
    assert.equal(result.nextUnpaidPeriod, '2026-02')
    assert.equal(result.remainderAfterCoverage, 0)
  })

  test('prepaying multiple periods covers them all', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: null,
      ledgerBalance: 500,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [],
    })
    assert.equal(result.paidThroughPeriod, '2026-05')
    assert.equal(result.nextUnpaidPeriod, '2026-06')
    assert.equal(result.remainderAfterCoverage, 0)
  })

  test('underpaying a period covers nothing and keeps the partial credit', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: null,
      ledgerBalance: 50,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [],
    })
    assert.equal(result.paidThroughPeriod, null)
    assert.equal(result.nextUnpaidPeriod, '2026-01')
    assert.equal(result.remainderAfterCoverage, 50)
  })

  test('a negative balance (owing) covers nothing from the join period', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: null,
      ledgerBalance: -100,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [],
    })
    assert.equal(result.paidThroughPeriod, null)
    assert.equal(result.nextUnpaidPeriod, '2026-01')
    assert.equal(result.remainderAfterCoverage, -100)
  })

  test('a price change mid-history is respected period by period', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: null,
      ledgerBalance: 450,
      poolPriceHistory: [
        { effectiveFrom: '2026-01-01', amount: 100 },
        { effectiveFrom: '2026-04-01', amount: 150 },
      ],
      memberOverrides: [],
    })
    // Jan+Feb+Mar @100 (300) + Apr @150 (150) = 450 exactly
    assert.equal(result.paidThroughPeriod, '2026-04')
    assert.equal(result.nextUnpaidPeriod, '2026-05')
    assert.equal(result.remainderAfterCoverage, 0)
  })

  test('a member who joined mid-cycle only accrues from their join period', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-03-01'),
      leftAt: null,
      ledgerBalance: 200,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [],
    })
    assert.equal(result.paidThroughPeriod, '2026-04')
    assert.equal(result.nextUnpaidPeriod, '2026-05')
    assert.equal(result.remainderAfterCoverage, 0)
  })

  test('a member who left is capped at their leave period even with leftover balance', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: d('2026-03-15'),
      ledgerBalance: 500,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [],
    })
    // Would cover Jan-May at 100/mo, but leaving mid-March caps it at March.
    assert.equal(result.paidThroughPeriod, '2026-03')
    assert.equal(result.nextUnpaidPeriod, '2026-04')
    assert.equal(result.remainderAfterCoverage, 200)
  })

  test('a member override takes priority over the pool default', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: null,
      ledgerBalance: 150,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [{ effectiveFrom: '2026-01-01', amount: 50 }],
    })
    assert.equal(result.paidThroughPeriod, '2026-03')
    assert.equal(result.nextUnpaidPeriod, '2026-04')
    assert.equal(result.remainderAfterCoverage, 0)
  })

  test('an override starting later only applies from its own effective date', () => {
    const result = computeCostSplitCoverage({
      joinedAt: d('2026-01-01'),
      leftAt: null,
      ledgerBalance: 300,
      poolPriceHistory: [{ effectiveFrom: '2026-01-01', amount: 100 }],
      memberOverrides: [{ effectiveFrom: '2026-03-01', amount: 50 }],
    })
    // Jan+Feb @100 (200) + Mar+Apr @50 (100) = 300 exactly
    assert.equal(result.paidThroughPeriod, '2026-04')
    assert.equal(result.nextUnpaidPeriod, '2026-05')
    assert.equal(result.remainderAfterCoverage, 0)
  })
})
