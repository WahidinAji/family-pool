import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { z } from 'zod'
import { AppShell } from '@/components/app-shell'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { trpc } from '@/lib/trpc'

const searchSchema = z.object({ code: z.string().optional() })

export const Route = createFileRoute('/_authed/rooms/join')({
  validateSearch: searchSchema,
  component: JoinRoomPage,
})

function JoinRoomPage() {
  const { code: codeFromLink } = Route.useSearch()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const [code, setCode] = useState(codeFromLink ?? '')

  const joinByInvite = trpc.room.joinByInvite.useMutation({
    onSuccess: async (result) => {
      await utils.room.listMine.invalidate()
      navigate({ to: '/rooms/$roomId', params: { roomId: result.roomId } })
    },
  })

  return (
    <AppShell title="Join a room" crumbs={[{ label: 'Rooms', to: '/rooms' }, { label: 'Join' }]}>
      <Card className="max-w-sm">
        <CardHeader>
          <CardTitle className="text-base">Enter an invite code</CardTitle>
          <CardDescription>Paste the code, or open the invite link someone sent you directly.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault()
              joinByInvite.mutate({ code })
            }}
          >
            <Input
              autoFocus
              required
              placeholder="e.g. AB3D9F2K"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <Button type="submit" disabled={joinByInvite.isPending}>
              {joinByInvite.isPending ? 'Joining...' : 'Join room'}
            </Button>
            {joinByInvite.isError && <p className="text-destructive text-sm">{joinByInvite.error.message}</p>}
          </form>
        </CardContent>
      </Card>
    </AppShell>
  )
}
