import {
  Graph,
  ModelContext,
  OsmNode,
  OsmWay,
  type Graph as GraphType,
} from '@osm-editor-kit/maid-model'

/**
 * A four-way crossing: the vertex `c` at the centre, with four residential roads that end there: `wn` (north),
 * `we` (east), `ws` (south), `ww` (west). Each road is 0.0002 degrees (about 22 m) long.
 */
export function crossing(): { context: ModelContext; graph: GraphType } {
  const context = new ModelContext()
  const graph = new Graph(context, [
    new OsmNode(context, { id: 'c', loc: [0, 0] }),
    new OsmNode(context, { id: 'nn', loc: [0, 0.0002] }),
    new OsmNode(context, { id: 'ne', loc: [0.0002, 0] }),
    new OsmNode(context, { id: 'ns', loc: [0, -0.0002] }),
    new OsmNode(context, { id: 'nw', loc: [-0.0002, 0] }),
    new OsmWay(context, {
      id: 'wn',
      nodes: ['c', 'nn'],
      tags: { highway: 'residential', name: 'North' },
    }),
    new OsmWay(context, {
      id: 'we',
      nodes: ['c', 'ne'],
      tags: { highway: 'residential', name: 'East' },
    }),
    new OsmWay(context, {
      id: 'ws',
      nodes: ['c', 'ns'],
      tags: { highway: 'residential', ref: 'S 1' },
    }),
    new OsmWay(context, { id: 'ww', nodes: ['c', 'nw'], tags: { highway: 'residential' } }),
  ])
  return { context, graph }
}
