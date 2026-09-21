import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { RouterContext } from '../router'
import { Toaster } from '@/components/ui/sonner'

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => (
    <>
      <Outlet />
      <Toaster />
    </>
  ),
})
