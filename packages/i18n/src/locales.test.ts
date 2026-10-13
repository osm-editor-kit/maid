import { describe, expect, it } from 'bun:test'
import { locales } from '../paraglide/runtime.js'
import { LOCALES } from './choose.ts'
import { m, getLocale, setLocale } from './index.ts'

// needs the compiled output (bun run i18n-compile, run before the test by `bun run check`)
describe('the compiled output', () => {
  it('has the same languages as the list in choose.ts', () => {
    expect([...locales]).toEqual([...LOCALES])
  })

  it('answers in the language set, and in English until then', () => {
    expect(getLocale()).toBe('en')
    expect(String(m.topbar_point())).toBe('Point')
    setLocale('de')
    expect(getLocale()).toBe('de')
    expect(String(m.topbar_point())).toBe('Punkt')
    expect(String(m.topbar_undo({ change: 'Line' }))).toBe('Rückgängig: Line')
    setLocale('en')
    expect(String(m.topbar_undo({ change: 'Line' }))).toBe('Undo: Line')
  })
})
