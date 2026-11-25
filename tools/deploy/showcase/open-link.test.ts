import { describe, expect, it } from 'bun:test'
import { runInNewContext } from 'node:vm'
import { openLink } from './open-link.ts'

const DEFAULTS = 'map=18/52.52190/13.41000&lens=surface'

describe('openLink', () => {
  it("keeps the button's own place without parameters", () => {
    expect(openLink('maid', DEFAULTS, '', '')).toBe('maid/?map=18/52.52190/13.41000&lens=surface')
  })

  it("takes Maid's query: the place replaces the button's, other settings stay", () => {
    expect(openLink('maid', DEFAULTS, '?map=17/52.5/13.4&id=w1,n2', '')).toBe(
      'maid/?lens=surface&map=17/52.5/13.4&id=w1,n2',
    )
  })

  it("passes iD's hash on as a hash and drops the button's place", () => {
    expect(openLink('maid-bicycle', DEFAULTS, '', '#map=17/52.5/13.4&id=w1')).toBe(
      'maid-bicycle/?lens=surface#map=17/52.5/13.4&id=w1',
    )
  })

  it("drops the button's selected feature when the link gives only a feature", () => {
    expect(openLink('maid', 'map=19/52.4/13.4&id=w585753318', '?id=r7', '')).toBe('maid/?id=r7')
  })

  it('lets the link override a setting of the button', () => {
    expect(openLink('maid', DEFAULTS, '?lens=width', '')).toBe(
      'maid/?map=18/52.52190/13.41000&lens=width',
    )
  })

  it("ignores the page's own anchors", () => {
    expect(openLink('maid', DEFAULTS, '', '#editors')).toBe(
      'maid/?map=18/52.52190/13.41000&lens=surface',
    )
  })

  it('carries other parameters, encoded', () => {
    expect(openLink('maid', '', '', '#map=17/1/2&comment=Fix%20paths&hashtags=%23maid')).toBe(
      'maid/?#map=17/1/2&comment=Fix+paths&hashtags=%23maid',
    )
  })

  it('survives being inlined into the page with toString()', () => {
    // a context with nothing but URLSearchParams: the function may use nothing from this module
    const inlined = runInNewContext(`(${openLink.toString()})`, {
      URLSearchParams,
    }) as typeof openLink
    expect(inlined('maid', DEFAULTS, '?map=1/2/3', '')).toBe('maid/?lens=surface&map=1/2/3')
  })
})
