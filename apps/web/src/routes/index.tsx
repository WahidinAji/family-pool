import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { trpc } from '@/lib/trpc'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const ping = trpc.health.ping.useQuery()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">family-pool</h1>
      <p className="text-muted-foreground text-sm">
        {ping.isLoading && 'checking server...'}
        {ping.isError && `server unreachable: ${ping.error.message}`}
        {ping.data && `server ok — ${ping.data.time}`}
      </p>
      <Button asChild>
        <Link to="/login">Log in</Link>
      </Button>
    </div>
  )
}
