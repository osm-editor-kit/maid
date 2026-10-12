import { describe, expect, test } from 'bun:test'
import { shouldDismiss } from './BottomSheet.tsx'

describe('shouldDismiss', () => {
  test('a slow drag closes the sheet only past its distance', () => {
    expect(shouldDismiss(0, 0)).toBe(false)
    expect(shouldDismiss(120, 0)).toBe(false)
    expect(shouldDismiss(121, 0)).toBe(true)
  })

  test('a fast flick closes it even when short', () => {
    expect(shouldDismiss(20, 501)).toBe(true)
    expect(shouldDismiss(20, 500)).toBe(false)
  })

  test('a drag up never closes it', () => {
    expect(shouldDismiss(-200, -800)).toBe(false)
  })
})
