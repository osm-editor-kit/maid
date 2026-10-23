import { describe, expect, test } from 'bun:test'
import {
  entitiesFromOsmJson,
  Graph,
  ModelContext,
  type OsmJsonElement,
  OsmNode,
  OsmWay,
} from '@osm-editor-kit/maid-model'
import { applyPlan } from './apply.ts'
import { parseOsmChange } from './parse.ts'
import { planOf } from './plan.ts'
import type { ServerState } from './types.ts'

const context = new ModelContext()

const server: OsmJsonElement[] = [
  {
    type: 'node',
    id: 1,
    version: 3,
    lat: 52,
    lon: 13,
    tags: { amenity: 'bench', backrest: 'yes' },
  },
  { type: 'node', id: 2, version: 1, lat: 52, lon: 13.001 },
  { type: 'node', id: 3, version: 1, lat: 52, lon: 13.002 },
  { type: 'way', id: 10, version: 4, nodes: [2, 3], tags: { highway: 'path' } },
  { type: 'node', id: 4, version: 2, lat: 52.001, lon: 13, tags: { amenity: 'waste_basket' } },
  {
    type: 'relation',
    id: 20,
    version: 1,
    members: [{ type: 'way', ref: 10, role: '' }],
    tags: { type: 'route' },
  },
]

function setUp(
  xml: string,
  states: Record<string, ServerState>,
  parents: Record<string, string[]> = {},
) {
  const parsed = parseOsmChange(`<osmChange version="0.6">${xml}</osmChange>`)
  if (!parsed.ok) throw new Error(parsed.error.id)
  // a graph on top of the base, as the history's staging graph is
  const graph = new Graph(new Graph(context, entitiesFromOsmJson(context, server)))
  return {
    file: parsed.file,
    graph,
    states: new Map(Object.entries(states)),
    parents: new Map(Object.entries(parents)),
  }
}

const current = (id: string) => {
  const element = server.find((json) => json.type.charAt(0) + json.id === id)!
  return {
    type: element.type,
    id: element.id,
    version: element.version,
    tags: element.tags ?? {},
    ...(element.type === 'node' ? { lat: element.lat, lon: element.lon } : {}),
    ...(element.type === 'way' ? { nodes: element.nodes } : {}),
    ...(element.type === 'relation' ? { members: element.members } : {}),
  }
}

