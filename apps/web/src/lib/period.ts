const MONTHS = [
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

/** "2026-03" -> "March 2026" */
export function formatPeriod(period: string): string {
  const [year, month] = period.split('-')
  const monthIndex = Number(month) - 1
  return `${MONTHS[monthIndex] ?? month} ${year}`
}
