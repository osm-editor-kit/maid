import { describe, expect, it } from 'bun:test'
import type { MemberInfo, OverviewLayout, OverviewRow, RouteAnalysis } from '../types.ts'
import { layoutOverview } from './layout.ts'
import { analysisOf, branch, chainOf, issue, junction, member, point } from './test-analysis.ts'

/** The keys of the rows, top to bottom */
function keysOf(layout: OverviewLayout): string[] {
  return layout.rows.map((row) => row.key)
}

/** A row by its key; the test fails when it is missing */
function rowOf(layout: OverviewLayout, key: string): OverviewRow {
  const row = layout.rows.find((r) => r.key === key)
  if (!row) throw new Error(`no row ${key}; rows: ${keysOf(layout).join(', ')}`)
  return row
}

/**
 * A route with everything at once: a main line with a gap and a parallel strand, a stop, a platform, a guidepost, a
 * junction, a branch with an overlapping branch and a detached branch, and unplaced members of each kind.
 */
function mixed(): RouteAnalysis {
  const members: MemberInfo[] = [
    member(0, 'main'),
    member(1, 'main'),
    member(2, 'main'),
    member(3, 'main'),
    member(4, 'main'),
    member(5, 'point', 'guidepost'),
    member(6, 'stop'),
    member(7, 'point'),
    member(8, 'unloaded'),
    member(9, 'subroute'),
    member(10, 'other'),
    member(11, 'branch'),
    member(12, 'branch'),
    member(13, 'branch'),
    member(14, 'branch'),
    member(15, 'platform'),
  ]
  return analysisOf({
    members,
    // piece A: ways 0 and 1 (300 m), a gap, piece B: ways 2 and 3 (200 m); way 4 runs beside piece A
    chain: chainOf(
      [
        [
          [0, 100],
          [1, 200],
        ],
        [
          [2, 150],
          [3, 50],
        ],
      ],
      [0],
      { 0: [4] },
    ),
    points: [point(5, 150), point(6, 310), point(7), point(15, 320)],
    junctions: [junction('n-j', 210)],
    branches: [
      branch('alternative', [11, 12], 100, 300),
      branch('excursion', [13], 120, 200),
      branch('alternative', [14]),
    ],
    issues: [
      issue('gap', [1, 2], 300),
      issue('junction-without-guidepost', [], 210),
      issue('point-far', [5], 150),
      issue('out-of-sequence', [6], 310),
      issue('not-loaded', [8]),
      issue('unknown-role', [10]),
      issue('branch-detached', [14]),
      issue('order', []),
      issue('duplicate', [0, 0]),
    ],
  })
}

describe('layoutOverview: a plain line', () => {
  const analysis = analysisOf({
    members: [
      member(0, 'main'),
      member(1, 'main'),
      member(2, 'point', 'guidepost'),
      member(3, 'stop'),
    ],
    chain: chainOf([
      [
        [0, 120],
        [1, 180],
      ],
    ]),
    points: [point(2, 120), point(3, 250)],
  })

  it('lists start, the two points and end, top to bottom', () => {
    const layout = layoutOverview(analysis, 'schematic')
    expect(keysOf(layout)).toEqual(['start', 'point:2', 'point:3', 'end'])
    expect(layout.rows.map((row) => row.kind)).toEqual(['start', 'point', 'stop', 'end'])
    expect(layout.rows.map((row) => row.at)).toEqual([0, 120, 250, 300])
  })

  it('stacks rows with one 12 px section between each pair (schematic)', () => {
    const layout = layoutOverview(analysis, 'schematic')
    expect(layout.rows.map((row) => row.y)).toEqual([0, 40, 80, 120])
    expect(layout.sections.map((s) => s.height)).toEqual([12, 12, 12])
    expect(layout.sections.map((s) => s.y)).toEqual([28, 68, 108])
    expect(layout.height).toBe(148)
    expect(layout.lanes).toEqual([])
  })

  it('gives each section the main ways of its stretch', () => {
    const layout = layoutOverview(analysis, 'schematic')
    expect(layout.sections.map((s) => s.members)).toEqual([[0], [1], [1]])
    expect(layout.sections.every((s) => s.lane === 0 && !s.gap)).toBe(true)
  })
})

