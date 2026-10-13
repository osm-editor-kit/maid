import { describe, expect, test } from 'bun:test'
import { restoreSettings } from './store.ts'

const current = { enabled: false, showClosed: false }

describe('restoreSettings', () => {
  test('nothing stored gives the defaults: no requests until the person switches the notes on', () => {
    expect(restoreSettings(undefined, current)).toBe(current)
  })

  test('the enabled flag must be a boolean: a stored string never switches the requests on', () => {
    expect(restoreSettings({ enabled: 'true', showClosed: false }, current)).toBe(current)
    expect(restoreSettings({ enabled: 1, showClosed: false }, current)).toBe(current)
  })

  test('a stored state that is complete is read back', () => {
    expect(restoreSettings({ enabled: true, showClosed: true }, current)).toEqual({
      enabled: true,
      showClosed: true,
    })
  })
})
