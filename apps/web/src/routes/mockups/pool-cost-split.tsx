import { createFileRoute } from '@tanstack/react-router'
import { Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { currentUser, formatIDR, pendingReceipts, room, spotifyPool } from '@/lib/mockData'
import { MockupShell } from './-shell'

export const Route = createFileRoute('/mockups/pool-cost-split')({
  component: CostSplitPoolPage,
})

function CostSplitPoolPage() {
  const you = spotifyPool.members.find((m) => m.member.id === currentUser.id)!
  const receipts = pendingReceipts.filter((r) => r.pool === spotifyPool.name)

  return (
    <MockupShell
      title={spotifyPool.name}
      crumbs={[
        { label: 'Rooms', to: '/mockups/rooms' },
        { label: room.name, to: '/mockups/room' },
        { label: spotifyPool.name },
      ]}
      actions={
        <Button>
          <Upload /> Upload receipt
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-1">
          <CardHeader>
            <CardDescription>Your status</CardDescription>
            <CardTitle className={you.balance < 0 ? 'text-destructive text-xl' : 'text-xl text-emerald-700'}>
              {you.balance < 0
                ? `You owe ${formatIDR(Math.abs(you.balance))}`
                : you.balance > 0
                  ? `${formatIDR(you.balance)} credit`
                  : 'All settled'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Paid through <span className="text-foreground font-medium">{you.paidThrough}</span>
          </CardContent>
        </Card>

        <Card className="sm:col-span-2">
          <CardHeader>
            <CardDescription>Pool</CardDescription>
            <CardTitle className="text-xl">{formatIDR(spotifyPool.pricePerPerson)} / person / month</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {spotifyPool.members.length} members · current period {spotifyPool.currentPeriod}
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
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {spotifyPool.members.map(({ member, balance, paidThrough }) => (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6">
                        <AvatarFallback className={`${member.color} text-[10px] text-white`}>
                          {member.initials}
                        </AvatarFallback>
                      </Avatar>
                      {member.name}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{paidThrough}</TableCell>
                  <TableCell
                    className={`text-right font-medium ${
                      balance < 0 ? 'text-destructive' : balance > 0 ? 'text-emerald-700' : 'text-muted-foreground'
                    }`}
                  >
                    {balance === 0 ? '—' : formatIDR(balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Recent receipts</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {receipts.map((receipt) => (
            <div key={receipt.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div className="flex items-center gap-3">
                <Avatar className="size-7">
                  <AvatarFallback className={`${receipt.uploadedBy.color} text-xs text-white`}>
                    {receipt.uploadedBy.initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">{receipt.uploadedBy.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatIDR(receipt.confirmedAmount)} · {receipt.createdAt}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="border-amber-600 text-amber-700">
                Pending approval
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </MockupShell>
  )
}
