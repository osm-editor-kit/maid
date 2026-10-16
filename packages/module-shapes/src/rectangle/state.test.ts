import { describe, expect, test } from 'bun:test'
import { type Loc } from './rectangle'
import { type Corner, previewOf, type RectangleEnv, reduce, START, type Stage } from './state'

// The screen is Web Mercator at one pixel per metre, with y pointing down: the same geometry as the pure maths.
const R = 6378137
const DEG = Math.PI / 180
const ORIGIN_LON = 13.4
const ORIGIN_LAT = 52.5

function mercatorOf(loc: Loc): { x: number; y: number } {
  return {
    x: R * loc[0] * DEG,
    y: R * Math.log(Math.tan(Math.PI / 4 + (loc[1] * DEG) / 2)),
  }
}

/** The pixel of a location: the map's y is the negative of the screen's y */
function project(loc: Loc) {
  const m = mercatorOf(loc)
  return { x: m.x, y: -m.y }
}

/** A location `x` metres east and `y` metres north (screen up) of the origin */
function at(x: number, y: number): Loc {
  const origin = mercatorOf([ORIGIN_LON, ORIGIN_LAT])
  const mx = origin.x + x
  const my = origin.y + y
  return [
    (mx / R) * (180 / Math.PI),
    (2 * Math.atan(Math.exp(my / R)) - Math.PI / 2) * (180 / Math.PI),
  ]
}

const freeEnv: RectangleEnv = {
  project,
  nodeCorner: (loc) => ({ type: 'free', loc }),
}

const free = (loc: Loc): Corner => ({ type: 'free', loc })
const node = (id: string, loc: Loc): Corner => ({ type: 'node', id, loc })

function screenRing(locs: Loc[]) {
  return locs.map(project)
}

function angleAt(
  p: { x: number; y: number },
  q: { x: number; y: number },
  r: { x: number; y: number },
) {
  const ux = p.x - q.x
  const uy = p.y - q.y
  const vx = r.x - q.x
  const vy = r.y - q.y
  const cos = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy))
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI
}

/** Clicks A (0, 0) and B (100, 0) on open ground: the stage in the depth step */
function afterAB(env: RectangleEnv = freeEnv): Stage {
  let stage: Stage = START
  stage = reduce(stage, { type: 'click', loc: at(0, 0), target: free(at(0, 0)) }, env).stage
  stage = reduce(stage, { type: 'click', loc: at(100, 0), target: free(at(100, 0)) }, env).stage
  return stage
}

describe('three clicks on open ground', () => {
  test('the first click sets A and the wall follows the pointer', () => {
    const step = reduce(START, { type: 'click', loc: at(0, 0), target: free(at(0, 0)) }, freeEnv)
    expect(step.stage.step).toBe('second')
    expect(step.commit).toBeUndefined()
    const moved = reduce(step.stage, { type: 'move', loc: at(50, 20) }, freeEnv)
    expect(previewOf(moved.stage, freeEnv)).toEqual({ wall: [at(0, 0), at(50, 20)] })
  })

  test('the second click sets B, and the stage is the depth step', () => {
    expect(afterAB().step).toBe('depth')
  })

  test('a third click on one side commits four right angles in ring order A, B, E, D', () => {
    let stage = afterAB()
    stage = reduce(stage, { type: 'move', loc: at(50, 40) }, freeEnv).stage
    const step = reduce(
      stage,
      { type: 'click', loc: at(50, 40), target: free(at(50, 40)) },
      freeEnv,
    )
    expect(step.refused).toBeUndefined()
    expect(step.stage).toEqual(START)
    const ring = step.commit!
    expect(ring.map((c) => c.type)).toEqual(['free', 'free', 'free', 'free'])
    const [a, b, e, d] = ring.map((c) => project(c.loc))
    // 40 px deep, so E and D are 40 px from B and A, on the same side
    expect(Math.hypot(e!.x - b!.x, e!.y - b!.y)).toBeCloseTo(40, 6)
    expect(Math.hypot(d!.x - a!.x, d!.y - a!.y)).toBeCloseTo(40, 6)
    const pts = screenRing(ring.map((c) => c.loc))
    for (let i = 0; i < 4; i++) {
      const prev = pts[(i + 3) % 4]!
      const here = pts[i]!
      const next = pts[(i + 1) % 4]!
      expect(Math.abs(angleAt(prev, here, next) - 90)).toBeLessThan(0.5)
    }
  })

  test('the corners do not depend on where the third click is along the wall', () => {
    const stage = afterAB()
    const near = reduce(
      stage,
      { type: 'click', loc: at(50, 40), target: free(at(50, 40)) },
      freeEnv,
    )
    const far = reduce(
      stage,
      { type: 'click', loc: at(-300, 40), target: free(at(-300, 40)) },
      freeEnv,
    )
    const d1 = project(near.commit![3].loc)
    const d2 = project(far.commit![3].loc)
    expect(Math.hypot(d1.x - d2.x, d1.y - d2.y)).toBeLessThan(1e-6)
  })
})

