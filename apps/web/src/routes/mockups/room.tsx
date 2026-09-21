import { createFileRoute, Link } from '@tanstack/react-router'
import { Copy, Music, RefreshCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { room, spotifyPool, arisanPool, formatIDR } from '@/lib/mockData'
import { MockupShell } from './-shell'

export const Route = createFileRoute('/mockups/room')({
  component: RoomPage,
})

function RoomPage() {
  return (
    <MockupShell
      title={room.name}
      crumbs={[{ label: 'Rooms', to: '/mockups/rooms' }, { label: room.name }]}
      actions={
        <Button variant="outline">
          <Copy /> Copy invite link
        </Button>
      }
    >
      <Tabs defaultValue="pools">
        <TabsList>
          <TabsTrigger value="pools">Pools</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="pools" className="grid gap-4 sm:grid-cols-2">
          <Link to="/mockups/pool-cost-split">
            <Card className="hover:border-primary/50 h-full transition-colors">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Music className="text-muted-foreground size-4" />
                  <CardTitle className="text-base">{spotifyPool.name}</CardTitle>
                </div>
                <CardDescription>{formatIDR(spotifyPool.pricePerPerson)}/person/month</CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="border-emerald-600 text-emerald-700">
                  You're paid through {spotifyPool.currentPeriod}
                </Badge>
              </CardContent>
            </Card>
          </Link>

          <Link to="/mockups/pool-arisan">
            <Card className="hover:border-primary/50 h-full transition-colors">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <RefreshCcw className="text-muted-foreground size-4" />
                  <CardTitle className="text-base">{arisanPool.name}</CardTitle>
                </div>
                <CardDescription>
                  {formatIDR(arisanPool.contributionPerPerson)}/person/month · Cycle {arisanPool.cycleNumber}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Badge variant="outline" className="border-amber-600 text-amber-700">
                  Round 3 of {arisanPool.totalRounds} — not drawn yet
                </Badge>
              </CardContent>
            </Card>
          </Link>
        </TabsContent>

        <TabsContent value="members">
          <Card>
            <CardContent className="divide-y pt-6">
              {room.members.map((member) => (
                <div key={member.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarFallback className={`${member.color} text-xs text-white`}>
                        {member.initials}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-medium">{member.name}</p>
                      <p className="text-muted-foreground text-xs">{member.email}</p>
                    </div>
                  </div>
                  <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>{member.role}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Room name</CardTitle>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input defaultValue={room.name} className="max-w-sm" />
              <Button variant="outline">Save</Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Invite link</CardTitle>
              <CardDescription>Anyone with this link can join as a member.</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input readOnly value="https://family-pool.example/join/WAHIDIN-FAM" className="max-w-sm" />
              <Button variant="outline">
                <Copy /> Copy
              </Button>
              <Button variant="outline">
                <RefreshCcw /> Regenerate
              </Button>
            </CardContent>
          </Card>
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive text-base">Danger zone</CardTitle>
              <CardDescription>Deleting a room removes all its pools and history.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="destructive">Delete room</Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </MockupShell>
  )
}
