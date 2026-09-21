import { router } from '../trpc.js'
import { authRouter } from './auth.js'
import { healthRouter } from './health.js'

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
})

export type AppRouter = typeof appRouter