describe('refusals keep the mode waiting', () => {
  test('a second click within 8 px of A is refused and sets nothing', () => {
    const stage = reduce(
      START,
      { type: 'click', loc: at(0, 0), target: free(at(0, 0)) },
      freeEnv,
    ).stage
    const step = reduce(stage, { type: 'click', loc: at(5, 0), target: free(at(5, 0)) }, freeEnv)
    expect(step.refused).toBe('same-spot')
    expect(step.stage).toEqual(stage)
  })

  test('a second click on the same node as A is refused', () => {
    const stage: Stage = { step: 'second', a: node('n1', at(0, 0)), pointer: at(0, 0) }
    const step = reduce(
      stage,
      { type: 'click', loc: at(100, 0), target: node('n1', at(0, 0)) },
      freeEnv,
    )
    expect(step.refused).toBe('same-spot')
  })

  test('two places on the same edge of one way are refused', () => {
    const a = {
      type: 'way' as const,
      wayId: 'w1',
      loc: at(0, 0),
      edge: ['n1', 'n2'] as [string, string],
    }
    const stage: Stage = { step: 'second', a, pointer: at(0, 0) }
    const b = {
      type: 'way' as const,
      wayId: 'w1',
      loc: at(100, 0),
      edge: ['n2', 'n1'] as [string, string],
    }
    expect(reduce(stage, { type: 'click', loc: at(100, 0), target: b }, freeEnv).refused).toBe(
      'shared-edge',
    )
  })

  test('places on two different edges of one way are fine', () => {
    const a = {
      type: 'way' as const,
      wayId: 'w1',
      loc: at(0, 0),
      edge: ['n1', 'n2'] as [string, string],
    }
    const stage: Stage = { step: 'second', a, pointer: at(0, 0) }
    const b = {
      type: 'way' as const,
      wayId: 'w1',
      loc: at(100, 0),
      edge: ['n3', 'n4'] as [string, string],
    }
    expect(
      reduce(stage, { type: 'click', loc: at(100, 0), target: b }, freeEnv).refused,
    ).toBeUndefined()
  })

  test('a third click closer than 16 px to the wall is refused and keeps waiting', () => {
    const stage = afterAB()
    const step = reduce(
      stage,
      { type: 'click', loc: at(50, 15), target: free(at(50, 15)) },
      freeEnv,
    )
    expect(step.refused).toBe('shallow')
    expect(step.commit).toBeUndefined()
    expect(step.stage.step).toBe('depth')
  })

  test('a third click on the wall itself is refused', () => {
    const step = reduce(
      afterAB(),
      { type: 'click', loc: at(50, 0), target: free(at(50, 0)) },
      freeEnv,
    )
    expect(step.refused).toBe('shallow')
  })

  test('a corner that would be the node of A is refused as the same node', () => {
    const stage: Stage = {
      step: 'depth',
      a: node('n1', at(0, 0)),
      b: free(at(100, 0)),
      pointer: at(50, 40),
    }
    const env: RectangleEnv = { project, nodeCorner: () => node('n1', at(0, 0)) }
    const step = reduce(stage, { type: 'click', loc: at(50, 40), target: free(at(50, 40)) }, env)
    expect(step.refused).toBe('same-node')
    expect(step.commit).toBeUndefined()
  })

  test('a corner that lands on an existing node is reused in the ring', () => {
    const env: RectangleEnv = {
      project,
      nodeCorner: (loc) => {
        const p = project(loc)
        const q = project(at(100, 40))
        return Math.hypot(p.x - q.x, p.y - q.y) < 1 ? node('n9', loc) : free(loc)
      },
    }
    const step = reduce(
      afterAB(env),
      { type: 'click', loc: at(50, 40), target: free(at(50, 40)) },
      env,
    )
    expect(step.commit![2]).toEqual(node('n9', at(100, 40)))
    expect(step.commit![3].type).toBe('free')
  })

  test('a way-snapped A stays a way corner, so the writer can insert its midpoint', () => {
    const a = {
      type: 'way' as const,
      wayId: 'w1',
      loc: at(0, 0),
      edge: ['n1', 'n2'] as [string, string],
    }
    const stage: Stage = { step: 'second', a, pointer: at(0, 0) }
    const afterB = reduce(
      stage,
      { type: 'click', loc: at(100, 0), target: free(at(100, 0)) },
      freeEnv,
    ).stage
    const step = reduce(
      afterB,
      { type: 'click', loc: at(50, 40), target: free(at(50, 40)) },
      freeEnv,
    )
    expect(step.commit![0]).toEqual(a)
  })
})

