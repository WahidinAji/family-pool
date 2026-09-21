import { createFileRoute } from '@tanstack/react-router'
import { Check, Dices, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { arisanPool, formatIDR, room } from '@/lib/mockData'
import { MockupShell } from './-shell'

export const Route = createFileRoute('/mockups/pool-arisan')({
  component: ArisanPoolPage,
})

function ArisanPoolPage() {
  const drawnRounds = arisanPool.rounds.filter((r) => r.status === 'drawn').length
  const nextRound = arisanPool.rounds.find((r) => r.status === 'pending')

  return (
    <MockupShell
      title={arisanPool.name}
      crumbs={[
        { label: 'Rooms', to: '/mockups/rooms' },
        { label: room.name, to: '/mockups/room' },
        { label: arisanPool.name },
      ]}
      actions={
        <Button variant="outline">
          <Upload /> Upload receipt
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardDescription>
              Cycle {arisanPool.cycleNumber} — round {nextRound?.roundNumber} of {arisanPool.totalRounds}
            </CardDescription>
            <CardTitle className="text-xl">
              {nextRound ? `${nextRound.periodLabel} draw not run yet` : 'Cycle complete'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={(drawnRounds / arisanPool.totalRounds) * 100} className="mb-3" />
            <Button>
              <Dices /> Draw this round's winner
            </Button>
          </CardContent>
        </Card>

        <Card className="sm:col-span-1">
          <CardHeader>
            <CardDescription>Contribution</CardDescription>
            <CardTitle className="text-xl">{formatIDR(arisanPool.contributionPerPerson)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">per person, per month</CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">This cycle's rotation</CardTitle>
          <CardDescription>Everyone wins once before a new cycle can start.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-5">
            {arisanPool.rounds.map((round) => (
              <div
                key={round.roundNumber}
                className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center ${
                  round.status === 'pending' && round === nextRound ? 'border-primary bg-primary/5' : ''
                }`}
              >
                <Avatar className="size-9">
                  {round.winner ? (
                    <AvatarFallback className={`${round.winner.color} text-xs text-white`}>
                      {round.winner.initials}
                    </AvatarFallback>
                  ) : (
                    <AvatarFallback className="bg-muted text-muted-foreground text-xs">?</AvatarFallback>
                  )}
                </Avatar>
                <div>
                  <p className="text-xs font-medium">{round.periodLabel}</p>
                  <p className="text-muted-foreground text-xs">{round.winner?.name ?? 'Not drawn'}</p>
                </div>
                {round.status === 'drawn' ? (
                  <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                    <Check className="size-3" /> Won
                  </Badge>
                ) : (
                  <Badge variant="secondary">Pending</Badge>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </MockupShell>
  )
}
