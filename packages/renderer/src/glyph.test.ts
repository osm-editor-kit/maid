import { describe, expect, test } from 'bun:test'
import { GLYPH_BLUE, GLYPH_HEIGHT, GLYPH_INK, GLYPH_KINDS, glyphPaths, glyphWidth } from './glyph'

/** The x and y of every point of a path (M and L only; a dot's arcs are left out) */
function points(d: string) {
  return [...d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)].map((match) => [
    Number(match[1]),
    Number(match[2]),
  ])
}

describe('glyph geometry (ADR 0021)', () => {
  test('every glyph is 8 px high and centred on the line', () => {
    for (const kind of GLYPH_KINDS) {
      for (const state of ['rest', 'active'] as const) {
        const ys = glyphPaths(kind, state).flatMap((path) => points(path.d).map(([, y]) => y!))
        expect(Math.max(...ys)).toBeLessThanOrEqual(GLYPH_HEIGHT / 2)
        expect(Math.min(...ys)).toBeGreaterThanOrEqual(-GLYPH_HEIGHT / 2)
      }
    }
  })

  test('every glyph is centred along the line', () => {
    // a dot's arcs are not points: `missing` is left out
    for (const kind of GLYPH_KINDS.filter((kind) => kind !== 'missing')) {
      const xs = glyphPaths(kind, 'active').flatMap((path) => points(path.d).map(([x]) => x!))
      expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThan(0.6)
    }
  })

  test('the rest state is the riding direction alone: one part fewer, the drawing triangle', () => {
    expect(glyphPaths('with', 'active')).toHaveLength(2)
    expect(glyphPaths('with', 'rest')).toHaveLength(1)
    expect(glyphPaths('both', 'rest')).toHaveLength(2)
    expect(glyphWidth('with', 'rest')).toBeLessThan(glyphWidth('with', 'active'))
  })

  test('two-way and reversible keep the same gap: backs apart, tips apart', () => {
    const [left, right] = glyphPaths('both', 'rest').map((path) => points(path.d).map(([x]) => x!))
    const [first, second] = glyphPaths('reversible', 'rest').map((path) =>
      points(path.d).map(([x]) => x!),
    )
    const backs = Math.min(...right!) - Math.max(...left!)
    const tips = Math.min(...second!) - Math.max(...first!)
    expect(backs).toBeCloseTo(2, 5)
    expect(tips).toBeCloseTo(2, 5)
  })

  test('colour says who: ink for all traffic, blue for bicycles', () => {
    expect(glyphPaths('contraflow', 'rest').map((path) => path.fill)).toEqual([
      GLYPH_INK,
      GLYPH_BLUE,
    ])
    expect(glyphPaths('bike-with', 'active').map((path) => path.fill)).toEqual([
      GLYPH_INK,
      GLYPH_BLUE,
    ])
    expect(glyphPaths('with', 'rest', 'light')[0]!.fill).toBe('#ffffff')
  })
})
