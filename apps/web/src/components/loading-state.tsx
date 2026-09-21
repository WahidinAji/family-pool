import { Card, CardContent } from '@/components/ui/card'

export function LoadingState({ label = 'Loading...' }: { label?: string }) {
  return (
    <Card>
      <CardContent className="grid gap-3 p-4" aria-busy="true" aria-label={label}>
        <p className="text-muted-foreground text-sm">{label}</p>
        <div className="grid gap-2">
          <div className="bg-muted h-4 w-2/3 animate-pulse rounded" />
          <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
          <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
        </div>
      </CardContent>
    </Card>
  )
}
