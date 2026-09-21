import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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

export const Route = createFileRoute('/_authed/rooms/')({
  component: RoomsPage,
})

function RoomsPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const rooms = trpc.room.listMine.useQuery()
  const dashboard = trpc.dashboard.summary.useQuery()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

  const createRoom = trpc.room.create.useMutation({
    onSuccess: async (room) => {
      await utils.room.listMine.invalidate()
      setOpen(false)
      setName('')
      navigate({ to: '/rooms/$roomId', params: { roomId: room.id } })
    },
  })

  return (
    <AppShell
      title="Your rooms"
      actions={
        <>
          <Button variant="outline" asChild>
            <Link to="/rooms/join">Join a room</Link>
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus /> New room
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  createRoom.mutate({ name })
                }}
              >
                <DialogHeader>
                  <DialogTitle>Create a room</DialogTitle>
                  <DialogDescription>
                    A room holds pools (shared costs, arisan) and the people splitting them.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  autoFocus
                  required
                  placeholder="e.g. The Wahidin Family"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-4"
                />
                {createRoom.isError && (
                  <p className="text-destructive mt-2 text-sm">{createRoom.error.message}</p>
                )}
                <DialogFooter className="mt-4">
                  <Button type="submit" disabled={createRoom.isPending}>
                    {createRoom.isPending ? 'Creating...' : 'Create room'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </>
      }
    >
      {dashboard.data && (
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardDescription>Total rooms</CardDescription>
              <CardTitle className="text-2xl">{dashboard.data.rooms.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>You owe</CardDescription>
              <CardTitle className={dashboard.data.totalOwed > 0 ? 'text-destructive text-2xl' : 'text-2xl'}>
                {dashboard.data.totalOwed > 0 ? formatIDR(dashboard.data.totalOwed) : 'Nothing'}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Pending approvals</CardDescription>
              <CardTitle className="text-2xl">{dashboard.data.totalPendingApprovals}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {dashboard.data && (dashboard.data.owedPools.length > 0 || dashboard.data.pendingApprovals.length > 0) && (
        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          {dashboard.data.owedPools.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Pools where you owe money</CardTitle>
                <CardDescription>Based on your current ledger balance and price history.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                {dashboard.data.owedPools.map((pool) => (
                  <Link
                    key={pool.poolMembershipId}
                    to="/rooms/$roomId/pools/$poolId"
                    params={{ roomId: pool.roomId, poolId: pool.poolId }}
                    className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{pool.poolName}</p>
                      <p className="text-muted-foreground truncate text-xs">{pool.roomName}</p>
                    </div>
                    <Badge variant="destructive" className="shrink-0">
                      {formatIDR(pool.amountOwed)}
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}

          {dashboard.data.pendingApprovals.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Approvals waiting on you</CardTitle>
                <CardDescription>Receipt uploads that need an owner decision.</CardDescription>
              </CardHeader>
              <CardContent className="divide-y">
                {dashboard.data.pendingApprovals.map((item) => (
                  <Link
                    key={item.roomId}
                    to="/inbox"
                    className="hover:bg-muted/50 -mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 truncate text-sm font-medium">{item.roomName}</span>
                    <Badge className="shrink-0">
                      {item.count} pending
                    </Badge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {(rooms.isLoading || dashboard.isLoading) && <LoadingState label="Loading your rooms..." />}

      {rooms.data && rooms.data.length === 0 && (
        <EmptyState
          title="No rooms yet"
          description="Create a room to start managing shared costs, or ask someone for an invite link."
          action={
            <Button variant="outline" asChild>
              <Link to="/rooms/join">Join a room</Link>
            </Button>
          }
        />
      )}

      {rooms.data && rooms.data.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {rooms.data.map((room) => (
            <Link key={room.id} to="/rooms/$roomId" params={{ roomId: room.id }}>
              <Card className="hover:border-primary/50 h-full transition-colors">
                <CardHeader>
                  <div className="flex min-w-0 items-start justify-between gap-2">
                    <CardTitle className="min-w-0 truncate">{room.name}</CardTitle>
                    <Badge variant={room.role === 'owner' ? 'default' : 'secondary'} className="shrink-0">
                      {room.role}
                    </Badge>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  )
}
