import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-10 text-center">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-muted-foreground mt-1 max-w-md text-sm">{description}</p>
        </div>
        {action}
      </CardContent>
    </Card>
  )
}
