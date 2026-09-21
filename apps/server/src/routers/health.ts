import { publicProcedure, router } from '../trpc.js'

export const healthRouter = router({
  ping: publicProcedure.query(() => ({ ok: true, time: new Date().toISOString() })),
})
