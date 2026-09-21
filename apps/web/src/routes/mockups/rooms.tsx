import { createFileRoute, Link } from '@tanstack/react-router'
import { Plus, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { rooms } from '@/lib/mockData'
import { MockupShell } from './-shell'

export const Route = createFileRoute('/mockups/rooms')({
  component: RoomsPage,
})

function RoomsPage() {
  return (
    <MockupShell
      title="Your rooms"
      actions={
        <Button>
          <Plus /> New room
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {rooms.map((room) => (
          <Link key={room.id} to="/mockups/room">
            <Card className="hover:border-primary/50 h-full transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between">
                  <CardTitle>{room.name}</CardTitle>
                  <Badge variant={room.role === 'owner' ? 'default' : 'secondary'}>{room.role}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-muted-foreground flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Users className="size-4" /> {room.memberCount} members
                  </span>
                  <span>
                    {room.poolCount} {room.poolCount === 1 ? 'pool' : 'pools'}
                  </span>
                </div>
                {room.pendingApprovals > 0 && (
                  <Badge variant="outline" className="border-amber-600 text-amber-700 mt-3">
                    {room.pendingApprovals} receipts waiting on you
                  </Badge>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}

        <Link to="/mockups/rooms">
          <Card className="border-dashed hover:border-primary/50 flex h-full min-h-[140px] items-center justify-center text-center transition-colors">
            <CardContent className="text-muted-foreground flex flex-col items-center gap-2 pt-6">
              <Plus className="size-5" />
              <span className="text-sm">Create a room, or join one with an invite link</span>
            </CardContent>
          </Card>
        </Link>
      </div>
    </MockupShell>
  )
}
