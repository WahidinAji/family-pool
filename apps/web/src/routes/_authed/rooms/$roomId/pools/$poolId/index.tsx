import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { Check, Dices, Plus, Settings2 } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Progress } from '@/components/ui/progress'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { trpc } from '@/lib/trpc'
import { formatIDR } from '@/lib/money'
import { formatPeriod } from '@/lib/period'

export const Route = createFileRoute('/_authed/rooms/$roomId/pools/$poolId/')({
  component: PoolPage,
})

function PoolPage() {
  const { roomId, poolId } = Route.useParams()
  const pools = trpc.pool.listForRoom.useQuery({ roomId })

  if (pools.isLoading) {
    return (
      <AppShell title="Loading...">
        <p className="text-muted-foreground text-sm">Loading pool...</p>
      </AppShell>
    )
  }

  const pool = pools.data?.find((p) => p.id === poolId)
  if (!pool) {
    return (
      <AppShell title="Pool not found">
        <p className="text-muted-foreground text-sm">
          This pool doesn't exist, or you're not a member of its room.
        </p>
      </AppShell>
    )
  }

  return pool.type === 'cost_split' ? (
    <CostSplitPoolView roomId={roomId} poolId={poolId} />
  ) : (
    <ArisanPoolView roomId={roomId} poolId={poolId} />
  )
}

// --- Cost-split ---------------------------------------------------------

