import { createFileRoute } from '@tanstack/react-router'
import { AppShell } from '@/components/app-shell'
import { EmptyState } from '@/components/empty-state'
import { LoadingState } from '@/components/loading-state'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { trpc } from '@/lib/trpc'
import { formatIDR } from '@/lib/money'

export const Route = createFileRoute('/_authed/inbox')({
  component: InboxPage,
})

function InboxPage() {
  const rooms = trpc.room.listMine.useQuery()
  const ownerRooms = rooms.data?.filter((room) => room.role === 'owner') ?? []

  return (
    <AppShell title="Approval inbox" crumbs={[{ label: 'Rooms', to: '/rooms' }, { label: 'Inbox' }]}> 
      {rooms.isLoading && <LoadingState label="Loading approval inbox..." />}
      {ownerRooms.length === 0 && !rooms.isLoading && (
        <EmptyState
          title="No approvals yet"
          description="You don't own any rooms yet, so there are no receipt approvals waiting on you."
        />
      )}
      <div className="grid gap-4">
        {ownerRooms.map((room) => (
          <RoomPendingApprovals key={room.id} roomId={room.id} roomName={room.name} />
        ))}
      </div>
    </AppShell>
  )
}

function RoomPendingApprovals({ roomId, roomName }: { roomId: string; roomName: string }) {
  const utils = trpc.useUtils()
  const pending = trpc.receipt.listPendingForRoom.useQuery({ roomId })
  const approve = trpc.receipt.approve.useMutation({
    onSuccess: () => {
      utils.receipt.listPendingForRoom.invalidate({ roomId })
    },
  })
  const reject = trpc.receipt.reject.useMutation({
    onSuccess: () => {
      utils.receipt.listPendingForRoom.invalidate({ roomId })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{roomName}</CardTitle>
        <CardDescription>Pending receipt approvals across this room's pools.</CardDescription>
      </CardHeader>
      <CardContent>
        {pending.isLoading && <LoadingState label="Loading receipts..." />}
        {pending.data?.length === 0 && (
          <EmptyState title="No pending receipts" description="New confirmed receipt uploads will appear here for approval." />
        )}
        {pending.data && pending.data.length > 0 && (
          <div className="divide-y rounded-lg border">
            {pending.data.map((receipt) => (
              <div key={receipt.id} className="grid gap-3 p-3 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                {receipt.imageDataUrl ? (
                  <img src={receipt.imageDataUrl} alt="Receipt" className="h-16 w-16 rounded-md object-cover" />
                ) : (
                  <div className="bg-muted h-16 w-16 rounded-md" />
                )}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{receipt.poolName}</p>
                    <Badge variant="secondary">pending</Badge>
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {receipt.uploader?.displayName ?? receipt.uploader?.email ?? 'Unknown member'} · Confirmed: {receipt.confirmedAmount ? formatIDR(receipt.confirmedAmount) : 'not confirmed yet'} · OCR: {receipt.extractedAmount ? formatIDR(receipt.extractedAmount) : '—'}
                  </p>
                </div>
                {receipt.confirmedAmount && (
                  <div className="flex gap-2 sm:justify-end">
                    <Button size="sm" disabled={approve.isPending} onClick={() => approve.mutate({ receiptId: receipt.id })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={reject.isPending} onClick={() => reject.mutate({ receiptId: receipt.id })}>
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
