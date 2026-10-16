// Small graphs for the cut tests: entities built with the model, in metres near Berlin, no fixture and no network.
import {
  Graph,
  ModelContext,
  OsmNode,
  OsmRelation,
  OsmWay,
  type OsmEntity,
  type SchemaLookup,
} from '@osm-editor-kit/maid-model'
import type { Loc } from './cut.ts'

/** A context whose tagging schema says `building` and `leisure` are area keys, so a closed building way is an area */
const context = new ModelContext()
context.systems.schema = {
  getScope: () => ({
    variables: new Map(),
    rulesets: new Map(),
    areaKeys: { building: {}, leisure: {} },
  }),
  removeLifecyclePrefix: (key: string) => key,
  matchTags: () => null,
} as unknown as SchemaLookup

const LON0 = 13.4
const LAT0 = 52.5
const DEGREE = (Math.PI * 6378137) / 180
const KX = DEGREE * Math.cos((LAT0 * Math.PI) / 180)
const KY = DEGREE

/** The position x metres east and y metres north of the test origin */
export function at(x: number, y: number): Loc {
  return [LON0 + x / KX, LAT0 + y / KY]
}

export function node(id: string, x: number, y: number): OsmNode {
  return new OsmNode(context, { id, loc: at(x, y) })
}

export function way(id: string, nodes: string[], tags: Record<string, string> = {}): OsmWay {
  return new OsmWay(context, { id, nodes, tags })
}

export function relation(
  id: string,
  tags: Record<string, string>,
  members: { id: string; type: 'way'; role: string }[],
): OsmRelation {
  return new OsmRelation(context, { id, tags, members })
}

export function graphOf(...entities: OsmEntity[]): Graph {
  return new Graph(context, entities)
}

/** A 10 m square n0 (0,0), n1 (10,0), n2 (10,10), n3 (0,10) as the closed way `w1` with the given tags */
export function square(tags: Record<string, string> = { building: 'yes' }): OsmEntity[] {
  return [
    node('n0', 0, 0),
    node('n1', 10, 0),
    node('n2', 10, 10),
    node('n3', 0, 10),
    way('w1', ['n0', 'n1', 'n2', 'n3', 'n0'], tags),
  ]
}
