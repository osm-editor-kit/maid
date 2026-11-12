import { describe, expect, it } from 'bun:test'
import {
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  type Action,
} from '@osm-editor-kit/maid-model'
import { createPresets, withChanges } from '@osm-editor-kit/maid-presets'
import { defaultPresetData } from '@osm-editor-kit/maid-presets/default'
import { difficultyBand, gradeOf, stylesOf } from './grades.ts'
import {
  addToRelationAction,
  areaCrags,
  cragRoutes,
  kindOf,
  nearbyCrags,
  newCragActions,
  parentsOf,
} from './logic.ts'
import { climbingPresetChanges } from './presets.ts'

const context = new ModelContext()
const climb = { sport: 'climbing' }

/** A crag of two route lines and a route start, an area with the crag, and a route in no crag 60 m east */
function scene() {
  return new Graph(context, [
    new OsmNode(context, { id: 'n1', loc: [12.36, 47.754], tags: {} }),
    new OsmNode(context, { id: 'n2', loc: [12.36, 47.7543], tags: {} }),
    new OsmNode(context, { id: 'n3', loc: [12.3602, 47.754], tags: {} }),
    new OsmNode(context, { id: 'n4', loc: [12.3602, 47.7543], tags: {} }),
    new OsmNode(context, {
      id: 'n5',
      loc: [12.3604, 47.754],
      tags: { ...climb, climbing: 'route_bottom', name: 'C', 'climbing:grade:french': '6b' },
    }),
    new OsmNode(context, { id: 'n6', loc: [12.3608, 47.754], tags: {} }),
    new OsmNode(context, { id: 'n7', loc: [12.3608, 47.7543], tags: {} }),
    new OsmWay(context, {
      id: 'w1',
      nodes: ['n1', 'n2'],
      tags: {
        ...climb,
        climbing: 'route',
        name: 'A',
        'climbing:grade:uiaa': '5-',
        'climbing:length': '20',
        'climbing:sport': 'yes',
      },
    }),
    new OsmWay(context, {
      id: 'w2',
      nodes: ['n3', 'n4'],
      tags: { ...climb, climbing: 'route', name: 'B' },
    }),
    new OsmWay(context, {
      id: 'w3',
      nodes: ['n6', 'n7'],
      tags: { ...climb, climbing: 'route', name: 'Lonely' },
    }),
    new OsmRelation(context, {
      id: 'r1',
      tags: { type: 'site', site: 'climbing', climbing: 'crag', name: 'Wand' },
      members: [
        { id: 'w1', type: 'way', role: '' },
        { id: 'w2', type: 'way', role: '' },
        { id: 'n5', type: 'node', role: '' },
        { id: 'w99', type: 'way', role: '' },
      ],
    }),
    new OsmRelation(context, {
      id: 'r2',
      tags: { type: 'site', site: 'climbing', climbing: 'area', name: 'Gebiet' },
      members: [{ id: 'r1', type: 'relation', role: '' }],
    }),
  ])
}

const apply = (graph: Graph, actions: readonly Action[]) =>
  actions.reduce<Graph>((current, action) => action(current), new Graph(graph))

describe('grades', () => {
  it('shows the first system in the fixed order, whatever the order of the tags', () => {
    expect(gradeOf({ 'climbing:grade:french': '5c', 'climbing:grade:uiaa': '6' })).toEqual({
      value: '6',
      system: 'UIAA',
    })
    expect(gradeOf({ 'climbing:grade:french': '6a+' })).toEqual({ value: '6a+', system: 'French' })
    expect(gradeOf({ 'climbing:grade': '7' })).toEqual({ value: '7', system: '' })
    expect(gradeOf({})).toBeUndefined()
  })
  it('names the styles tagged yes', () => {
    expect(
      stylesOf({ 'climbing:sport': 'yes', 'climbing:trad': 'no', 'climbing:multipitch': 'yes' }),
    ).toEqual(['sport', 'multipitch'])
  })
  it('bands UIAA and French roughly by difficulty', () => {
    expect(difficultyBand({ 'climbing:grade:uiaa': '4+' })).toBe(1)
    expect(difficultyBand({ 'climbing:grade:uiaa': '7+' })).toBe(4)
    expect(difficultyBand({ 'climbing:grade:french': '6a+' })).toBe(3)
    expect(difficultyBand({ 'climbing:grade:french': '7c' })).toBe(5)
    expect(difficultyBand({ 'climbing:grade:yds_class': '5.10a' })).toBeUndefined()
  })
})