function CostSplitPoolView({ roomId, poolId }: { roomId: string; poolId: string }) {
  const utils = trpc.useUtils()
  const me = trpc.auth.me.useQuery()
  const room = trpc.room.get.useQuery({ roomId })
  const status = trpc.pool.getStatus.useQuery({ poolId })

  const [addMemberOpen, setAddMemberOpen] = useState(false)
  const [editPriceOpen, setEditPriceOpen] = useState(false)
  const [priceInput, setPriceInput] = useState('')
  const [overrideTarget, setOverrideTarget] = useState<{ membershipId: string; name: string } | null>(null)
  const [overrideInput, setOverrideInput] = useState('')

  const invalidateStatus = () => utils.pool.getStatus.invalidate({ poolId })

  const addMember = trpc.pool.addMember.useMutation({ onSuccess: invalidateStatus })
  const removeMember = trpc.pool.removeMember.useMutation({ onSuccess: invalidateStatus })
  const updatePrice = trpc.pool.updatePrice.useMutation({
    onSuccess: () => {
      invalidateStatus()
      setEditPriceOpen(false)
      setPriceInput('')
    },
  })
  const setOverride = trpc.pool.setMemberOverride.useMutation({
    onSuccess: () => {
      invalidateStatus()
      setOverrideTarget(null)
      setOverrideInput('')
    },
  })

  if (status.isLoading || room.isLoading) {
    return (
      <AppShell title="Loading...">
        <p className="text-muted-foreground text-sm">Loading pool...</p>
      </AppShell>
    )
  }

  if (status.isError || !status.data || !room.data) {
    return (
      <AppShell title="Pool not found">
        <p className="text-muted-foreground text-sm">
          {status.error?.message ?? "This pool doesn't exist, or you're not a member of it."}
        </p>
      </AppShell>
    )
  }

  const { pool, myRoomRole, currentPricePerPerson, members } = status.data
  const isOwner = myRoomRole === 'owner'
  const you = members.find((m) => m.userId === me.data?.id)
  const nonMembers = room.data.members.filter((rm) => !members.some((pm) => pm.userId === rm.userId))

  return (
    <AppShell
      title={pool.name}
      crumbs={[
        { label: 'Rooms', to: '/rooms' },
        { label: room.data.room.name, to: `/rooms/${roomId}` },
        { label: pool.name },
      ]}
      actions={
        isOwner ? (
          <>
            <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus /> Add member
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a member</DialogTitle>
                  <DialogDescription>Only current room members can be added to a pool.</DialogDescription>
                </DialogHeader>
                <div className="mt-2 flex flex-col gap-2">
                  {nonMembers.length === 0 && (
                    <p className="text-muted-foreground text-sm">Everyone in the room is already in this pool.</p>
                  )}
                  {nonMembers.map((rm) => (
                    <div key={rm.userId} className="flex items-center justify-between gap-2 rounded-md border p-2">
                      <span className="min-w-0 truncate text-sm">{rm.displayName ?? rm.email}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={addMember.isPending}
                        onClick={() => addMember.mutate({ poolId, userId: rm.userId })}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={editPriceOpen} onOpenChange={setEditPriceOpen}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Settings2 /> Edit price
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form
                  onSubmit={(event) => {
                    event.preventDefault()
                    const pricePerPerson = Math.round(Number(priceInput))
                    if (!Number.isFinite(pricePerPerson) || pricePerPerson <= 0) return
                    updatePrice.mutate({ poolId, pricePerPerson })
                  }}
                >
                  <DialogHeader>
                    <DialogTitle>Change the price</DialogTitle>
                    <DialogDescription>
                      Applies from today onward — past months keep the price they were charged at.
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    autoFocus
                    required
                    type="number"
                    min={1}
                    placeholder="New price per person (IDR)"
                    value={priceInput}
                    onChange={(event) => setPriceInput(event.target.value)}
                    className="mt-4"
                  />
                  <DialogFooter className="mt-4">
                    <Button type="submit" disabled={updatePrice.isPending}>
                      {updatePrice.isPending ? 'Saving...' : 'Save'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <CardHeader>
            <CardDescription>Your status</CardDescription>
            <CardTitle className={statusColorClass(you)}>{statusHeadline(you)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {you ? statusDetail(you) : "You're not a member of this pool."}
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardDescription>Pool</CardDescription>
            <CardTitle className="text-xl">
              {currentPricePerPerson != null ? `${formatIDR(currentPricePerPerson)} / person / month` : 'No price set'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {members.length} {members.length === 1 ? 'member' : 'members'}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Members</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Member</TableHead>
                <TableHead>Paid through</TableHead>
                <TableHead>Custom price</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                {isOwner && <TableHead className="text-right">&nbsp;</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.membershipId}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar className="size-6 shrink-0">
                        <AvatarFallback className="text-[10px]">
                          {member.email.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{member.displayName ?? member.email}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {member.paidThroughPeriod ? formatPeriod(member.paidThroughPeriod) : '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {isOwner ? (
                      <Button
                        variant="link"
                        className="h-auto p-0"
                        onClick={() => {
                          setOverrideTarget({
                            membershipId: member.membershipId,
                            name: member.displayName ?? member.email,
                          })
                          setOverrideInput(String(member.currentOverride?.amount ?? ''))
                        }}
                      >
                        {member.currentOverride ? formatIDR(member.currentOverride.amount) : 'Set custom price'}
                      </Button>
                    ) : member.currentOverride ? (
                      formatIDR(member.currentOverride.amount)
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className={`text-right font-medium ${balanceColorClass(member.balance)}`}>
                    {member.balance === 0 ? '—' : formatIDR(member.balance)}
                  </TableCell>
                  {isOwner && (
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={removeMember.isPending}
                        onClick={() => removeMember.mutate({ poolId, userId: member.userId })}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={overrideTarget != null} onOpenChange={(open) => !open && setOverrideTarget(null)}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              const amount = Math.round(Number(overrideInput))
              if (!overrideTarget || !Number.isFinite(amount) || amount <= 0) return
              setOverride.mutate({ poolMembershipId: overrideTarget.membershipId, amount })
            }}
          >
            <DialogHeader>
              <DialogTitle>Custom price for {overrideTarget?.name}</DialogTitle>
              <DialogDescription>
                Overrides the pool's default price for this member from today onward.
              </DialogDescription>
            </DialogHeader>
            <Input
              autoFocus
              required
              type="number"
              min={1}
              placeholder="Amount per month (IDR)"
              value={overrideInput}
              onChange={(event) => setOverrideInput(event.target.value)}
              className="mt-4"
            />
            <DialogFooter className="mt-4">
              <Button type="submit" disabled={setOverride.isPending}>
                {setOverride.isPending ? 'Saving...' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}

type StatusMember = {
  balance: number
  paidThroughPeriod: string | null
  remainderAfterCoverage: number
}

function statusColorClass(member: StatusMember | undefined): string {
  if (!member) return 'text-xl'
  if (member.remainderAfterCoverage < 0) return 'text-destructive text-xl'
  if (member.paidThroughPeriod) return 'text-xl text-emerald-700'
  return 'text-xl'
}

function statusHeadline(member: StatusMember | undefined): string {
  if (!member) return '—'
  if (member.remainderAfterCoverage < 0) return `You owe ${formatIDR(Math.abs(member.remainderAfterCoverage))}`
  if (member.paidThroughPeriod) return `Paid through ${formatPeriod(member.paidThroughPeriod)}`
  return 'Not paid yet'
}

function statusDetail(member: StatusMember): string {
  if (member.remainderAfterCoverage > 0 && member.paidThroughPeriod) {
    return `${formatIDR(member.remainderAfterCoverage)} credit toward next month`
  }
  return `Balance: ${formatIDR(member.balance)}`
}

function balanceColorClass(balance: number): string {
  if (balance < 0) return 'text-destructive'
  if (balance > 0) return 'text-emerald-700'
  return 'text-muted-foreground'
}

// --- Rotating-pot (arisan) ----------------------------------------------

function ArisanPoolView({ roomId, poolId }: { roomId: string; poolId: string }) {
  const utils = trpc.useUtils()
  const room = trpc.room.get.useQuery({ roomId })
  const status = trpc.pool.getArisanStatus.useQuery({ poolId })

  const [addMemberOpen, setAddMemberOpen] = useState(false)

  const invalidateStatus = () => utils.pool.getArisanStatus.invalidate({ poolId })

  const addMember = trpc.pool.addMember.useMutation({ onSuccess: invalidateStatus })
  const startCycle = trpc.pool.startCycle.useMutation({ onSuccess: invalidateStatus })
  const drawRound = trpc.pool.drawRound.useMutation({ onSuccess: invalidateStatus })
  const recordPayout = trpc.pool.recordPayout.useMutation({ onSuccess: invalidateStatus })

  if (status.isLoading || room.isLoading) {
    return (
      <AppShell title="Loading...">
        <p className="text-muted-foreground text-sm">Loading pool...</p>
      </AppShell>
    )
  }

  if (status.isError || !status.data || !room.data) {
    return (
      <AppShell title="Pool not found">
        <p className="text-muted-foreground text-sm">
          {status.error?.message ?? "This pool doesn't exist, or you're not a member of it."}
        </p>
      </AppShell>
    )
  }

  const { pool, myRoomRole, contributionAmount, members, currentCycle, cycles } = status.data
  const isOwner = myRoomRole === 'owner'
  // The rotation grid (with payout buttons) stays on the most recent cycle
  // even after it ends — a cycle completing (all rounds drawn) doesn't mean
  // all payouts are confirmed yet, so those "drawn but not paid" rounds must
  // stay reachable. Only cycles *before* the most recent one count as "past."
  const featuredCycle = cycles.at(-1) ?? null
  const nextRound = featuredCycle?.rounds.find((r) => r.status === 'pending')
  const drawnRounds = featuredCycle?.rounds.filter((r) => r.status !== 'pending').length ?? 0
  const totalRounds = featuredCycle?.rounds.length ?? 0
  const pastCycles = featuredCycle ? cycles.filter((c) => c.id !== featuredCycle.id).reverse() : []
  const nonMembers = room.data.members.filter((rm) => !members.some((pm) => pm.userId === rm.userId))

  return (
    <AppShell
      title={pool.name}
      crumbs={[
        { label: 'Rooms', to: '/rooms' },
        { label: room.data.room.name, to: `/rooms/${roomId}` },
        { label: pool.name },
      ]}
      actions={
        isOwner ? (
          <Dialog open={addMemberOpen} onOpenChange={setAddMemberOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Plus /> Add member
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a member</DialogTitle>
                <DialogDescription>
                  Only current room members can be added. New members join the draw starting next cycle.
                </DialogDescription>
              </DialogHeader>
              <div className="mt-2 flex flex-col gap-2">
                {nonMembers.length === 0 && (
                  <p className="text-muted-foreground text-sm">Everyone in the room is already in this pool.</p>
                )}
                {nonMembers.map((rm) => (
                  <div key={rm.userId} className="flex items-center justify-between gap-2 rounded-md border p-2">
                    <span className="min-w-0 truncate text-sm">{rm.displayName ?? rm.email}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addMember.isPending}
                      onClick={() => addMember.mutate({ poolId, userId: rm.userId })}
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </div>
            </DialogContent>
          </Dialog>
        ) : undefined
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <CardHeader>
            <CardDescription>
              {currentCycle ? `Cycle ${currentCycle.cycleNumber} — round ${drawnRounds + (nextRound ? 1 : 0)} of ${totalRounds}` : 'No cycle running'}
            </CardDescription>
            <CardTitle className="text-xl">
              {!currentCycle
                ? 'Start a cycle to begin drawing'
                : nextRound
                  ? `${nextRound.periodLabel} draw not run yet`
                  : 'Cycle complete'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentCycle && totalRounds > 0 && (
              <Progress value={(drawnRounds / totalRounds) * 100} className="mb-3" />
            )}
            {isOwner && currentCycle && nextRound && (
              <Button
                disabled={drawRound.isPending}
                onClick={() => drawRound.mutate({ cycleId: currentCycle.id, roundNumber: nextRound.roundNumber })}
              >
                <Dices /> {drawRound.isPending ? 'Drawing...' : "Draw this round's winner"}
              </Button>
            )}
            {isOwner && !currentCycle && (
              <Button disabled={startCycle.isPending} onClick={() => startCycle.mutate({ poolId })}>
                {startCycle.isPending ? 'Starting...' : 'Start a new cycle'}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card className="sm:col-span-1">
          <CardHeader>
            <CardDescription>Contribution</CardDescription>
            <CardTitle className="text-xl">
              {contributionAmount != null ? formatIDR(contributionAmount) : 'Not set'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            per person, per round · {members.length} {members.length === 1 ? 'member' : 'members'}
          </CardContent>
        </Card>
      </div>

      {featuredCycle && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Cycle {featuredCycle.cycleNumber}'s rotation</CardTitle>
            <CardDescription>Everyone wins once before a new cycle can start.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-5">
              {featuredCycle.rounds.map((round) => (
                <div
                  key={round.id}
                  className={`flex flex-col items-center gap-2 rounded-lg border p-3 text-center ${
                    round === nextRound ? 'border-primary bg-primary/5' : ''
                  }`}
                >
                  <Avatar className="size-9">
                    {round.winner ? (
                      <AvatarFallback className="text-xs">
                        {round.winner.email.slice(0, 1).toUpperCase()}
                      </AvatarFallback>
                    ) : (
                      <AvatarFallback className="bg-muted text-muted-foreground text-xs">?</AvatarFallback>
                    )}
                  </Avatar>
                  <div>
                    <p className="text-xs font-medium">{round.periodLabel}</p>
                    <p className="text-muted-foreground text-xs">
                      {round.winner ? (round.winner.displayName ?? round.winner.email) : 'Not drawn'}
                    </p>
                  </div>
                  {round.status === 'pending' && <Badge variant="secondary">Pending</Badge>}
                  {round.status === 'drawn' && (
                    <>
                      <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                        <Check className="size-3" /> Won
                      </Badge>
                      {isOwner && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={recordPayout.isPending}
                          onClick={() => recordPayout.mutate({ roundId: round.id })}
                        >
                          Confirm payout sent
                        </Button>
                      )}
                    </>
                  )}
                  {round.status === 'paid' && (
                    <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                      <Check className="size-3" /> Paid out
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {pastCycles.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Past cycles</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {pastCycles.map((cycle) => (
              <div key={cycle.id} className="py-3 first:pt-0 last:pb-0">
                <p className="mb-1 text-sm font-medium">Cycle {cycle.cycleNumber}</p>
                <p className="text-muted-foreground text-sm">
                  {cycle.rounds
                    .map((r) => `${r.winner ? (r.winner.displayName ?? r.winner.email) : '—'} (${r.periodLabel})`)
                    .join(', ')}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </AppShell>
  )
}
