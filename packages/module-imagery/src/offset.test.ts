import { describe, expect, it } from 'bun:test'
import {
  bbox3857,
  formatOffset,
  isZeroOffset,
  metersToUnits,
  NO_OFFSET,
  NUDGES,
  nudgeOffset,
  placements,
  quadkey,
  readOffset,
  readShiftedTileUrl,
  roundMeters,
  shiftedTileUrl,
  shiftOf,
  tileAt,
  tileUrl,
  unitsToMeters,
} from './offset.ts'

/** iD's zoom-0 pixel at the equator, in meters: 2 * pi * 6378137 / 256 (the Web Mercator resolution at zoom 0) */
const METERS_PER_PIXEL_AT_ZOOM_0 = 156543.03392

describe("meters and iD's stored offset", () => {
  it('has one zoom-0 pixel of the equator as 156 543.03 m', () => {
    const [east] = unitsToMeters([1, 0])
    expect(east).toBeCloseTo(METERS_PER_PIXEL_AT_ZOOM_0, 2)
  })

  it('makes east positive in x, and north positive in negative y (iD flips the y axis)', () => {
    const [x, y] = metersToUnits([METERS_PER_PIXEL_AT_ZOOM_0, METERS_PER_PIXEL_AT_ZOOM_0])
    expect(x).toBeCloseTo(1, 6)
    expect(y).toBeCloseTo(-1 * (6378137 / 6356752.3142), 6)
  })

  it('converts back to the same meters', () => {
    const meters: [number, number] = [-1234.5, 678.9]
    const [east, north] = unitsToMeters(metersToUnits(meters))
    expect(east).toBeCloseTo(-1234.5, 6)
    expect(north).toBeCloseTo(678.9, 6)
  })

  it('rounds to two decimals and never keeps a negative zero', () => {
    expect(roundMeters(1.2345)).toBe(1.23)
    expect(roundMeters(-0.001)).toBe(0)
    expect(Object.is(roundMeters(-0.001), -0)).toBe(false)
    expect(isZeroOffset([roundMeters(-0.001), 0])).toBe(true)
  })

  it('formats the panel text as iD does: east, north', () => {
    expect(formatOffset([1.5, -2])).toBe('1.5, -2')
    expect(formatOffset(NO_OFFSET)).toBe('0, 0')
  })
})

describe('readOffset (the panel text)', () => {
  it('reads two numbers, with a comma or a semicolon, and rounds them', () => {
    expect(readOffset('1.234, -5')).toEqual([1.23, -5])
    expect(readOffset('1;2')).toEqual([1, 2])
    expect(readOffset('1e3,0')).toEqual([1000, 0])
  })

  it('reads nothing usable as null: a blank part, one number, three numbers, a word', () => {
    expect(readOffset('')).toBeNull()
    expect(readOffset('1')).toBeNull()
    expect(readOffset('1,')).toBeNull()
    expect(readOffset(',1')).toBeNull()
    expect(readOffset('1,2,3')).toBeNull()
    expect(readOffset('east,2')).toBeNull()
  })
})

describe('nudgeOffset', () => {
  it('moves by half a screen pixel at zoom 0, which is half a zoom-0 pixel of meters', () => {
    const [east] = nudgeOffset(NO_OFFSET, NUDGES.right, 0) ?? [NaN, NaN]
    expect(east).toBeCloseTo(METERS_PER_PIXEL_AT_ZOOM_0 / 2, 1)
  })

  it('divides the step by 2^zoom: the same screen step is less ground at a higher zoom', () => {
    const at0 = nudgeOffset(NO_OFFSET, NUDGES.up, 0)
    const at10 = nudgeOffset(NO_OFFSET, NUDGES.up, 10)
    expect(at0).not.toBeNull()
    expect(at10).not.toBeNull()
    expect((at0?.[1] ?? 0) / (at10?.[1] ?? 1)).toBeCloseTo(1024, 0)
  })

  it('moves the imagery north on "up" and east on "right"', () => {
    const up = nudgeOffset(NO_OFFSET, NUDGES.up, 5)
    expect(up?.[0]).toBe(0)
    expect(up?.[1]).toBeGreaterThan(0)
    const right = nudgeOffset(NO_OFFSET, NUDGES.right, 5)
    expect(right?.[0]).toBeGreaterThan(0)
    expect(right?.[1]).toBe(0)
  })

  it('returns null when the nudge brings the offset back to zero', () => {
    const one = nudgeOffset(NO_OFFSET, NUDGES.right, 0)
    expect(one).not.toBeNull()
    expect(nudgeOffset(one ?? NO_OFFSET, NUDGES.left, 0)).toBeNull()
  })
})

