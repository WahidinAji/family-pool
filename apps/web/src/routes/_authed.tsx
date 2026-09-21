import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/_authed')({
  beforeLoad: async ({ context }) => {
    const user = await context.trpcClient.auth.me.query()
    if (!user) {
      throw redirect({ to: '/login' })
    }
    return { user }
  },
  component: () => <Outlet />,
})
