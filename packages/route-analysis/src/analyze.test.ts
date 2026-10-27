import { describe, expect, it } from 'bun:test'
import { analyzeRoute } from './analyze.ts'
import type { LonLat, RouteInput } from './types.ts'

function hiking(members: RouteInput['members']): RouteInput {
  return {
    tags: { type: 'route', route: 'hiking' },
    members,
    ways: new Map([
      ['w1', ['n1', 'n2']],
      ['w2', ['n2', 'n3']],
    ]),
    nodes: new Map<string, LonLat>([
      ['n1', [0, 0]],
      ['n2', [0.001, 0]],
      ['n3', [0.002, 0]],
    ]),
    outsideWays: new Map([['n2', 2]]),
  }
}

const ways: RouteInput['members'] = [
  { type: 'way', id: 'w1', role: '' },
  { type: 'way', id: 'w2', role: '' },
]

describe('analyzeRoute', () => {
  it('judges no junction while a guidepost member is not loaded', () => {
    const codes = analyzeRoute(
      hiking([...ways, { type: 'node', id: 'n9', role: 'guidepost' }]),
    ).issues.map((issue) => issue.code)
    expect(codes).toContain('not-loaded')
    expect(codes).not.toContain('no-guideposts')
    expect(codes).not.toContain('junction-without-guidepost')
  })

  it('says so once when a waymarked route lists no guidepost', () => {
    const codes = analyzeRoute(hiking(ways)).issues.map((issue) => issue.code)
    expect(codes).toEqual(['no-guideposts'])
  })

  it('finds no junctions on a bus route', () => {
    const input = { ...hiking(ways), tags: { type: 'route', route: 'bus' } }
    expect(analyzeRoute(input).junctions).toEqual([])
  })
})
