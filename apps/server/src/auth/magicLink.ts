import { eq } from 'drizzle-orm'
import { schema, type Db } from '@family-pool/db'
import { Resend } from 'resend'
import { generateToken, hashToken } from './tokens.js'

const TOKEN_TTL_MS = 15 * 60 * 1000
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null

async function sendMagicLinkEmail(email: string, verifyUrl: string) {
  if (!resend) {
    // No Resend key configured (e.g. local dev) — log instead of sending.
    console.log(`[dev] magic link for ${email}: ${verifyUrl}`)
    return
  }

  await resend.emails.send({
    from: process.env.RESEND_FROM_ADDRESS ?? 'login@example.com',
    to: email,
    subject: 'Your family-pool login link',
    text: [
      `Click to log in: ${verifyUrl}`,
      '',
      "This link expires in 15 minutes. If you didn't request this, you can ignore this email.",
    ].join('\n'),
  })
}

export async function requestMagicLink(db: Db, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase()

  let user = db.select().from(schema.users).where(eq(schema.users.email, email)).get()
  if (!user) {
    user = db.insert(schema.users).values({ email }).returning().get()
  }

  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  db.insert(schema.magicLinkTokens).values({ email, tokenHash, expiresAt }).run()

  const verifyUrl = new URL('/auth/callback', process.env.PUBLIC_APP_URL ?? 'http://localhost:5173')
  verifyUrl.searchParams.set('token', token)

  await sendMagicLinkEmail(email, verifyUrl.toString())

  return user
}

export async function verifyMagicLink(db: Db, token: string) {
  const tokenHash = hashToken(token)
  const now = new Date()

  const record = db
    .select()
    .from(schema.magicLinkTokens)
    .where(eq(schema.magicLinkTokens.tokenHash, tokenHash))
    .get()

  if (!record || record.consumedAt || record.expiresAt.getTime() < now.getTime()) {
    return null
  }

  db.update(schema.magicLinkTokens)
    .set({ consumedAt: now })
    .where(eq(schema.magicLinkTokens.id, record.id))
    .run()

  const user = db.select().from(schema.users).where(eq(schema.users.email, record.email)).get()
  if (!user) return null // requestMagicLink always creates the user first, so this shouldn't happen

  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  const session = db.insert(schema.sessions).values({ userId: user.id, expiresAt }).returning().get()

  return { user, session }
}