describe('the climbing model', () => {
  it('knows crags, areas and routes, also a route relation', () => {
    expect(kindOf({ climbing: 'crag' })).toBe('crag')
    expect(kindOf({ type: 'route', route: 'climbing' })).toBe('route')
    expect(kindOf({ sport: 'climbing' })).toBeUndefined()
  })
  it('lists a crag’s routes in member order, numbered, with a member that is not loaded', () => {
    const graph = scene()
    const rows = cragRoutes(graph, graph.entity('r1') as OsmRelation)
    expect(rows.map((row) => [row.number, row.name, row.grade?.value, row.loaded])).toEqual([
      [1, 'A', '5-', true],
      [2, 'B', undefined, true],
      [3, 'C', '6b', true],
      [4, undefined, undefined, false],
    ])
    expect(rows[0]?.styles).toEqual(['sport'])
  })
  it('lists an area’s crags with their number of routes', () => {
    const graph = scene()
    expect(areaCrags(graph, graph.entity('r2') as OsmRelation)).toEqual([
      { id: 'r1', name: 'Wand', routes: 4 },
    ])
  })
  it('finds the crag of a route, and crags near a route that is in none', () => {
    const graph = scene()
    expect(parentsOf(graph, 'w1', 'crag').map((crag) => crag.id)).toEqual(['r1'])
    expect(parentsOf(graph, 'w3', 'crag')).toEqual([])
    const near = nearbyCrags(graph, 'w3')
    expect(near.map((item) => item.relation.id)).toEqual(['r1'])
    expect(near[0]!.metres).toBeGreaterThan(50)
    expect(near[0]!.metres).toBeLessThan(70)
    expect(nearbyCrags(graph, 'w3', 30)).toEqual([])
    // a route is not offered the crag it is in
    expect(nearbyCrags(graph, 'w1')).toEqual([])
  })
  it('adds a route at the end of a crag with an empty role', () => {
    const graph = apply(scene(), [addToRelationAction('r1', 'w3')])
    const crag = graph.entity('r1') as OsmRelation
    expect(crag.members.at(-1)).toEqual({ id: 'w3', type: 'way', role: '' })
  })
  it('makes a new crag relation with the schema’s tags and the route as its member', () => {
    const base = scene()
    const { crag, actions } = newCragActions(base, 'w3')
    const graph = apply(base, actions)
    const made = graph.entity(crag.id) as OsmRelation
    expect(made.tags).toEqual({
      type: 'site',
      site: 'climbing',
      climbing: 'crag',
      sport: 'climbing',
    })
    expect(made.members).toEqual([{ id: 'w3', type: 'way', role: '' }])
  })
})

describe('the presets of PR 2793', () => {
  const presets = createPresets(withChanges(defaultPresetData, climbingPresetChanges))
  it('apply to the schema without an error', () => {
    expect(presets).toBeDefined()
  })
  it('give a route start the new fields and a crag its styles', () => {
    const data = withChanges(defaultPresetData, climbingPresetChanges) as unknown as {
      presets: Record<string, { fields?: string[]; moreFields?: string[] }>
    }
    expect(data.presets['climbing/route_bottom']?.fields).toContain('climbing/multipitch')
    expect(data.presets['climbing/route_bottom']?.moreFields).toContain('climbing/grade/wi')
    expect(data.presets['type/site/climbing/crag']?.fields).toContain('climbing/boulder')
  })
})