describe('backspace', () => {
  test('after B it goes back to choosing B, keeping A', () => {
    const back = reduce(afterAB(), { type: 'back' }, freeEnv)
    expect(back.stage.step).toBe('second')
    if (back.stage.step !== 'second') throw new Error('expected the second step')
    expect(back.stage.a).toEqual(free(at(0, 0)))
    const again = reduce(
      back.stage,
      { type: 'click', loc: at(80, 0), target: free(at(80, 0)) },
      freeEnv,
    )
    expect(again.stage.step).toBe('depth')
  })

  test('before B it does nothing', () => {
    expect(reduce(START, { type: 'back' }, freeEnv).stage).toBe(START)
    const second: Stage = { step: 'second', a: free(at(0, 0)) }
    expect(reduce(second, { type: 'back' }, freeEnv).stage).toBe(second)
  })
})

describe('preview', () => {
  test('after B and before any move, only the wall', () => {
    const stage: Stage = { step: 'depth', a: free(at(0, 0)), b: free(at(100, 0)) }
    expect(previewOf(stage, freeEnv)).toEqual({})
    const withPointer: Stage = { ...stage, pointer: at(100, 0) }
    expect(previewOf(withPointer, freeEnv)).toEqual({ wall: [at(0, 0), at(100, 0)] })
  })

  test('a shallow pointer draws the wall only; a deep one draws the rectangle', () => {
    const shallow: Stage = {
      step: 'depth',
      a: free(at(0, 0)),
      b: free(at(100, 0)),
      pointer: at(50, 5),
    }
    expect(previewOf(shallow, freeEnv)).toEqual({ wall: [at(0, 0), at(100, 0)] })
    const preview = previewOf({ ...shallow, pointer: at(50, 40) }, freeEnv)
    expect(preview.rectangle).toHaveLength(4)
    const pts = screenRing(preview.rectangle!)
    expect(Math.hypot(pts[2]!.x - pts[1]!.x, pts[2]!.y - pts[1]!.y)).toBeCloseTo(40, 6)
  })

  test('no clicks: no preview', () => {
    expect(previewOf(START, freeEnv)).toEqual({})
  })
})