describe('layoutOverview: a gap', () => {
  const analysis = analysisOf({
    members: [member(0, 'main'), member(1, 'main')],
    chain: chainOf([[[0, 100]], [[1, 100]]], [0]),
  })

  it('puts a gap row where the pieces break, with the two ways around it', () => {
    const layout = layoutOverview(analysis, 'schematic')
    expect(keysOf(layout)).toEqual(['start', 'gap:0', 'end'])
    const gap = rowOf(layout, 'gap:0')
    expect(gap.kind).toBe('gap')
    expect(gap.at).toBe(100)
    expect(gap.members).toEqual([0, 1])
  })

  it('draws the sections on both sides of the gap as gap sections', () => {
    const layout = layoutOverview(analysis, 'schematic')
    expect(layout.sections.map((s) => s.gap)).toEqual([true, true])
    expect(layout.sections.map((s) => s.members)).toEqual([[0], [1]])
  })
})

describe('layoutOverview: branches', () => {
  it('a branch that returns to its node has two rows on lane 1, the start above the end', () => {
    const analysis = analysisOf({
      members: [
        member(0, 'main'),
        member(1, 'main'),
        member(2, 'main'),
        member(3, 'branch'),
        member(4, 'branch'),
      ],
      chain: chainOf([
        [
          [0, 100],
          [1, 100],
          [2, 100],
        ],
      ]),
      branches: [branch('excursion', [3, 4], 100, 100)],
    })
    const layout = layoutOverview(analysis, 'schematic')
    expect(keysOf(layout)).toEqual(['start', 'branch-start:0', 'branch-end:0', 'end'])
    const start = rowOf(layout, 'branch-start:0')
    const end = rowOf(layout, 'branch-end:0')
    expect(start.lane).toBe(1)
    expect(end.lane).toBe(1)
    expect(start.branch).toBe(0)
    expect(start.members).toEqual([3, 4])
    expect(layout.lanes).toEqual([{ lane: 1, branch: 0, fromY: start.y, toY: end.y }])
    expect(end.y).toBeGreaterThan(start.y)
  })

  it('overlapping branches take two lanes; a later branch takes the first lane that is free', () => {
    const analysis = analysisOf({
      members: [
        member(0, 'main'),
        member(1, 'main'),
        member(2, 'main'),
        member(3, 'branch'),
        member(4, 'branch'),
        member(5, 'branch'),
      ],
      chain: chainOf([
        [
          [0, 100],
          [1, 100],
          [2, 100],
        ],
      ]),
      branches: [
        branch('alternative', [3], 50, 250),
        branch('excursion', [4], 100, 100),
        branch('alternative', [5], 260, 280),
      ],
    })
    const layout = layoutOverview(analysis, 'schematic')
    const lanes = Object.fromEntries(layout.lanes.map((l) => [l.branch, l.lane]))
    expect(lanes).toEqual({ 0: 1, 1: 2, 2: 1 })
    expect(rowOf(layout, 'branch-start:0').lane).toBe(1)
    expect(rowOf(layout, 'branch-start:1').lane).toBe(2)
    expect(rowOf(layout, 'branch-end:1').lane).toBe(2)
    expect(rowOf(layout, 'branch-start:2').lane).toBe(1)
  })
})