describe('shiftOf: the shift of a tile in its own pixels', () => {
  it("is offset * 2^z for a 256 px tile (iD's pixel offset)", () => {
    expect(shiftOf([1, -2], 10, 256)).toEqual([1024, -2048])
  })

  it('doubles for a 512 px tile, which covers the same ground', () => {
    expect(shiftOf([1, 0], 10, 512)).toEqual([2048, 0])
  })
})

/**
 * The property the placements must keep: an output pixel u shows the source at u - shift, so the source tile that
 * holds it is floor((u - shift) / size), and exactly one placement of that tile covers u.
 */
function checkCovers(shift: [number, number], size: number) {
  for (let u = 0; u < size; u += 7) {
    const source = Math.floor((u - shift[0]) / size)
    const covering = placements(shift, size).filter(
      (place) => place.dx === source && place.x <= u && u < place.x + size,
    )
    expect(covering.length).toBe(1)
  }
}

describe('placements: which source tiles are drawn, and where', () => {
  it('draws the tile itself, once, when there is no shift', () => {
    expect(placements([0, 0], 256)).toEqual([{ dx: 0, dy: 0, x: 0, y: 0 }])
  })

  it('draws the tile to the left and the tile itself for a shift to the right of a quarter', () => {
    const found = placements([64, 0], 256)
    expect(found).toEqual([
      { dx: -1, dy: 0, x: -192, y: 0 },
      { dx: 0, dy: 0, x: 64, y: 0 },
    ])
  })

  it('draws one whole tile, moved, for a shift of exactly one tile', () => {
    expect(placements([256, 0], 256)).toEqual([{ dx: -1, dy: 0, x: 0, y: 0 }])
  })

  it('draws at most four tiles, two per axis', () => {
    const found = placements([100.5, 30.25], 256)
    expect(found.length).toBe(4)
    expect(new Set(found.map((place) => `${place.dx},${place.dy}`))).toEqual(
      new Set(['-1,-1', '-1,0', '0,-1', '0,0']),
    )
  })

  it('covers every output pixel from the right source tile, for many shifts (positive and negative)', () => {
    for (let shift = -2.7; shift <= 2.7; shift += 0.37) {
      // one axis at a time: with a shift on both, each column has two rows and the count is not one
      checkCovers([shift * 256, 0], 256)
      checkCovers([shift * 512, 0], 512)
    }
  })

  it('covers every row too, with the shift on the other axis', () => {
    for (let shift = -2.7; shift <= 2.7; shift += 0.37) {
      for (let v = 0; v < 256; v += 7) {
        const source = Math.floor((v - shift * 256) / 256)
        const covering = placements([0, shift * 256], 256).filter(
          (place) => place.dy === source && place.y <= v && v < place.y + 256,
        )
        expect(covering.length).toBe(1)
      }
    }
  })
})

describe('tileAt', () => {
  it('moves to a neighbour tile, and wraps x around the world', () => {
    expect(tileAt({ z: 2, x: 0, y: 1 }, -1, 0)).toEqual({ z: 2, x: 3, y: 1 })
    expect(tileAt({ z: 2, x: 3, y: 1 }, 1, 0)).toEqual({ z: 2, x: 0, y: 1 })
  })

  it('has no tile above or below the world', () => {
    expect(tileAt({ z: 2, x: 1, y: 0 }, 0, -1)).toBeNull()
    expect(tileAt({ z: 2, x: 1, y: 3 }, 0, 1)).toBeNull()
  })
})

