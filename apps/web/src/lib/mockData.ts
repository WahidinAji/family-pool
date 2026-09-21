// Design-reference fake data for apps/web/src/routes/mockups/*.
// Not wired to any real schema/tRPC call — delete this whole mockups tree
// once the real Phase 3+ pages replace it.

export interface MockMember {
  id: string
  name: string
  email: string
  role: 'owner' | 'member'
  initials: string
  color: string
}

export const members: MockMember[] = [
  { id: 'alice', name: 'Alice', email: 'alice@example.com', role: 'owner', initials: 'A', color: 'bg-violet-500' },
  { id: 'bob', name: 'Bob', email: 'bob@example.com', role: 'member', initials: 'B', color: 'bg-blue-500' },
  { id: 'carol', name: 'Carol', email: 'carol@example.com', role: 'member', initials: 'C', color: 'bg-emerald-500' },
  { id: 'dave', name: 'Dave', email: 'dave@example.com', role: 'member', initials: 'D', color: 'bg-amber-500' },
  { id: 'erin', name: 'Erin', email: 'erin@example.com', role: 'member', initials: 'E', color: 'bg-rose-500' },
]

export const currentUser = members[0]

export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export interface MockCostSplitMember {
  member: MockMember
  balance: number // positive = credit, negative = owes
  paidThrough: string
}

export const spotifyPool = {
  id: 'spotify',
  name: 'Spotify Family',
  type: 'cost_split' as const,
  pricePerPerson: 200_000,
  currentPeriod: 'March 2027',
  members: [
    { member: members[0], balance: 0, paidThrough: 'March 2027' },
    { member: members[1], balance: -200_000, paidThrough: 'January 2027' },
    { member: members[2], balance: 400_000, paidThrough: 'May 2027' },
    { member: members[3], balance: -400_000, paidThrough: 'December 2026' },
    { member: members[4], balance: 0, paidThrough: 'March 2027' },
  ] satisfies MockCostSplitMember[],
}

export const arisanPool = {
  id: 'arisan',
  name: 'Arisan Bulanan',
  type: 'rotating_pot' as const,
  contributionPerPerson: 100_000,
  cycleNumber: 2,
  totalRounds: 5,
  rounds: [
    { roundNumber: 1, periodLabel: 'Jan 2027', winner: members[4], status: 'drawn' as const },
    { roundNumber: 2, periodLabel: 'Feb 2027', winner: members[0], status: 'drawn' as const },
    { roundNumber: 3, periodLabel: 'Mar 2027', winner: null, status: 'pending' as const },
    { roundNumber: 4, periodLabel: 'Apr 2027', winner: null, status: 'pending' as const },
    { roundNumber: 5, periodLabel: 'May 2027', winner: null, status: 'pending' as const },
  ],
}

export const room = {
  id: 'room-1',
  name: 'The Wahidin Family',
  members,
  pools: [spotifyPool, arisanPool],
}

export const rooms = [
  { id: 'room-1', name: 'The Wahidin Family', role: 'owner' as const, memberCount: 5, poolCount: 2, pendingApprovals: 3 },
  { id: 'room-2', name: 'Kos Anak Rantau', role: 'member' as const, memberCount: 4, poolCount: 1, pendingApprovals: 0 },
]

export interface MockReceipt {
  id: string
  pool: 'Spotify Family' | 'Arisan Bulanan'
  uploadedBy: MockMember
  extractedAmount: number
  confirmedAmount: number
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
}

export const pendingReceipts: MockReceipt[] = [
  {
    id: 'r1',
    pool: 'Spotify Family',
    uploadedBy: members[1],
    extractedAmount: 200_000,
    confirmedAmount: 200_000,
    status: 'pending',
    createdAt: '2 hours ago',
  },
  {
    id: 'r2',
    pool: 'Arisan Bulanan',
    uploadedBy: members[3],
    extractedAmount: 100_000,
    confirmedAmount: 100_000,
    status: 'pending',
    createdAt: '5 hours ago',
  },
  {
    id: 'r3',
    pool: 'Spotify Family',
    uploadedBy: members[2],
    extractedAmount: 195_000,
    confirmedAmount: 200_000,
    status: 'pending',
    createdAt: '1 day ago',
  },
]