describe('layoutOverview: schematic and scaled heights', () => {
  const analysis = analysisOf({
    members: [member(0, 'main'), member(1, 'main'), member(2, 'point'), member(3, 'point')],
    chain: chainOf([
      [
        [0, 5000],
        [1, 15000],
      ],
    ]),
    points: [point(2, 0), point(3, 5000)],
  })

  it('schematic: every section is sectionHeight', () => {
    const layout = layoutOverview(analysis, 'schematic')
    expect(layout.sections.map((s) => s.height)).toEqual([12, 12, 12])
    expect(layout.height).toBe(4 * 28 + 3 * 12)
  })

  it('scaled: height by length (40 px per km), at least minSectionHeight', () => {
    const layout = layoutOverview(analysis, 'scaled')
    expect(layout.sections.map((s) => s.length)).toEqual([0, 5000, 15000])
    expect(layout.sections.map((s) => s.height)).toEqual([4, 200, 600])
    expect(layout.height).toBe(4 * 28 + 4 + 200 + 600)
  })

  it('scaled: the options change the scale and the minimum', () => {
    const layout = layoutOverview(analysis, 'scaled', { pxPerKm: 10, minSectionHeight: 6 })
    expect(layout.sections.map((s) => s.height)).toEqual([6, 50, 150])
  })

  it('the options change the row and section heights', () => {
    const layout = layoutOverview(analysis, 'schematic', { rowHeight: 20, sectionHeight: 5 })
    expect(layout.rows.map((row) => row.y)).toEqual([0, 25, 50, 75])
    expect(layout.height).toBe(4 * 20 + 3 * 5)
  })
})

describe('layoutOverview: unplaced rows', () => {
  it('lists each non-empty group once, after the line, in a fixed order', () => {
    const layout = layoutOverview(mixed(), 'schematic')
    const unplaced = layout.rows.filter((row) => row.kind === 'unplaced')
    expect(unplaced.map((row) => row.key)).toEqual([
      'unplaced:unloaded',
      'unplaced:subroute',
      'unplaced:other',
      'unplaced:points',
      'unplaced:detached',
    ])
    expect(unplaced.map((row) => row.members)).toEqual([[8], [9], [10], [7], [14]])
    expect(unplaced.every((row) => row.at === undefined)).toBe(true)
    // they sit below every placed row
    const firstUnplaced = layout.rows.findIndex((row) => row.kind === 'unplaced')
    expect(layout.rows.slice(firstUnplaced).every((row) => row.kind === 'unplaced')).toBe(true)
    expect(rowOf(layout, 'unplaced:unloaded').y).toBeGreaterThan(rowOf(layout, 'end').y)
  })

  it('a main way the line did not use goes to a main group', () => {
    const analysis = analysisOf({
      members: [member(0, 'main'), member(1, 'main')],
      chain: chainOf([[[0, 100]]]),
    })
    const layout = layoutOverview(analysis, 'schematic')
    expect(keysOf(layout)).toEqual(['start', 'end', 'unplaced:main'])
    expect(rowOf(layout, 'unplaced:main').members).toEqual([1])
  })

  it('a plain route has no unplaced rows', () => {
    const analysis = analysisOf({
      members: [member(0, 'main'), member(1, 'point', 'guidepost')],
      chain: chainOf([[[0, 100]]]),
      points: [point(1, 50)],
    })
    expect(keysOf(layoutOverview(analysis, 'schematic'))).toEqual(['start', 'point:1', 'end'])
  })
})

describe('layoutOverview: member coverage', () => {
  it('every member index is in at least one row or section of a mixed route', () => {
    const analysis = mixed()
    const layout = layoutOverview(analysis, 'schematic')
    const seen = new Set<number>()
    for (const row of layout.rows) for (const m of row.members) seen.add(m)
    for (const section of layout.sections) for (const m of section.members) seen.add(m)
    const missing = analysis.members.map((m) => m.index).filter((index) => !seen.has(index))
    expect(missing).toEqual([])
  })

  it('a section lists the ways of its stretch, a parallel strand included', () => {
    const layout = layoutOverview(mixed(), 'schematic')
    const firstSection = layout.sections[0]
    expect(keysOf(layout).slice(0, 2)).toEqual(['start', 'branch-start:0'])
    expect(firstSection?.members).toEqual([0, 4])
  })
})

