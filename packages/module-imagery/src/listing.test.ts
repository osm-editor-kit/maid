import { describe, expect, test } from 'bun:test'
import { listingView, type View } from './helpers.ts'

const view = (bounds: View['bounds'], zoom: number): View => ({ bounds, zoom })

describe('listingView: the key of the layer listing', () => {
  test('a pan of a few pixels at zoom 16 gives the same key', () => {
    const a = listingView(view([13.4001, 52.5001, 13.4101, 52.5071], 16.02))
    const b = listingView(view([13.40015, 52.50012, 13.41015, 52.50712], 16.04))
    expect(b).toEqual(a)
  })

  test('the box is rounded outward, so it still covers the view', () => {
    const exact: View['bounds'] = [13.4001, 52.5001, 13.4101, 52.5071]
    const [west, south, east, north] = listingView(view(exact, 16)).bounds
    expect(west).toBeLessThanOrEqual(exact[0])
    expect(south).toBeLessThanOrEqual(exact[1])
    expect(east).toBeGreaterThanOrEqual(exact[2])
    expect(north).toBeGreaterThanOrEqual(exact[3])
  })

  test('the zoom goes down to a tenth, and an exact tenth stays', () => {
    expect(listingView(view([0, 0, 1, 1], 16.07)).zoom).toBe(16)
    expect(listingView(view([0, 0, 1, 1], 16.1)).zoom).toBeCloseTo(16.1, 10)
  })
})
