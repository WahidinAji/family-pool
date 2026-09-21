import { randomInt } from 'node:crypto'

/**
 * Uniformly picks one membership id at random from those who haven't won yet
 * this cycle. Uses crypto randomness (not Math.random()) since this decides
 * who receives a real payout — defensible fairness, not just "good enough."
 */
export function pickRandomWinner(eligibleMembershipIds: string[]): string {
  if (eligibleMembershipIds.length === 0) {
    throw new Error('No eligible members left to draw from.')
  }
  const index = randomInt(eligibleMembershipIds.length)
  return eligibleMembershipIds[index]!
}