describe('tile URLs from a template', () => {
  it('fills z, x and y', () => {
    expect(tileUrl('https://t.example/{z}/{x}/{y}.png', { z: 3, x: 5, y: 2 }, false)).toBe(
      'https://t.example/3/5/2.png',
    )
  })

  it('counts the row from the south for a tms source', () => {
    // 2^3 - 1 - 2 = 5
    expect(tileUrl('https://t.example/{z}/{x}/{y}.png', { z: 3, x: 5, y: 2 }, true)).toBe(
      'https://t.example/3/5/5.png',
    )
  })

  it('has the Bing quadkey, as MapLibre does', () => {
    expect(quadkey({ z: 0, x: 0, y: 0 })).toBe('')
    expect(quadkey({ z: 1, x: 1, y: 0 })).toBe('1')
    expect(quadkey({ z: 3, x: 3, y: 5 })).toBe('213')
  })

  it('has the EPSG:3857 bounds of a tile, as MapLibre does', () => {
    const [minX, minY, maxX, maxY] = bbox3857({ z: 0, x: 0, y: 0 }).split(',').map(Number)
    expect(minX).toBeCloseTo(-20037508.342789244, 4)
    expect(maxX).toBeCloseTo(20037508.342789244, 4)
    expect(minY).toBeCloseTo(-20037508.342789244, 4)
    expect(maxY).toBeCloseTo(20037508.342789244, 4)
    // the tile to the east of the origin tile starts where this one ends
    const [eastMinX] = bbox3857({ z: 1, x: 1, y: 0 }).split(',').map(Number)
    expect(eastMinX).toBeCloseTo(0, 4)
  })

  it('fills the quadkey and the bbox tokens too', () => {
    const url = tileUrl('https://t/{quadkey}/{bbox-epsg-3857}', { z: 1, x: 1, y: 0 }, false)
    expect(url).toBe(`https://t/1/${bbox3857({ z: 1, x: 1, y: 0 })}`)
  })
})

describe('shifted tile URLs', () => {
  const template = 'https://tiles.example.org/{z}/{x}/{y}.png?key=a b&style=2&size={width}'
  const source = {
    template,
    units: [1.5, -0.25] as [number, number],
    tileSize: 512,
    tms: true,
    key: 'bg',
  }

  /** What MapLibre makes of the wrapped URL: it fills z, x and y in the text, and nothing else */
  function filledBy(url: string, z: number, x: number, y: number) {
    return url.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))
  }

  it('fills only the address, and keeps the template encoded so that its braces are left alone', () => {
    const url = shiftedTileUrl(source)
    expect(url.startsWith('maid-offset://tile/{z}/{x}/{y}?')).toBe(true)
    expect(url).not.toContain('{width}')
    expect(url).not.toContain('{y}.png')
  })

  it('reads back the tile, the template and the shift, once MapLibre has filled the address', () => {
    const read = readShiftedTileUrl(filledBy(shiftedTileUrl(source), 4, 9, 6))
    expect(read).toEqual({
      tile: { z: 4, x: 9, y: 6 },
      source: { template, units: [1.5, -0.25], tileSize: 512, tms: true, key: 'bg' },
    })
  })

  it('reads a background key with a template in it, and a template with a plus sign', () => {
    const key = 'custom:https://a.example/{z}/{x}/{y}.png?a=1+2'
    const read = readShiftedTileUrl(
      filledBy(
        shiftedTileUrl({ ...source, key, template: 'https://a/{z}/{x}/{y}?p=1+2' }),
        1,
        0,
        0,
      ),
    )
    expect(read?.source.key).toBe(key)
    expect(read?.source.template).toBe('https://a/{z}/{x}/{y}?p=1+2')
  })

  it('reads nothing that is not a shifted tile: another URL, a missing part, an address out of range', () => {
    expect(readShiftedTileUrl('https://tiles.example.org/1/2/3.png')).toBeNull()
    expect(readShiftedTileUrl('maid-offset://tile/1/2/3')).toBeNull()
    expect(readShiftedTileUrl('maid-offset://tile/{z}/{x}/{y}?src=x')).toBeNull()
    expect(readShiftedTileUrl(filledBy(shiftedTileUrl(source), 1, 2, 0))).toBeNull()
    expect(
      readShiftedTileUrl(filledBy(shiftedTileUrl(source), 2, 0, 0).replace('size=512', 'size=0')),
    ).toBeNull()
  })
})
