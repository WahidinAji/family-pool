import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { trpc } from '@/lib/trpc'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { toastError, toastSuccess } from '@/lib/feedback'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string | null>(null)
  const requestMagicLink = trpc.auth.requestMagicLink.useMutation({
    onSuccess: () => {
      toastSuccess('Login link sent')
      setSentTo(email)
    },
    onError: (error) => toastError(error, 'Could not send login link.'),
  })

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <h1 className="sr-only">Log in</h1>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>
            {sentTo
              ? `We sent a login link to ${sentTo}. Check your inbox.`
              : "Enter your email and we'll send you a login link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!sentTo && (
            <form
              className="flex flex-col gap-3"
              onSubmit={(event) => {
                event.preventDefault()
                requestMagicLink.mutate({ email })
              }}
            >
              <Input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <Button type="submit" disabled={requestMagicLink.isPending}>
                {requestMagicLink.isPending ? 'Sending...' : 'Send login link'}
              </Button>
              {requestMagicLink.isError && (
                <p className="text-destructive text-sm">{requestMagicLink.error.message}</p>
              )}
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
