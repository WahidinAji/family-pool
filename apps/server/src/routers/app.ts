import { router } from '../trpc.js'
import { authRouter } from './auth.js'
import { dashboardRouter } from './dashboard.js'
import { healthRouter } from './health.js'
import { poolRouter } from './pool.js'
import { receiptRouter } from './receipt.js'
import { roomRouter } from './room.js'

export const appRouter = router({
  health: healthRouter,
  dashboard: dashboardRouter,
  auth: authRouter,
  room: roomRouter,
  pool: poolRouter,
  receipt: receiptRouter,
})

export type AppRouter = typeof appRouter