describe('applyPlan', () => {
  test('creates with mapped ids, modifies keep the server version, deletes remove exactly the element', () => {
    const { file, graph, states, parents } = setUp(
      `<create>
        <node id="-1" lat="52.002" lon="13"><tag k="amenity" v="bicycle_parking"/></node>
        <way id="-2"><nd ref="-1"/><nd ref="3"/><tag k="highway" v="footway"/></way>
        <relation id="-3"><member type="way" ref="-2" role=""/><member type="node" ref="1" role="stop"/><tag k="type" v="route"/></relation>
      </create>
      <modify>
        <node id="1" version="2" lat="52" lon="13"><tag k="amenity" v="bench"/><tag k="colour" v="green"/></node>
        <way id="10" version="4"><nd ref="2"/><nd ref="3"/><nd ref="-1"/><tag k="highway" v="path"/></way>
      </modify>
      <delete><node id="4" version="2"/></delete>`,
      {
        n1: {
          current: current('n1'),
          base: { type: 'node', id: 1, version: 2, tags: { amenity: 'bench' }, lat: 52, lon: 13 },
        },
        w10: { current: current('w10') },
        n4: { current: current('n4') },
      },
    )
    const plan = planOf(file, states, parents, {})
    expect(plan.ready).toBe(true)
    const { action, created } = applyPlan(plan, context)
    const after = action(graph)
    const parking = after.entity(created.get('n-1')!) as OsmNode
    expect(parking.id).toMatch(/^n-\d+$/)
    expect(parking.tags).toEqual({ amenity: 'bicycle_parking' })
    expect(parking.loc).toEqual([13, 52.002])
    const footway = after.entity(created.get('w-2')!) as OsmWay
    expect(footway.nodes).toEqual([parking.id, 'n3'])
    const route = after.entity(created.get('r-3')!)
    expect(route.props).toMatchObject({
      members: [
        { id: footway.id, type: 'way', role: '' },
        { id: 'n1', type: 'node', role: 'stop' },
      ],
    })
    expect(after.entity('n1').tags).toEqual({ amenity: 'bench', backrest: 'yes', colour: 'green' })
    expect(after.entity('n1').version).toBe(3)
    expect((after.entity('w10') as OsmWay).nodes).toEqual(['n2', 'n3', parking.id])
    expect(after.hasEntity('n4')).toBeUndefined()
  })

  test('a still-used node deleted on the person`s choice also leaves its way; a kept one stays', () => {
    const xml = '<delete><node id="2" version="1"/></delete>'
    const states = { n2: { current: current('n2') } }
    const keep = setUp(xml, states, { n2: ['w10'] })
    const kept = planOf(keep.file, keep.states, keep.parents, {})
    expect(kept.items[0]!.status).toBe('decide')
    expect(kept.ready).toBe(false)
    const chosen = planOf(keep.file, keep.states, keep.parents, { 'n2:delete': 'file' })
    const after = applyPlan(chosen, context).action(keep.graph)
    expect(after.hasEntity('n2')).toBeUndefined()
    // the way had two nodes: deleting one makes it degenerate, and the model deletes it as iD does
    expect(after.hasEntity('w10')).toBeUndefined()
  })

  test('skipped and undecided items write nothing', () => {
    const { file, graph, states, parents } = setUp(
      '<modify><node id="1" version="1" lat="52" lon="13"><tag k="amenity" v="table"/></node></modify>',
      {
        n1: {
          current: current('n1'),
          base: { type: 'node', id: 1, version: 1, tags: { amenity: 'chair' }, lat: 52, lon: 13 },
        },
      },
    )
    const plan = planOf(file, states, parents, {})
    expect(plan.open).toBe(1)
    expect(applyPlan(plan, context).action(graph).entity('n1').tags).toEqual({
      amenity: 'bench',
      backrest: 'yes',
    })
  })

  test('a decision of its own: only that element, and a changed decision reverts the earlier write first', () => {
    const { file, graph, states, parents } = setUp(
      '<modify><node id="1" version="1" lat="52" lon="13"><tag k="amenity" v="table"/></node><node id="4" version="2" lat="52.001" lon="13"><tag k="amenity" v="recycling"/></node></modify>',
      {
        n1: {
          current: current('n1'),
          base: { type: 'node', id: 1, version: 1, tags: { amenity: 'chair' }, lat: 52, lon: 13 },
        },
        n4: { current: current('n4') },
      },
    )
    const mine = planOf(file, states, parents, { 'n1:tag:amenity': 'file' })
    const first = applyPlan(mine, context, { only: new Set(['n1']) }).action(graph)
    expect(first.entity('n1').tags.amenity).toBe('table')
    // the other element is not written by the decision
    expect(first.entity('n4').tags.amenity).toBe('waste_basket')
    const theirs = planOf(file, states, parents, { 'n1:tag:amenity': 'current' })
    const second = applyPlan(theirs, context, { only: new Set(['n1']), revert: ['n1'] }).action(
      first,
    )
    expect(second.entity('n1').tags).toEqual({ amenity: 'bench', backrest: 'yes' })
  })

  test('a decision that comes out as the server state writes nothing', () => {
    const { file, graph, states, parents } = setUp(
      '<modify><node id="1" version="1" lat="52" lon="13"><tag k="amenity" v="table"/><tag k="backrest" v="yes"/></node></modify>',
      {
        n1: {
          current: current('n1'),
          base: {
            type: 'node',
            id: 1,
            version: 1,
            tags: { amenity: 'chair', backrest: 'yes' },
            lat: 52,
            lon: 13,
          },
        },
      },
    )
    const before = graph.entity('n1')
    const plan = planOf(file, states, parents, { 'n1:tag:amenity': 'current' })
    const applied = applyPlan(plan, context, { only: new Set(['n1']) })
    const after = applied.action(graph)
    expect(applied.touched.size).toBe(0)
    expect(after.entity('n1')).toBe(before)
  })

  test('a delete of a used node touches its ways too, and reverting them takes it all back', () => {
    const { file, graph, states } = setUp('<delete><node id="2" version="1"/></delete>', {
      n2: { current: current('n2') },
    })
    const plan = planOf(file, states, new Map([['n2', ['w10']]]), { 'n2:delete': 'file' })
    const applied = applyPlan(plan, context, { only: new Set(['n2']) })
    const deleted = applied.action(graph)
    expect([...applied.touched].sort()).toEqual(['n2', 'n3', 'r20', 'w10'])
    expect(deleted.hasEntity('w10')).toBeUndefined()
    const kept = planOf(file, states, new Map([['n2', ['w10']]]), { 'n2:delete': 'current' })
    const back = applyPlan(kept, context, {
      only: new Set(['n2']),
      revert: applied.touched,
    }).action(deleted)
    expect(back.hasEntity('n2')).toBeDefined()
    expect((back.entity('w10') as OsmWay).nodes).toEqual(['n2', 'n3'])
  })

  test('a new element a decision created is reverted by its editor id, not created twice', () => {
    const { file, graph } = setUp(
      '<create><node id="-1" lat="52.002" lon="13"><tag k="amenity" v="bench"/></node></create>',
      {},
    )
    const plan = planOf(file, new Map(), new Map(), {})
    const first = applyPlan(plan, context, { only: new Set(['n-1']) })
    const once = first.action(graph)
    const [createdId] = [...first.touched]
    expect(once.hasEntity(createdId!)).toBeDefined()
    const second = applyPlan(plan, context, { only: new Set(['n-1']), revert: first.touched })
    const twice = second.action(once)
    expect(twice.hasEntity(createdId!)).toBeUndefined()
    expect(second.touched.size).toBe(1)
  })
})
