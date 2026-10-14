// The segment index of crossing_ways against a brute force: every query returns each overlapping
// segment once, and no other.
import { describe, expect, it } from 'bun:test'
import type { Point } from '../geo.ts'
import { createSegmentIndex, segmentBox } from './crossing-segments.ts'
import type { Segment, SegmentEntry } from './crossing-segments.ts'

function random(seed: number) {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff
    return state / 0x7fffffff
  }
}

/** Segments of a few lengths: short ones, and long ones that cover more cells than the index keeps */
function segmentsOf(seed: number, count: number) {
  const next = random(seed)
  const out: Segment[] = []
  for (let i = 0; i < count; i++) {
    const a: Point = [next() * 0.05, next() * 0.05]
    const length = next() < 0.2 ? 0.03 : 0.002 * next()
    const angle = next() * Math.PI * 2
    const b: Point = [a[0] + Math.cos(angle) * length, a[1] + Math.sin(angle) * length]
    out.push({ from: `n${i}`, to: `m${i}`, a, b, box: segmentBox(a, b) })
  }
  return out
}

function boxAround(a: Point, b: Point) {
  return {
    minLon: Math.min(a[0], b[0]),
    minLat: Math.min(a[1], b[1]),
    maxLon: Math.max(a[0], b[0]),
    maxLat: Math.max(a[1], b[1]),
  }
}

describe('crossing_ways segment index', () => {
  it('returns the segments whose box overlaps the query, each once, as a brute force does', () => {
    const segments = segmentsOf(3, 400)
    const index = createSegmentIndex<string>()
    index.add('way', segments)
    const next = random(11)
    const out: SegmentEntry<string>[] = []
    for (let q = 0; q < 300; q++) {
      const a: Point = [next() * 0.05, next() * 0.05]
      const b: Point = [a[0] + next() * 0.02, a[1] + next() * 0.02]
      const query = boxAround(a, b)
      index.near(query, out)

      const expected = segments
        .filter(
          (segment) =>
            segment.box.minLon <= query.maxLon &&
            query.minLon <= segment.box.maxLon &&
            segment.box.minLat <= query.maxLat &&
            query.minLat <= segment.box.maxLat,
        )
        .map((segment) => segment.from)
        .sort()
      const found = out.map((entry) => entry.segment.from).sort()
      expect(found).toEqual(expected)
      expect(new Set(found).size).toBe(found.length)
    }
  })

  it('keeps the owner and the position of each segment', () => {
    const segments = segmentsOf(5, 20)
    const index = createSegmentIndex<{ id: string }>()
    const owner = { id: 'w9' }
    index.add(owner, segments)
    const out: SegmentEntry<{ id: string }>[] = []
    index.near(segments[4]!.box, out)
    const entry = out.find((item) => item.segment.from === 'n4')
    expect(entry?.owner).toBe(owner)
    expect(entry?.index).toBe(4)
  })

  it('finds nothing in an empty index', () => {
    const index = createSegmentIndex<string>()
    const out: SegmentEntry<string>[] = []
    index.near(boxAround([0, 0], [1, 1]), out)
    expect(out).toHaveLength(0)
  })
})
