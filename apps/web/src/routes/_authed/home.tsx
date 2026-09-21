import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

export const Route = createFileRoute('/_authed/home')({
  component: HomePage,
})

function HomePage() {
  const { user } = Route.useRouteContext()
  const navigate = useNavigate()
  const utils = trpc.useUtils()
  const logout = trpc.auth.logout.useMutation({
    onSuccess: async () => {
      await utils.invalidate()
      navigate({ to: '/login' })
    },
  })

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3">
      <p>Logged in as {user.email}</p>
      <Button variant="outline" onClick={() => logout.mutate()} disabled={logout.isPending}>
        {logout.isPending ? 'Logging out...' : 'Log out'}
      </Button>
    </div>
  )
}
