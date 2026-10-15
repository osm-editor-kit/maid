import { describe, expect, it } from 'bun:test'
import { resolveTheme } from './theme.ts'

// The theme in effect: a fixed choice stays as it is, `system` follows the operating system.

describe('resolveTheme', () => {
  it('a fixed light or dark choice is shown as it is, whatever the system says', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('system follows the operating system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
