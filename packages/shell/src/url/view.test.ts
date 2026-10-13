import { describe, expect, test } from 'bun:test'
import type { Camera } from './params.ts'
import { moveSource, shouldStoreMove, startCamera } from './view.ts'

const FALLBACK: Camera = { zoom: 17, lat: 52.389, lng: 13.4 }
const LINK: Camera = { zoom: 15.5, lat: 50.1, lng: 8.6 }
const STORED: Camera = { zoom: 12, lat: 48.1, lng: 11.5 }

describe('startCamera: the URL, else the last position, else the fallback', () => {
  test('the URL names the position: it wins over the stored one and the fallback', () => {
    expect(startCamera({ url: LINK, stored: STORED, fallback: FALLBACK })).toEqual(LINK)
  })

  test('without a URL the last position holds', () => {
    expect(startCamera({ url: null, stored: STORED, fallback: FALLBACK })).toEqual(STORED)
    expect(startCamera({ url: undefined, stored: STORED, fallback: FALLBACK })).toEqual(STORED)
  })

  test('with neither the fallback holds', () => {
    expect(startCamera({ url: null, stored: undefined, fallback: FALLBACK })).toEqual(FALLBACK)
  })

  test('a stored position keeps its turn; a link without one starts north-up', () => {
    const turned: Camera = { ...STORED, bearing: -37.5 }
    expect(startCamera({ url: null, stored: turned, fallback: FALLBACK })).toEqual(turned)
    expect(startCamera({ url: LINK, stored: turned, fallback: FALLBACK })).toEqual(LINK)
  })
})

describe('moveSource: what moved the map', () => {
  test('before the map loaded every move is the start camera, whatever caused it', () => {
    expect(moveSource({ loaded: false, gesture: false, resized: false })).toBe('start')
    expect(moveSource({ loaded: false, gesture: true, resized: false })).toBe('start')
  })

  test('a gesture is the person', () => {
    expect(moveSource({ loaded: true, gesture: true, resized: false })).toBe('gesture')
  })

  test("a move without a gesture after load is the app on the person's behalf, unless the canvas was resized", () => {
    expect(moveSource({ loaded: true, gesture: false, resized: false })).toBe('action')
    expect(moveSource({ loaded: true, gesture: false, resized: true })).toBe('resize')
  })

  test('a gesture is still a gesture when a resize was seen just before it', () => {
    expect(moveSource({ loaded: true, gesture: true, resized: true })).toBe('gesture')
  })
})

describe('shouldStoreMove: the moves that become the last position', () => {
  test('the person moves the map: stored', () => {
    expect(shouldStoreMove('gesture')).toBe(true)
    expect(shouldStoreMove('action')).toBe(true)
  })

  test('the start camera, a link included, and a resize are not stored', () => {
    expect(shouldStoreMove('start')).toBe(false)
    expect(shouldStoreMove('resize')).toBe(false)
  })

  test('the first move of the person after a link is stored', () => {
    // the link's position is the start camera: not stored; the person's move after it is
    const start = moveSource({ loaded: false, gesture: false, resized: false })
    const first = moveSource({ loaded: true, gesture: true, resized: false })
    expect([shouldStoreMove(start), shouldStoreMove(first)]).toEqual([false, true])
  })
})
