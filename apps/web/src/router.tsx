import { createRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { routeTree } from './routeTree.gen'
import { createTrpcClient, type TrpcClient } from './lib/trpc'

export interface RouterContext {
  queryClient: QueryClient
  trpcClient: TrpcClient
}

export const queryClient = new QueryClient()
export const trpcClient = createTrpcClient()

export const router = createRouter({
  routeTree,
  context: { queryClient, trpcClient } satisfies RouterContext,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
