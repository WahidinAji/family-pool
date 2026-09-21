import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'

const searchSchema = z.object({ token: z.string().optional() })

export const Route = createFileRoute('/auth/callback')({
  validateSearch: searchSchema,
  component: AuthCallbackPage,
})

function AuthCallbackPage() {
  const { token } = Route.useSearch()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const verifyMagicLink = trpc.auth.verifyMagicLink.useMutation()

  useEffect(() => {
    if (!token) {
      setError('This login link is missing a token.')
      return
    }
    verifyMagicLink.mutate(
      { token },
      {
        onSuccess: () => navigate({ to: '/home' }),
        onError: (err) => setError(err.message),
      },
    )
    // Run once per token — verifyMagicLink identity changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-4">
        <p className="text-destructive text-sm">{error}</p>
        <Button onClick={() => navigate({ to: '/login' })}>Request a new link</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground text-sm">Logging you in...</p>
    </div>
  )
}
