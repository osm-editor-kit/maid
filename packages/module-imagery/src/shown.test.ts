import { describe, expect, it } from 'bun:test'
import type { Listing, View } from './helpers.ts'
import { resolveStart, type StartInput, type StartSearch } from './shown.ts'
import { customValue, NONE } from './url.ts'

const VIEW: View = { bounds: [7.39, 48.43, 7.42, 48.44], zoom: 14 }
const TEMPLATE = customValue('https://tiles.example.org/a/{z}/{x}/{y}.png')

function layer(id: string): Listing {
  return { id, name: id, best: false, overlay: false }
}

/** The index reads, counted: the listing and the best layers (the coverage downloads) */
function search(items: Listing[]) {
  const calls = { listed: 0, best: 0 }
  const seams: StartSearch = {
    listView: async () => {
      calls.listed += 1
      return { items, series: [] }
    },
    bestBackgrounds: async () => {
      calls.best += 1
      return ['best-layer']
    },
  }
  return { calls, seams }
}

const START: StartInput = {
  url: null,
  urlOverlays: null,
  stored: null,
  storedOverlays: [],
  fallback: null,
}

describe('resolveStart: the best backgrounds are looked for only when the address names none', () => {
  it('a background in the address: the best search (the coverage downloads) is not run, and the address starts', async () => {
    const { calls, seams } = search([layer('first'), layer('best-layer')])
    const result = await resolveStart(VIEW, { ...START, url: TEMPLATE }, seams)
    expect(calls.best).toBe(0)
    expect(calls.listed).toBe(1)
    expect(result.background).toBe(TEMPLATE)
  })

  it('none in the address: the best search is not run either', async () => {
    const { calls, seams } = search([layer('first')])
    const result = await resolveStart(VIEW, { ...START, url: NONE }, seams)
    expect(calls.best).toBe(0)
    expect(result.background).toBe(NONE)
  })

  it('an unknown id in the address: the best search is not run, and the start order goes on as iD', async () => {
    const { calls, seams } = search([layer('first')])
    const result = await resolveStart(VIEW, { ...START, url: 'gone' }, seams)
    expect(calls.best).toBe(0)
    expect(result.background).toBe('first')
  })

  it('no background in the address: the best search runs and its layer starts', async () => {
    const { calls, seams } = search([layer('first'), layer('best-layer')])
    const result = await resolveStart(VIEW, START, seams)
    expect(calls.best).toBe(1)
    expect(result.background).toBe('best-layer')
  })
})
