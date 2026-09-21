import { createFileRoute, Link } from '@tanstack/react-router'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const Route = createFileRoute('/mockups/')({
  component: MockupsIndex,
})

const screens = [
  { to: '/mockups/rooms', title: 'Room list', description: 'Dashboard — every room you belong to.' },
  { to: '/mockups/room', title: 'Room detail', description: 'Pools, members, and settings tabs for one room.' },
  {
    to: '/mockups/pool-cost-split',
    title: 'Cost-split pool',
    description: 'Spotify-style pool — balances, paid-through status, receipts.',
  },
  {
    to: '/mockups/pool-arisan',
    title: 'Rotating-pot pool',
    description: 'Arisan-style pool — cycle status, rotation order, draw.',
  },
  { to: '/mockups/inbox', title: 'Receipt inbox', description: "Owner's pending-approval queue across pools." },
] as const

function MockupsIndex() {
  return (
    <div className="bg-muted/30 flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight">UI design review</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          Static mockups with fake data — not wired to the real backend. Delete this route once the
          real pages exist.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {screens.map((screen) => (
            <Link key={screen.to} to={screen.to}>
              <Card className="hover:border-primary/50 h-full transition-colors">
                <CardHeader>
                  <CardTitle className="text-base">{screen.title}</CardTitle>
                  <CardDescription>{screen.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
