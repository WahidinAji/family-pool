// Generic "YYYY-MM" period arithmetic shared by cost-split coverage
// (costSplitCalc.ts) and arisan round scheduling (arisan.ts).

export type Period = string // "YYYY-MM", zero-padded — lexicographically sortable

export function periodFromDate(date: Date): Period {
  const y = date.getUTCFullYear()
  const m = String(date.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function nextPeriod(period: Period): Period {
  const [y, m] = period.split('-').map(Number) as [number, number]
  const isDecember = m === 12
  return `${isDecember ? y + 1 : y}-${String(isDecember ? 1 : m + 1).padStart(2, '0')}`
}

export function comparePeriods(a: Period, b: Period): number {
  return a < b ? -1 : a > b ? 1 : 0
}

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

/** "2026-03" -> "March 2026" — used for the human-readable rotating_pot_rounds.period_label. */
export function formatPeriodLabel(period: Period): string {
  const [year, month] = period.split('-')
  const monthIndex = Number(month) - 1
  return `${MONTH_NAMES[monthIndex] ?? month} ${year}`
}
