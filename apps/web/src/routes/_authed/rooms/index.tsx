import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

export const Route = createFileRoute('/_authed/rooms/')({
  component: RoomsPage,
})

function RoomsPage() {
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const rooms = trpc.room.listMine.useQuery()
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
      {rooms.isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {rooms.data && rooms.data.length === 0 && (
        <Card>
          <CardContent className="text-muted-foreground pt-6 text-center text-sm">
            No rooms yet — create one, or ask someone for an invite link.
          </CardContent>
        </Card>
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
