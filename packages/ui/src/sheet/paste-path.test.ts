import { describe, expect, it } from 'bun:test'
import { takeFallback } from './paste-path.ts'

describe('takeFallback: one gesture pastes once', () => {
  it('runs the fallback when no paste event took its token', () => {
    expect(takeFallback(7, 7)).toEqual({ take: true, pending: null })
  })

  it('does nothing when a paste event took the token (pending is null)', () => {
    expect(takeFallback(null, 7)).toEqual({ take: false, pending: null })
  })

  it('does nothing for a token from an older gesture, and keeps the newer one pending', () => {
    expect(takeFallback(8, 7)).toEqual({ take: false, pending: 8 })
  })
})
