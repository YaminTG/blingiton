import { describe, expect, it } from 'vitest'

import { base32Decode, base32Encode, checkCode, codeAt, hashRecovery, looksLikeRecovery, newRecoveryCodes, newSecret, stepAt } from '@/lib/totp'

// RFC 6238 appendix B: the SHA-1 secret is ASCII "12345678901234567890"; the RFC lists 8 digits,
// and 6-digit codes are the last six of those.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'))

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    expect(codeAt(RFC_SECRET, stepAt(59_000))).toBe('287082')
    expect(codeAt(RFC_SECRET, stepAt(1_111_111_109_000))).toBe('081804')
    expect(codeAt(RFC_SECRET, stepAt(1_234_567_890_000))).toBe('005924')
    expect(codeAt(RFC_SECRET, stepAt(20_000_000_000_000))).toBe('353130')
  })

  it('round-trips base32', () => {
    const secret = newSecret()
    expect(secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(base32Encode(base32Decode(secret))).toBe(secret)
  })

  it('accepts the current code and one step either side, nothing further', () => {
    const secret = newSecret()
    const now = 1_700_000_000_000
    const step = stepAt(now)
    expect(checkCode(secret, codeAt(secret, step), now)).toBe(step)
    expect(checkCode(secret, codeAt(secret, step - 1), now)).toBe(step - 1)
    expect(checkCode(secret, codeAt(secret, step + 1), now)).toBe(step + 1)
    expect(checkCode(secret, codeAt(secret, step - 3), now)).toBeNull()
  })

  it('refuses a code that was already used', () => {
    const secret = newSecret()
    const now = 1_700_000_000_000
    const step = stepAt(now)
    expect(checkCode(secret, codeAt(secret, step), now, step)).toBeNull()
    expect(checkCode(secret, codeAt(secret, step - 1), now, step)).toBeNull()
  })

  it('ignores spaces and refuses anything that is not six digits', () => {
    const secret = newSecret()
    const now = Date.now()
    const code = codeAt(secret, stepAt(now))
    expect(checkCode(secret, `${code.slice(0, 3)} ${code.slice(3)}`, now)).not.toBeNull()
    expect(checkCode(secret, code.slice(0, 5), now)).toBeNull()
    expect(checkCode(secret, 'abcdef', now)).toBeNull()
  })

  it('makes recovery codes that hash the same however they are typed', () => {
    const codes = newRecoveryCodes()
    expect(codes).toHaveLength(10)
    expect(new Set(codes).size).toBe(10)
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/)
    const [first] = codes
    expect(hashRecovery(first!.toUpperCase().replace('-', ' '))).toBe(hashRecovery(first!))
    expect(looksLikeRecovery(first!)).toBe(true)
    expect(looksLikeRecovery('123456')).toBe(false)
  })
})
