export const SESSION_COOKIE_NAME = 'family_pool_session'

// NODE_ENV=production doesn't mean the connection is actually HTTPS — this
// deployment may sit behind plain HTTP (e.g. LAN-only, no tunnel yet).
// Browsers silently drop `Secure` cookies set over HTTP, which breaks login
// outright. Key it off PUBLIC_APP_URL, which reflects the real scheme.
function isHttps(): boolean {
  return (process.env.PUBLIC_APP_URL ?? '').startsWith('https://')
}

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
  if (isHttps()) attrs.push('Secure')
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
  if (isHttps()) attrs.push('Secure')
  return attrs.join('; ')
}
