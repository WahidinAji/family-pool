import { createFileRoute } from '@tanstack/react-router'
import { Check, ImageIcon, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { formatIDR, pendingReceipts, room } from '@/lib/mockData'
import { MockupShell } from './-shell'

export const Route = createFileRoute('/mockups/inbox')({
  component: InboxPage,
})

function InboxPage() {
  return (
    <MockupShell
      title="Pending approvals"
      crumbs={[{ label: 'Rooms', to: '/mockups/rooms' }, { label: room.name, to: '/mockups/room' }, { label: 'Inbox' }]}
    >
      <div className="grid gap-4">
        {pendingReceipts.map((receipt) => {
          const amountMismatch = receipt.extractedAmount !== receipt.confirmedAmount

          return (
            <Card key={receipt.id}>
              <CardContent className="flex items-center gap-4 pt-6">
                <div className="bg-muted flex size-16 shrink-0 items-center justify-center rounded-md">
                  <ImageIcon className="text-muted-foreground size-6" />
                </div>

                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Avatar className="size-6">
                      <AvatarFallback className={`${receipt.uploadedBy.color} text-[10px] text-white`}>
                        {receipt.uploadedBy.initials}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm font-medium">{receipt.uploadedBy.name}</span>
                    <Badge variant="secondary">{receipt.pool}</Badge>
                    <span className="text-muted-foreground text-xs">{receipt.createdAt}</span>
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-lg font-semibold">{formatIDR(receipt.confirmedAmount)}</span>
                    {amountMismatch && (
                      <span className="text-muted-foreground text-xs line-through">
                        OCR read {formatIDR(receipt.extractedAmount)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="border-destructive/40 text-destructive">
                    <X /> Reject
                  </Button>
                  <Button size="sm">
                    <Check /> Approve
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}

        {pendingReceipts.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-muted-foreground text-center text-sm font-normal">
                Nothing waiting on you right now.
              </CardTitle>
            </CardHeader>
          </Card>
        )}
      </div>
    </MockupShell>
  )
}
