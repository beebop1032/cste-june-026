import { describe, it, expect } from 'vitest'

const { makeToken } = await import('../lib/auth.js')

describe('makeToken', () => {
  it('returns a 64-char hex string', () => {
    const t = makeToken('prof', 'secret')
    expect(t).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is deterministic', () => {
    expect(makeToken('prof', 'secret')).toBe(makeToken('prof', 'secret'))
  })

  it('differs by role', () => {
    expect(makeToken('prof', 'secret')).not.toBe(makeToken('admin', 'secret'))
  })
})
