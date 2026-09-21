import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { Copy, Plus, RefreshCcw } from 'lucide-react'
import { toast } from 'sonner'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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

export const Route = createFileRoute('/_authed/rooms/$roomId/')({
  component: RoomPage,
})

function RoomPage() {
  const { roomId } = Route.useParams()
  const utils = trpc.useUtils()
  const room = trpc.room.get.useQuery({ roomId })
  const pools = trpc.pool.listForRoom.useQuery({ roomId })

  const [poolDialogOpen, setPoolDialogOpen] = useState(false)
  const [poolName, setPoolName] = useState('')
  const [poolPrice, setPoolPrice] = useState('')

  const createPool = trpc.pool.create.useMutation({
    onSuccess: async () => {
      await utils.pool.listForRoom.invalidate({ roomId })
      setPoolDialogOpen(false)
      setPoolName('')
      setPoolPrice('')
    },
  })

  const createInvite = trpc.room.createInvite.useMutation({
    onSuccess: () => utils.room.get.invalidate({ roomId }),
  })
  const revokeInvite = trpc.room.revokeInvite.useMutation({
    onSuccess: () => utils.room.get.invalidate({ roomId }),
  })
  const removeMember = trpc.room.removeMember.useMutation({
    onSuccess: () => utils.room.get.invalidate({ roomId }),
  })
  const leaveRoom = trpc.room.leaveRoom.useMutation({
    onSuccess: () => {
      utils.room.listMine.invalidate()
      window.location.assign('/rooms')
    },
  })

  if (room.isLoading) {
    return (
      <AppShell title="Loading...">
        <p className="text-muted-foreground text-sm">Loading room...</p>
      </AppShell>
    )
  }

  if (room.isError || !room.data) {
    return (
      <AppShell title="Room not found">
        <p className="text-muted-foreground text-sm">
          {room.error?.message ?? "This room doesn't exist, or you're not a member of it."}
        </p>
      </AppShell>
    )
  }

  const { room: roomData, members, myRole, activeInvite } = room.data
  const inviteUrl = activeInvite ? `${window.location.origin}/rooms/join?code=${activeInvite.code}` : null

  return (
    <AppShell title={roomData.name} crumbs={[{ label: 'Rooms', to: '/rooms' }, { label: roomData.name }]}>
      <Tabs defaultValue="pools">
        <TabsList>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="pools">
          {myRole === 'owner' && (
            <div className="mb-4 flex justify-end">
              <Dialog open={poolDialogOpen} onOpenChange={setPoolDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus /> New pool
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      const pricePerPerson = Math.round(Number(poolPrice))
                      if (!Number.isFinite(pricePerPerson) || pricePerPerson <= 0) return
                      createPool.mutate({ roomId, type: 'cost_split', name: poolName, pricePerPerson })
                    }}
                  >
                    <DialogHeader>
                      <DialogTitle>Create a cost-split pool</DialogTitle>
                      <DialogDescription>
                        A recurring shared cost (like Spotify) split evenly among its members. Rotating-pot
                        (arisan) pools arrive in the next phase.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="mt-4 flex flex-col gap-3">
                      <Input
                        autoFocus
                        required
                        placeholder="e.g. Spotify Family"
                        value={poolName}
                        onChange={(event) => setPoolName(event.target.value)}
                      />
                      <Input
                        required
                        type="number"
                        min={1}
                        placeholder="Price per person per month (IDR)"
                        value={poolPrice}
                        onChange={(event) => setPoolPrice(event.target.value)}
                      />
                    </div>
                    {createPool.isError && (
                      <p className="text-destructive mt-2 text-sm">{createPool.error.message}</p>
                    )}
                    <DialogFooter className="mt-4">
                      <Button type="submit" disabled={createPool.isPending}>
                        {createPool.isPending ? 'Creating...' : 'Create pool'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          )}

          {pools.isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

          {pools.data && pools.data.length === 0 && (
            <Card>
              <CardContent className="text-muted-foreground pt-6 text-center text-sm">
                No pools yet.{' '}
                {myRole === 'owner'
                  ? 'Create one to start splitting a shared cost.'
                  : 'The room owner can create one.'}
              </CardContent>
            </Card>
          )}

          {pools.data && pools.data.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              {pools.data.map((pool) => (
                <Link key={pool.id} to="/rooms/$roomId/pools/$poolId" params={{ roomId, poolId: pool.id }}>
                  <Card className="hover:border-primary/50 h-full transition-colors">
                    <CardHeader>
                      <CardTitle className="text-base">{pool.name}</CardTitle>
                      <CardDescription>
                        {pool.type === 'cost_split' ? 'Cost-split pool' : 'Rotating-pot pool'}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardContent className="divide-y pt-6">
              {members.map((member) => (
                <div
                  key={member.membershipId}
                  className="flex flex-wrap items-center justify-between gap-2 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar className="size-8 shrink-0">
                      <AvatarFallback className="text-xs">{member.email.slice(0, 1).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{member.displayName ?? member.email}</p>
                      {member.displayName && (
                        <p className="text-muted-foreground truncate text-xs">{member.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>{member.role}</Badge>
                    {myRole === 'owner' && member.role !== 'owner' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={removeMember.isPending}
                        onClick={() => removeMember.mutate({ roomId, userId: member.userId })}
                      >
                        Remove
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="grid gap-4">
          {myRole === 'owner' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Invite link</CardTitle>
                <CardDescription>Anyone with this link can join as a member.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {inviteUrl ? (
                  <>
                    <Input readOnly value={inviteUrl} className="w-full min-w-0 sm:max-w-sm" />
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(inviteUrl)
                          toast.success('Invite link copied')
                        }}
                      >
                        <Copy /> Copy
                      </Button>
                      <Button
                        variant="outline"
                        disabled={createInvite.isPending}
                        onClick={() => createInvite.mutate({ roomId })}
                      >
                        <RefreshCcw /> Regenerate
                      </Button>
                      <Button
                        variant="outline"
                        className="text-destructive"
                        disabled={revokeInvite.isPending}
                        onClick={() => revokeInvite.mutate({ roomId })}
                      >
                        Revoke
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button disabled={createInvite.isPending} onClick={() => createInvite.mutate({ roomId })}>
                    Create invite link
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {myRole !== 'owner' && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Leave room</CardTitle>
                <CardDescription>You'll need a new invite link to rejoin.</CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="destructive"
                  disabled={leaveRoom.isPending}
                  onClick={() => leaveRoom.mutate({ roomId })}
                >
                  Leave room
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  )
}
