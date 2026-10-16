import { describe, expect, test } from 'bun:test'
import { type Loc, MIN_DEPTH_PX, rectangleCorners, screenDepth } from './rectangle'

// Reference Mercator, written apart from rectangle.ts on purpose: a bug in one shows up against the other.
const R = 6378137
type Pt = { x: number; y: number }

function toMerc(loc: Loc): Pt {
  return {
    x: (R * loc[0] * Math.PI) / 180,
    y: R * Math.log(Math.tan(Math.PI / 4 + (loc[1] * Math.PI) / 360)),
  }
}

function fromMerc(p: Pt): Loc {
  return [
    (p.x / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(p.y / R)) - Math.PI / 2) * (180 / Math.PI),
  ]
}

/** Seeded PRNG (mulberry32), so random cases repeat. */
function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Random wall A-B (50 to 300 m) and C 20 to 200 m off the wall, on either side, anywhere along it. */
function randomCase(next: () => number, origin: Pt): { a: Pt; b: Pt; c: Pt } {
  const len = 50 + next() * 250
  const ang = next() * 2 * Math.PI
  const ux = Math.cos(ang)
  const uy = Math.sin(ang)
  const a = { x: origin.x + (next() - 0.5) * 2000, y: origin.y + (next() - 0.5) * 2000 }
  const b = { x: a.x + len * ux, y: a.y + len * uy }
  const along = (next() * 3 - 1) * len
  const off = (20 + next() * 180) * (next() < 0.5 ? -1 : 1)
  const c = { x: a.x + ux * along - uy * off, y: a.y + uy * along + ux * off }
  return { a, b, c }
}

/** |cos| of the angle at q between p and r: near 0 for a right angle, and equal to the deviation in radians. */
function cosAt(p: Pt, q: Pt, r: Pt): number {
  const ux = p.x - q.x
  const uy = p.y - q.y
  const vx = r.x - q.x
  const vy = r.y - q.y
  return Math.abs(ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
}

function dist(p: Pt, q: Pt): number {
  return Math.hypot(p.x - q.x, p.y - q.y)
}

function must<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a rectangle')
  return value
}

const BERLIN = toMerc([13.4, 52.5])

/** Point at (dx, dy) metres from origin, as lon/lat. */
function at(origin: Pt, dx: number, dy: number): Loc {
  return fromMerc({ x: origin.x + dx, y: origin.y + dy })
}

function expectAt(actual: Loc, origin: Pt, dx: number, dy: number): void {
  expect(dist(toMerc(actual), { x: origin.x + dx, y: origin.y + dy })).toBeLessThan(1e-6)
}

