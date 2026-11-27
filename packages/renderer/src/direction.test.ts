import { describe, expect, test } from 'bun:test'
import {
  GLYPH_BOX_HEIGHT,
  GLYPH_BOX_WIDTH,
  glyphImageId,
  glyphImageIds,
  isLightGlyph,
  isTravelled,
  lineGlyphImageId,
  parseGlyphImageId,
  ridingOf,
  SIDE_KINDS,
  sideIconSize,
  sidedOf,
  squarePadding,
} from './direction'

describe('ridingOf: the riding direction from the tags (iD isOneWay, isOneWayBackwards, isBiDirectional)', () => {
  test('oneway=yes goes along the way, -1 against it', () => {
    expect(ridingOf({ highway: 'residential', oneway: 'yes' })).toBe('with')
    expect(ridingOf({ highway: 'residential', oneway: '-1' })).toBe('against')
  })

  test('reversible and alternating go both ways, one at a time', () => {
    expect(ridingOf({ oneway: 'reversible' })).toBe('reversible')
    expect(ridingOf({ oneway: 'alternating' })).toBe('reversible')
    expect(ridingOf({ conveying: 'reversible' })).toBe('reversible')
  })

  test('a roundabout, a motorway and a waterway are one-way without a oneway tag, as in iD', () => {
    expect(ridingOf({ junction: 'roundabout' })).toBe('with')
    expect(ridingOf({ junction: 'circular' })).toBe('with')
    expect(ridingOf({ highway: 'motorway' })).toBe('with')
    expect(ridingOf({ waterway: 'stream' })).toBe('with')
  })

  test('conveying=forward and backward', () => {
    expect(ridingOf({ man_made: 'goods_conveyor', conveying: 'forward' })).toBe('with')
    expect(ridingOf({ conveying: 'backward' })).toBe('against')
  })

  test('oneway=no on a way that is one-way by default says two-way out loud', () => {
    expect(ridingOf({ junction: 'roundabout', oneway: 'no' })).toBe('both')
    expect(ridingOf({ highway: 'motorway', oneway: 'no' })).toBe('both')
  })

  test('an ordinary two-way line has no glyph of its own (it shows `both` on hover and selection)', () => {
    expect(ridingOf({ highway: 'residential' })).toBeUndefined()
    expect(ridingOf({ highway: 'residential', oneway: 'no' })).toBeUndefined()
    expect(ridingOf({})).toBeUndefined()
  })

  test("oneway:bicycle=no on a one-way road adds the bicycles' way back", () => {
    expect(ridingOf({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no' })).toBe(
      'contraflow',
    )
    expect(ridingOf({ highway: 'residential', oneway: '-1', 'oneway:bicycle': 'no' })).toBe(
      'contraflow-against',
    )
  })

  test('oneway:bicycle makes a two-way path one way for bicycles, off highway=cycleway only', () => {
    const path = { highway: 'path', bicycle: 'designated', foot: 'designated' }
    expect(ridingOf({ ...path, 'oneway:bicycle': 'yes' })).toBe('bike-with')
    expect(ridingOf({ ...path, oneway: 'no', 'oneway:bicycle': '-1' })).toBe('bike-against')
    // on a cycleway, oneway is the cyclists' own: oneway:bicycle says nothing more
    expect(ridingOf({ highway: 'cycleway', 'oneway:bicycle': 'yes' })).toBeUndefined()
    expect(ridingOf({ highway: 'cycleway', oneway: 'yes', 'oneway:bicycle': 'no' })).toBe('with')
  })

  test('cycleway=opposite* is lane tagging and gives no centerline glyph', () => {
    expect(ridingOf({ highway: 'residential', oneway: 'yes', cycleway: 'opposite_lane' })).toBe(
      'with',
    )
  })

  test('a value that is only a prototype property is not a direction', () => {
    expect(ridingOf({ oneway: 'constructor' })).toBeUndefined()
    expect(ridingOf({ highway: 'toString' })).toBeUndefined()
  })
})

describe('isTravelled and isLightGlyph', () => {
  test('roads, paths, rail and ferries are travelled; a fence is not', () => {
    expect(isTravelled({ highway: 'footway' })).toBe(true)
    expect(isTravelled({ railway: 'tram' })).toBe(true)
    expect(isTravelled({ route: 'ferry' })).toBe(true)
    expect(isTravelled({ barrier: 'fence' })).toBe(false)
  })

  test('light glyphs where iD draws white or grey arrows', () => {
    expect(isLightGlyph({ highway: 'construction', bridge: 'yes' })).toBe(true)
    expect(isLightGlyph({ aeroway: 'runway' })).toBe(true)
    expect(isLightGlyph({ highway: 'pedestrian', oneway: 'yes' })).toBe(true)
    expect(isLightGlyph({ railway: 'rail', oneway: 'yes' })).toBe(true)
    expect(isLightGlyph({ railway: 'rail', highway: 'road' })).toBe(false)
    expect(isLightGlyph({ highway: 'residential', oneway: 'yes' })).toBe(false)
  })
})

describe('sidedOf (iD isSided, sidednessIdentifier)', () => {
  test('cliffs, walls and kerbs are sided', () => {
    expect(sidedOf({ natural: 'cliff' })).toBe('natural')
    expect(sidedOf({ barrier: 'retaining_wall' })).toBe('barrier')
    expect(sidedOf({ barrier: 'kerb' })).toBe('barrier')
  })

  test('coastline and guard rail have their own kinds', () => {
    expect(sidedOf({ natural: 'coastline' })).toBe('coastline')
    expect(sidedOf({ barrier: 'guard_rail' })).toBe('guard_rail')
  })

  test('embankment and cutting sides', () => {
    expect(sidedOf({ embankment: 'left' })).toBe('embankment-left')
    expect(sidedOf({ embankment: 'yes' })).toBe('embankment')
    expect(sidedOf({ cutting: 'right' })).toBe('cutting-right')
    expect(sidedOf({ man_made: 'embankment' })).toBe('embankment-man_made')
  })

  test('two_sided=yes is not sided', () => {
    expect(sidedOf({ barrier: 'kerb', two_sided: 'yes' })).toBeUndefined()
  })

  test('ordinary lines are not sided', () => {
    expect(sidedOf({ highway: 'residential' })).toBeUndefined()
    expect(sidedOf({ natural: 'water' })).toBeUndefined()
  })

  test('every kind it can return has an image', () => {
    const tags: Record<string, string>[] = [
      { natural: 'cliff' },
      { natural: 'coastline' },
      { barrier: 'guard_rail' },
      { man_made: 'embankment' },
      { man_made: 'quay' },
      { waterway: 'weir' },
      { cutting: 'yes' },
      { cutting: 'left' },
      { cutting: 'right' },
      { embankment: 'yes' },
      { embankment: 'left' },
      { embankment: 'right' },
    ]
    for (const t of tags) {
      const kind = sidedOf(t)
      expect(kind).toBeDefined()
      expect(SIDE_KINDS[kind!]).toBeDefined()
    }
  })
})

describe('lifecycle prefixes on sided keys (iD sidednessIdentifier)', () => {
  test('a disused or construction barrier is sided as its plain key', () => {
    expect(sidedOf({ 'disused:barrier': 'kerb' })).toBe('barrier')
    expect(sidedOf({ 'construction:natural': 'cliff' })).toBe('natural')
  })

  test('a prefix that is not a lifecycle prefix is not stripped', () => {
    expect(sidedOf({ 'foo:barrier': 'kerb' })).toBeUndefined()
  })
})

describe('the collision boxes of the markers', () => {
  test("a glyph's box is a square, so it holds the glyph at every angle", () => {
    const [top, right, bottom, left] = squarePadding(GLYPH_BOX_WIDTH, GLYPH_BOX_HEIGHT)
    expect(GLYPH_BOX_WIDTH + left + right).toBe(GLYPH_BOX_HEIGHT + top + bottom)
  })

  test('an icon is one marker long and reaches as far as the marker on both sides of the line', () => {
    // a cliff's triangle: 1 unit (4.5 px) off the line at its apex, 2 units long
    expect(sideIconSize(SIDE_KINDS.natural!)).toEqual({ width: 10, height: 10 })
    // a barrier's: from 1 to 2 units off the line
    expect(sideIconSize(SIDE_KINDS.barrier!)).toEqual({ width: 10, height: 19 })
  })
})

describe('glyph images', () => {
  test('ids name the kind, the state and the tone, and parse back', () => {
    expect(glyphImageId('against', 'rest')).toBe('maid-glyph-against-rest-ink')
    expect(glyphImageId('contraflow-against', 'active', 'light')).toBe(
      'maid-glyph-contraflow-against-active-light',
    )
    expect(parseGlyphImageId('maid-glyph-contraflow-against-active-light')).toEqual({
      kind: 'contraflow-against',
      state: 'active',
      tone: 'light',
    })
    expect(parseGlyphImageId('maid-glyph-sideways-rest-ink')).toBeUndefined()
    expect(parseGlyphImageId('maid-glyph-with-asleep-ink')).toBeUndefined()
  })

  test('every image is built ahead; the drawing triangle has no rest state', () => {
    const ids = glyphImageIds()
    expect(ids).toContain('maid-glyph-drawn-active-ink')
    expect(ids).not.toContain('maid-glyph-drawn-rest-ink')
    for (const id of ids) expect(parseGlyphImageId(id)).toBeDefined()
  })

  test('the line glyphs of a module', () => {
    expect(lineGlyphImageId('missing')).toBe('maid-line-glyph-missing')
  })
})
