import { describe, expect, test } from 'bun:test'
import type { Bbox } from '@osm-editor-kit/street-imagery'
import { SNAP_ZOOM, snapBboxToTiles } from './snap.ts'

/** The tile range a box touches at `zoom`, with the package's rule (the east and south edge included) */
function tileRange(bbox: Bbox, zoom: number) {
  const tileX = (lon: number) => Math.floor(((lon + 180) / 360) * 2 ** zoom)
  const tileY = (lat: number) => {
    const rad = (lat * Math.PI) / 180
    return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom)
  }
  const [west, south, east, north] = bbox
  return { minX: tileX(west), maxX: tileX(east), minY: tileY(north), maxY: tileY(south) }
}

/** A box shrunk by `margin` on every side: a view that lies inside the box */
const inside = (bbox: Bbox, margin: number): Bbox => [
  bbox[0] + margin,
  bbox[1] + margin,
  bbox[2] - margin,
  bbox[3] - margin,
]

const BERLIN_VIEW: Bbox = [13.4, 52.5, 13.43, 52.52]

describe('snapBboxToTiles', () => {
  test('the snapped box covers the view', () => {
    const [west, south, east, north] = snapBboxToTiles(BERLIN_VIEW)
    expect(west).toBeLessThanOrEqual(BERLIN_VIEW[0])
    expect(south).toBeLessThanOrEqual(BERLIN_VIEW[1])
    expect(east).toBeGreaterThanOrEqual(BERLIN_VIEW[2])
    expect(north).toBeGreaterThanOrEqual(BERLIN_VIEW[3])
  })

  test('the snapped box touches the same tiles as the view', () => {
    expect(tileRange(snapBboxToTiles(BERLIN_VIEW), SNAP_ZOOM)).toEqual(
      tileRange(BERLIN_VIEW, SNAP_ZOOM),
    )
  })

  test('a view inside one snapped box gives that same box, so the same key', () => {
    const snapped = snapBboxToTiles(BERLIN_VIEW)
    expect(snapBboxToTiles(inside(snapped, 1e-4))).toEqual(snapped)
  })

  test('snapping a snapped box changes nothing', () => {
    const snapped = snapBboxToTiles(BERLIN_VIEW)
    expect(snapBboxToTiles(snapped)).toEqual(snapped)
  })

  test('a view one tile away gives another box', () => {
    const tileWidth = 360 / 2 ** SNAP_ZOOM
    const moved: Bbox = [
      BERLIN_VIEW[0] + 2 * tileWidth,
      BERLIN_VIEW[1],
      BERLIN_VIEW[2] + 2 * tileWidth,
      BERLIN_VIEW[3],
    ]
    expect(snapBboxToTiles(moved)).not.toEqual(snapBboxToTiles(BERLIN_VIEW))
  })

  test('the whole world stays inside the Mercator range and the tile grid', () => {
    const world = snapBboxToTiles([-180, -90, 180, 90])
    expect(world[0]).toBeCloseTo(-180, 5)
    expect(world[2]).toBeCloseTo(180, 5)
    expect(world[1]).toBeCloseTo(-85.0511, 3)
    expect(world[3]).toBeCloseTo(85.0511, 3)
  })

  test('a zero-size box still gives one tile', () => {
    const point = snapBboxToTiles([13.4, 52.5, 13.4, 52.5])
    const range = tileRange(point, SNAP_ZOOM)
    expect(range.maxX).toBe(range.minX)
    expect(range.maxY).toBe(range.minY)
  })
})
