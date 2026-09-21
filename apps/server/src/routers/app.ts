import { router } from '../trpc.js'
import { authRouter } from './auth.js'
import { healthRouter } from './health.js'
import { poolRouter } from './pool.js'
import { roomRouter } from './room.js'

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  room: roomRouter,
  pool: poolRouter,
})

export type AppRouter = typeof appRouter
