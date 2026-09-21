const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 3

// In-memory is fine — this is a single-node deployment (see PLAN.md Infra).
const attempts = new Map<string, number[]>()

export function checkRateLimit(key: string): boolean {
  const now = Date.now()
  const recent = (attempts.get(key) ?? []).filter((t) => now - t < WINDOW_MS)

  if (recent.length >= MAX_ATTEMPTS) {
    attempts.set(key, recent)
    return false
  }

  recent.push(now)
  attempts.set(key, recent)
  return true
}
