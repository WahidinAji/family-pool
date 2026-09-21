import { TRPCError } from '@trpc/server'
import { eq } from 'drizzle-orm'
import { schema } from '@family-pool/db'
import { z } from 'zod'
import { requestMagicLink, verifyMagicLink } from '../auth/magicLink.js'
import { checkRateLimit } from '../auth/rateLimit.js'
import { clearSessionCookie, parseCookies, serializeSessionCookie, SESSION_COOKIE_NAME } from '../auth/cookies.js'
import { publicProcedure, router } from '../trpc.js'

function toPublicUser(user: typeof schema.users.$inferSelect) {
  return { id: user.id, email: user.email, displayName: user.displayName }
}

export const authRouter = router({
  requestMagicLink: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ ctx, input }) => {
      const ip = ctx.req.socket.remoteAddress ?? 'unknown'
      const email = input.email.trim().toLowerCase()

      if (!checkRateLimit(`email:${email}`) || !checkRateLimit(`ip:${ip}`)) {
        throw new TRPCError({
          code: 'TOO_MANY_REQUESTS',
          message: 'Too many login attempts. Try again in a few minutes.',
        })
      }

      await requestMagicLink(ctx.db, email)
      return { ok: true } as const
    }),

  verifyMagicLink: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const result = await verifyMagicLink(ctx.db, input.token)
      if (!result) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This link is invalid or has expired.' })
      }

      ctx.res.setHeader('Set-Cookie', serializeSessionCookie(result.session.id, result.session.expiresAt))
      return { user: toPublicUser(result.user) }
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookies = parseCookies(ctx.req.headers.cookie)
    const sessionId = cookies[SESSION_COOKIE_NAME]

    if (sessionId) {
      ctx.db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId)).run()
    }

    ctx.res.setHeader('Set-Cookie', clearSessionCookie())
    return { ok: true } as const
  }),

  me: publicProcedure.query(({ ctx }) => {
    if (!ctx.currentUserId) return null
    const user = ctx.db.select().from(schema.users).where(eq(schema.users.id, ctx.currentUserId)).get()
    return user ? toPublicUser(user) : null
  }),
})
