import { describe, expect, it } from 'bun:test'
import { buildRoutingGraph, snapToGraph } from './graph.ts'
import { bicycleProfile } from './profile.ts'
import { graphOf, node, row, way } from './test-helpers.ts'

describe('buildRoutingGraph', () => {
  it('a straight way has its two ends as junctions and one edge', () => {
    const rg = buildRoutingGraph(
      graphOf([...row(4), way('w1', ['n1', 'n2', 'n3', 'n4'], { highway: 'residential' })]),
      bicycleProfile,
    )
    expect(rg.nodeIds.length).toBe(2)
    expect(rg.edgeFrom.length).toBe(1)
    expect(rg.segEdge.length).toBe(3)
    expect(rg.outArcs.length).toBe(2)
    expect(rg.wayIds).toEqual(['w1'])
  })

  it('everyNode makes every way node a junction', () => {
    const rg = buildRoutingGraph(
      graphOf([...row(4), way('w1', ['n1', 'n2', 'n3', 'n4'], { highway: 'residential' })]),
      bicycleProfile,
      { everyNode: true },
    )
    expect(rg.nodeIds.length).toBe(4)
    expect(rg.edgeFrom.length).toBe(3)
  })

  it('a node shared by two routable ways is a junction', () => {
    const entities = [
      node('n1', 13.4, 52.5),
      node('n2', 13.401, 52.5),
      node('n3', 13.402, 52.5),
      node('n4', 13.401, 52.499),
      node('n5', 13.401, 52.501),
      way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
      way('w2', ['n4', 'n2', 'n5'], { highway: 'residential' }),
    ]
    const rg = buildRoutingGraph(graphOf(entities), bicycleProfile)
    expect(rg.nodeIds.length).toBe(5)
    expect(rg.edgeFrom.length).toBe(4)
  })

  it('a node that is not loaded splits its way into two runs', () => {
    const entities = [
      ...row(5).filter((n) => n.id !== 'n3'),
      way('w1', ['n1', 'n2', 'n3', 'n4', 'n5'], { highway: 'residential' }),
    ]
    const rg = buildRoutingGraph(graphOf(entities), bicycleProfile)
    expect(rg.edgeFrom.length).toBe(2)
    expect(rg.nodeIds.length).toBe(4)
    expect(rg.nodeIds).not.toContain('n3')
  })

  it('a bounding box keeps the ways with a node inside it', () => {
    const entities = [
      ...row(3),
      node('m1', 14.0, 52.5),
      node('m2', 14.001, 52.5),
      way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' }),
      way('w2', ['m1', 'm2'], { highway: 'residential' }),
    ]
    const rg = buildRoutingGraph(graphOf(entities), bicycleProfile, {
      bbox: [13.3, 52.4, 13.5, 52.6],
    })
    expect(rg.wayIds).toEqual(['w1'])
  })

  it('a one-way way has one arc, a bicycle contraflow way two', () => {
    const oneway = buildRoutingGraph(
      graphOf([
        ...row(3),
        way('w1', ['n1', 'n2', 'n3'], { highway: 'residential', oneway: 'yes' }),
      ]),
      bicycleProfile,
    )
    expect(oneway.outArcs.length).toBe(1)
    const contraflow = buildRoutingGraph(
      graphOf([
        ...row(3),
        way('w1', ['n1', 'n2', 'n3'], {
          highway: 'residential',
          oneway: 'yes',
          'oneway:bicycle': 'no',
        }),
      ]),
      bicycleProfile,
    )
    expect(contraflow.outArcs.length).toBe(2)
  })

  it('records build time and counts in its stats', () => {
    const rg = buildRoutingGraph(
      graphOf([...row(3), way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' })]),
      bicycleProfile,
    )
    expect(rg.stats.buildMs).toBeGreaterThanOrEqual(0)
    expect(rg.stats).toMatchObject({ profile: 'bicycle', nodes: 2, edges: 1, segments: 2 })
  })
})

describe('snapToGraph', () => {
  const rg = buildRoutingGraph(
    graphOf([...row(3), way('w1', ['n1', 'n2', 'n3'], { highway: 'residential' })]),
    bicycleProfile,
  )

  it('snaps a point beside the middle of a segment to it', () => {
    const snap = snapToGraph(rg, 13.4015, 52.5001)
    expect(snap?.wayId).toBe('w1')
    expect(snap?.segment).toBe(1)
    expect(snap?.t).toBeCloseTo(0.5, 2)
    expect(snap?.loc[0]).toBeCloseTo(13.4015, 6)
    expect(snap?.distanceM).toBeGreaterThan(5)
    expect(snap?.distanceM).toBeLessThan(20)
  })

  it('snaps to the end of a way when the point is past it', () => {
    const snap = snapToGraph(rg, 13.4021, 52.5)
    expect(snap?.segment).toBe(1)
    expect(snap?.t).toBeCloseTo(1, 6)
  })

  it('returns undefined beyond the maximum distance', () => {
    expect(snapToGraph(rg, 13.5, 52.5)).toBeUndefined()
    expect(snapToGraph(rg, 13.4015, 52.503, 50)).toBeUndefined()
  })
})
