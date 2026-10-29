import { describe, expect, it } from 'bun:test'
import { shouldPreload } from './lazy.tsx'

describe('shouldPreload: the idle preload of the lazy panels', () => {
  it('runs with a keyboard and no data saving', () => {
    expect(shouldPreload({ input: 'keyboard', saveData: false })).toBe(true)
  })

  it('does not run on a touch device (a phone on mobile data), data saving or not', () => {
    expect(shouldPreload({ input: 'touch', saveData: false })).toBe(false)
    expect(shouldPreload({ input: 'touch', saveData: true })).toBe(false)
  })

  it('does not run with data saving on, even with a keyboard', () => {
    expect(shouldPreload({ input: 'keyboard', saveData: true })).toBe(false)
  })
})