describe('layoutOverview: issues', () => {
  it('attaches every issue to exactly one row', () => {
    const analysis = mixed()
    const layout = layoutOverview(analysis, 'schematic')
    const counts = analysis.issues.map(() => 0)
    for (const row of layout.rows) for (const i of row.issues) counts[i] = (counts[i] ?? 0) + 1
    expect(counts).toEqual(analysis.issues.map(() => 1))
  })

  it('puts each issue on the row its code and place ask for', () => {
    const layout = layoutOverview(mixed(), 'schematic')
    const keyOfIssue = new Map<number, string>()
    for (const row of layout.rows) for (const i of row.issues) keyOfIssue.set(i, row.key)
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => keyOfIssue.get(i))).toEqual([
      'gap:0',
      'junction:n-j',
      'point:5',
      'point:6',
      'unplaced:unloaded',
      'unplaced:other',
      'unplaced:detached',
      'start',
      'start',
    ])
  })

  it('an issue with a place and no row of its kind goes to the nearest row', () => {
    const analysis = analysisOf({
      members: [member(0, 'main'), member(1, 'main'), member(2, 'point')],
      chain: chainOf([
        [
          [0, 120],
          [1, 130],
        ],
      ]),
      points: [point(2, 250)],
      issues: [issue('gap', [0, 1], 240)],
    })
    const layout = layoutOverview(analysis, 'schematic')
    expect(rowOf(layout, 'point:2').issues).toEqual([0])
  })

  it('an empty route still gets its issues on one row', () => {
    const layout = layoutOverview(
      analysisOf({ members: [], issues: [issue('empty', [])] }),
      'schematic',
    )
    expect(layout.rows).toHaveLength(1)
    expect(layout.rows[0]?.issues).toEqual([0])
    expect(layout.height).toBe(28)
  })
})

describe('layoutOverview: junctions and guideposts', () => {
  it('a junction and a guidepost 10 m apart keep both rows, the guidepost first', () => {
    const analysis = analysisOf({
      members: [member(0, 'main'), member(1, 'point', 'guidepost')],
      chain: chainOf([[[0, 300]]]),
      points: [point(1, 140)],
      junctions: [junction('n-j', 150, 1)],
    })
    const layout = layoutOverview(analysis, 'schematic')
    expect(keysOf(layout)).toEqual(['start', 'point:1', 'junction:n-j', 'end'])
  })
})

describe('layoutOverview: size', () => {
  it('lays out 20,000 ways, 5,000 junctions and 1,000 points in under 500 ms', () => {
    const wayCount = 20_000
    const pointCount = 1000
    const branchCount = 200
    const ways: [number, number][] = Array.from({ length: wayCount }, (_, i) => [i, 10])
    const members: MemberInfo[] = []
    for (let i = 0; i < wayCount; i++) members.push(member(i, 'main'))
    for (let p = 0; p < pointCount; p++) members.push(member(wayCount + p, 'point', 'guidepost'))
    for (let b = 0; b < branchCount; b++) {
      members.push(member(wayCount + pointCount + b, 'branch'))
    }
    const analysis = analysisOf({
      members,
      chain: chainOf([ways]),
      points: Array.from({ length: pointCount }, (_, p) => point(wayCount + p, p * 200 + 100)),
      junctions: Array.from({ length: 5000 }, (_, j) => junction(`n${j}`, j * 40 + 5)),
      branches: Array.from({ length: branchCount }, (_, b) =>
        branch('alternative', [wayCount + pointCount + b], b * 900, b * 900 + 300),
      ),
    })

    const times: number[] = []
    let layout: OverviewLayout | undefined
    for (let run = 0; run < 3; run++) {
      const start = performance.now()
      layout = layoutOverview(analysis, 'scaled')
      times.push(performance.now() - start)
    }
    console.log(
      `layoutOverview: ${wayCount} ways, 5000 junctions, ${pointCount} points: ${times.map((t) => t.toFixed(1)).join(', ')} ms (3 runs)`,
    )
    expect(layout?.rows.length).toBe(2 + pointCount + 5000 + 2 * branchCount)
    expect(Math.max(...times)).toBeLessThan(500)
  })
})