describe('rectangleCorners', () => {
  test('C on the left of A to B: D and E are depth metres to the left, ring A, B, E, D', () => {
    // Section 6.1 of the research writes D=(10,4), E=(0,4); that swaps D and E and makes the ring cross itself.
    // The formula D = A + n·depth, E = B + n·depth from section 3 is used here.
    const r = must(rectangleCorners(at(BERLIN, 0, 0), at(BERLIN, 10, 0), at(BERLIN, 5, 4)))
    expect(r.depth).toBeCloseTo(4, 6)
    expectAt(r.d, BERLIN, 0, 4)
    expectAt(r.e, BERLIN, 10, 4)
  })

  test('C on the other side gives corners on that side, with a negative depth', () => {
    const r = must(rectangleCorners(at(BERLIN, 0, 0), at(BERLIN, 10, 0), at(BERLIN, 5, -4)))
    expect(r.depth).toBeCloseTo(-4, 6)
    expectAt(r.d, BERLIN, 0, -4)
    expectAt(r.e, BERLIN, 10, -4)
  })

  test('C moved along the wall gives the same corners', () => {
    const base = must(rectangleCorners(at(BERLIN, 0, 0), at(BERLIN, 10, 0), at(BERLIN, 5, 4)))
    for (const c of [at(BERLIN, 20, 4), at(BERLIN, -7, 4), at(BERLIN, 5, 4)]) {
      const r = must(rectangleCorners(at(BERLIN, 0, 0), at(BERLIN, 10, 0), c))
      expect(r.depth).toBeCloseTo(base.depth, 6)
      expect(dist(toMerc(r.d), toMerc(base.d))).toBeLessThan(1e-6)
      expect(dist(toMerc(r.e), toMerc(base.e))).toBeLessThan(1e-6)
    }
  })

  test('undefined when A equals B', () => {
    expect(rectangleCorners(at(BERLIN, 3, 3), at(BERLIN, 3, 3), at(BERLIN, 5, 4))).toBeUndefined()
  })

  test('undefined when C is on the wall (depth 0), on the segment or beyond it', () => {
    // Equator: all points share one latitude, so the depth is exactly zero.
    const a: Loc = [13.4, 0]
    const b: Loc = [13.5, 0]
    expect(rectangleCorners(a, b, [13.45, 0])).toBeUndefined()
    expect(rectangleCorners(a, b, [13.6, 0])).toBeUndefined()
  })

  test('minDepthMetres refuses shallow depths and keeps deeper ones', () => {
    const a = at(BERLIN, 0, 0)
    const b = at(BERLIN, 10, 0)
    const c = at(BERLIN, 5, 4)
    expect(rectangleCorners(a, b, c, 4.5)).toBeUndefined()
    expect(rectangleCorners(a, b, c, 3.5)).toBeDefined()
  })

  test('works near the equator', () => {
    const origin = toMerc([13.4, 0])
    const r = must(rectangleCorners(at(origin, 0, 0), at(origin, 10, 0), at(origin, 5, 4)))
    expectAt(r.d, origin, 0, 4)
    expectAt(r.e, origin, 10, 4)
  })

  test('four right angles within 1e-9 rad for random inputs, at lat 0, 52.5 and 60', () => {
    for (const lat of [0, 52.5, 60]) {
      const origin = toMerc([13.4, lat])
      const next = rng(1000 + lat)
      let worstAngle = 0
      let worstEdge = 0
      for (let i = 0; i < 200; i++) {
        const { a, b, c } = randomCase(next, origin)
        const r = must(rectangleCorners(fromMerc(a), fromMerc(b), fromMerc(c)))
        const pd = toMerc(r.d)
        const pe = toMerc(r.e)
        // Ring A, B, E, D: the angle at each corner is between its two neighbours.
        worstAngle = Math.max(
          worstAngle,
          cosAt(b, a, pd),
          cosAt(a, b, pe),
          cosAt(b, pe, pd),
          cosAt(pe, pd, a),
        )
        // The opposite side is parallel and equal: E - D = B - A.
        worstEdge = Math.max(
          worstEdge,
          dist({ x: pe.x - pd.x, y: pe.y - pd.y }, { x: b.x - a.x, y: b.y - a.y }),
        )
      }
      expect(worstAngle).toBeLessThan(1e-9)
      expect(worstEdge).toBeLessThan(1e-6)
    }
  })

  test('rotating A, B and C in the plane rotates the corners by the same angle', () => {
    const origin = toMerc([13.4, 60])
    const next = rng(7)
    const rotate = (p: Pt, theta: number): Pt => {
      const dx = p.x - origin.x
      const dy = p.y - origin.y
      return {
        x: origin.x + dx * Math.cos(theta) - dy * Math.sin(theta),
        y: origin.y + dx * Math.sin(theta) + dy * Math.cos(theta),
      }
    }
    for (const theta of [0.7, 2.1, -1.3]) {
      for (let i = 0; i < 50; i++) {
        const { a, b, c } = randomCase(next, origin)
        const r0 = must(rectangleCorners(fromMerc(a), fromMerc(b), fromMerc(c)))
        const r1 = must(
          rectangleCorners(
            fromMerc(rotate(a, theta)),
            fromMerc(rotate(b, theta)),
            fromMerc(rotate(c, theta)),
          ),
        )
        expect(r1.depth).toBeCloseTo(r0.depth, 6)
        expect(dist(toMerc(r1.d), rotate(toMerc(r0.d), theta))).toBeLessThan(1e-6)
        expect(dist(toMerc(r1.e), rotate(toMerc(r0.e), theta))).toBeLessThan(1e-6)
      }
    }
  })

  test('guard: the same construction in lon/lat degrees is not a right angle at lat 60', () => {
    // The wrong way, kept only to show why the projection matters.
    const naiveCorners = (a: Loc, b: Loc, c: Loc): [Loc, Loc] => {
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const len = Math.hypot(dx, dy)
      const nx = -dy / len
      const ny = dx / len
      const depth = (c[0] - a[0]) * nx + (c[1] - a[1]) * ny
      return [
        [a[0] + nx * depth, a[1] + ny * depth],
        [b[0] + nx * depth, b[1] + ny * depth],
      ]
    }
    const a: Loc = [13.4, 60]
    const b: Loc = [13.41, 60.01]
    const c: Loc = [13.405 - 0.003 * 0.70710678, 60.005 + 0.003 * 0.70710678]
    const [dNaive, eNaive] = naiveCorners(a, b, c)
    // Right angle at D: between A and E. Measured on the map (Mercator), not in degrees.
    expect(cosAt(toMerc(a), toMerc(dNaive), toMerc(eNaive))).toBeGreaterThan(0.1)

    // The real function gives a right angle for the same three points.
    const r = must(rectangleCorners(a, b, c))
    expect(cosAt(toMerc(a), toMerc(r.d), toMerc(r.e))).toBeLessThan(1e-9)
  })
})

describe('screenDepth', () => {
  test('signed distance in pixels from the wall, with the same formula as rectangleCorners', () => {
    const a = { x: 0, y: 0 }
    const b = { x: 10, y: 0 }
    expect(screenDepth(a, b, { x: 5, y: 4 })).toBe(4)
    expect(screenDepth(a, b, { x: 5, y: -4 })).toBe(-4)
    expect(screenDepth(a, b, { x: 20, y: 4 })).toBe(4)
  })

  test('zero when A equals B', () => {
    expect(screenDepth({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 5, y: 4 })).toBe(0)
  })

  test('agrees with the depth from rectangleCorners for the same points', () => {
    const a = at(BERLIN, 0, 0)
    const b = at(BERLIN, 40, 30)
    const c = at(BERLIN, 10, 60)
    const r = must(rectangleCorners(a, b, c))
    expect(screenDepth(toMerc(a), toMerc(b), toMerc(c))).toBeCloseTo(r.depth, 6)
  })

  test('the preview guard is 16 px', () => {
    expect(MIN_DEPTH_PX).toBe(16)
  })
})
