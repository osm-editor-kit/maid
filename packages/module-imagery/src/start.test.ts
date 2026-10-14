import { describe, expect, it } from 'bun:test'
import {
  pendingBackground,
  pendingOverlays,
  sameIds,
  shownBackground,
  shownOverlays,
  startBackground,
  startOverlays,
  type StartBackgroundInput,
} from './start.ts'
import { customValue, NONE } from './url.ts'

const CUSTOM = customValue('https://a.example/{z}/{x}/{y}.png')
const KNOWN = new Set([
  'Bing',
  'best-layer',
  'stored-layer',
  'default-layer',
  'first',
  'roads',
  'dop',
])
const known = (id: string) => KNOWN.has(id)

/** Defaults that make each row say one thing: the input changes one of them */
function input(overrides: Partial<StartBackgroundInput>): StartBackgroundInput {
  return { url: null, stored: null, fallback: null, valid: [], best: [], known, ...overrides }
}

describe('startBackground: the start order, as iD picks it', () => {
  const rows: [string, Partial<StartBackgroundInput>, string][] = [
    [
      'the URL names a known layer: it is used, whatever the view and the best say',
      { url: 'Bing', best: ['best-layer'], valid: ['first'] },
      'Bing',
    ],
    ['the URL names none: none', { url: NONE, best: ['best-layer'] }, NONE],
    ['the URL names a custom template: it is used', { url: CUSTOM, stored: 'Bing' }, CUSTOM],
    [
      'no URL: the best layer that covers more than half of the view',
      { best: ['best-layer', 'other'], stored: 'stored-layer', valid: ['stored-layer'] },
      'best-layer',
    ],
    [
      'no URL and no best: the stored choice, when it is valid for the view',
      { stored: 'stored-layer', valid: ['first', 'stored-layer'] },
      'stored-layer',
    ],
    [
      'the stored choice is not valid for the view: the fork default',
      { stored: 'stored-layer', valid: ['first'], fallback: 'default-layer' },
      'default-layer',
    ],
    [
      'the stored choice is none: it is kept',
      { stored: NONE, valid: ['first'], fallback: 'default-layer' },
      NONE,
    ],
    [
      'the stored choice is a custom template: it is kept',
      { stored: CUSTOM, valid: ['first'] },
      CUSTOM,
    ],
    [
      'no stored choice: the fork default',
      { fallback: 'default-layer', valid: ['first'] },
      'default-layer',
    ],
    [
      'the default is not a known layer: the first valid layer',
      { fallback: 'unknown-default', valid: ['first'] },
      'first',
    ],
    ['nothing at all: none', {}, NONE],
    [
      'an unknown id in the URL: the best is not looked at (iD), the stored choice is used',
      { url: 'gone', best: ['best-layer'], stored: 'stored-layer', valid: ['stored-layer'] },
      'stored-layer',
    ],
    [
      'an unknown id in the URL, nothing stored: the default',
      { url: 'gone', fallback: 'default-layer', valid: ['first'] },
      'default-layer',
    ],
  ]
  for (const [name, overrides, expected] of rows) {
    it(name, () => {
      expect(startBackground(input(overrides))).toBe(expected)
    })
  }
})

describe('the pending value, until the start has resolved', () => {
  it('is the URL own value (none, a template), else the stored choice, else the default', () => {
    expect(pendingBackground(CUSTOM, 'Bing', 'default-layer')).toBe(CUSTOM)
    expect(pendingBackground(NONE, 'Bing', 'default-layer')).toBe(NONE)
    expect(pendingBackground('Bing', 'stored-layer', 'default-layer')).toBe('stored-layer')
    expect(pendingBackground(null, null, 'default-layer')).toBe('default-layer')
    expect(pendingBackground(null, null, null)).toBe(NONE)
  })

  it('takes the URL overlays, else the stored ones', () => {
    expect(pendingOverlays(['a'], ['b'])).toEqual(['a'])
    expect(pendingOverlays(null, ['b'])).toEqual(['b'])
  })
})

describe('the start for the overlays', () => {
  it('takes the URL overlays when it has any, else the stored ones, without ids the index does not know', () => {
    expect(startOverlays(['roads', 'gone'], ['dop'], known)).toEqual(['roads'])
    expect(startOverlays(null, ['dop', 'gone'], known)).toEqual(['dop'])
    expect(startOverlays([], ['dop'], known)).toEqual([])
  })
})

describe('what is shown once the start has resolved', () => {
  it('is the URL while it gives a value that can be shown, else the start', () => {
    expect(shownBackground('Bing', 'first', known)).toBe('Bing')
    expect(shownBackground(CUSTOM, 'first', known)).toBe(CUSTOM)
    expect(shownBackground('gone', 'first', known)).toBe('first')
    expect(shownBackground(null, 'first', known)).toBe('first')
  })

  it('is the URL overlays without the unknown ids, else the start overlays', () => {
    expect(shownOverlays(['roads', 'gone'], ['dop'], known)).toEqual(['roads'])
    expect(shownOverlays(null, ['dop'], known)).toEqual(['dop'])
  })
})

describe('sameIds', () => {
  it('compares in order, and no value is never the same as a list', () => {
    expect(sameIds(['a', 'b'], ['a', 'b'])).toBe(true)
    expect(sameIds(['a', 'b'], ['b', 'a'])).toBe(false)
    expect(sameIds(null, [])).toBe(false)
  })
})
