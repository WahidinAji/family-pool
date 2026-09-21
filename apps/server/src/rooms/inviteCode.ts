import { randomBytes } from 'node:crypto'

// Excludes visually ambiguous characters (0/O, 1/I) since this gets read aloud
// or typed by hand as often as it gets pasted from a link.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateInviteCode(length = 8): string {
  const bytes = randomBytes(length)
  let code = ''
  for (const byte of bytes) {
    code += ALPHABET[byte % ALPHABET.length]
  }
  return code
}
