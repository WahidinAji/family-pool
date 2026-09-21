export const SESSION_COOKIE_NAME = 'family_pool_session'

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = part.slice(0, idx).trim()
    const value = part.slice(idx + 1).trim()
    cookies[key] = decodeURIComponent(value)
  }
  return cookies
}

export function serializeSessionCookie(sessionId: string, expiresAt: Date): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Expires=${expiresAt.toUTCString()}`,
  ]
  if (process.env.NODE_ENV === 'production') attrs.push('Secure')
  return attrs.join('; ')
}

export function clearSessionCookie(): string {
  const attrs = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ]
  if (process.env.NODE_ENV === 'production') attrs.push('Secure')
  return attrs.join('; ')
}
