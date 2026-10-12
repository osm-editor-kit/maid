// Adopted from iD test/spec/actions/join.js (ISC, © iD contributors), at commit 0194f3926.
// Only the iD tests that have no counterpart in test/actions/join.test.js are here. The other 34 pair with
// Rapid's tests by title (see the report). Coordinates are iD's planar values, used as lon/lat, as in Rapid's tests.
import { beforeAll, describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';
import osmRulesets from '../../../src/schema/osm_rulesets.json5';


describe('iD.actionJoin', () => {
  const context = new Rapid.MockContext();
  context.systems.schema = new Rapid.SchemaSystem(context);

  beforeAll(() => {
    const schema = context.systems.schema;
    schema.requestedAssetIDs = '';
    return schema.initAsync()
      .then(() => schema.merge(osmRulesets));
  });

  it('keeps the oldest id - oldest first', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [4, 0] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [6, 0] }),
      new Rapid.OsmWay(context, { id: 'w1', nodes: ['a', 'b'] }),
      new Rapid.OsmWay(context, { id: 'w2', nodes: ['b', 'c'] }),
      new Rapid.OsmWay(context, { id: 'w3', nodes: ['c', 'd'] })
    ]);
    let graph = new Rapid.Graph(base);
    graph = Rapid.actionJoin(['w1', 'w2', 'w3'])(graph);

    expect(graph.entity('w1').nodes).toEqual(['a', 'b', 'c', 'd']);
    expect(graph.hasEntity('w2')).toBeUndefined();
    expect(graph.hasEntity('w3')).toBeUndefined();
  });

  it('keeps the oldest id - oldest last', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [4, 0] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [6, 0] }),
      new Rapid.OsmWay(context, { id: 'w3', nodes: ['a', 'b'] }),
      new Rapid.OsmWay(context, { id: 'w2', nodes: ['b', 'c'] }),
      new Rapid.OsmWay(context, { id: 'w1', nodes: ['c', 'd'] })
    ]);
    let graph = new Rapid.Graph(base);
    graph = Rapid.actionJoin(['w3', 'w2', 'w1'])(graph);

    expect(graph.entity('w1').nodes).toEqual(['a', 'b', 'c', 'd']);
    expect(graph.hasEntity('w2')).toBeUndefined();
    expect(graph.hasEntity('w3')).toBeUndefined();
  });

  it('keeps the oldest id - oldest middle', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [2, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [4, 0] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [6, 0] }),
      new Rapid.OsmWay(context, { id: 'w2', nodes: ['a', 'b'] }),
      new Rapid.OsmWay(context, { id: 'w1', nodes: ['b', 'c'] }),
      new Rapid.OsmWay(context, { id: 'w3', nodes: ['c', 'd'] })
    ]);
    let graph = new Rapid.Graph(base);
    graph = Rapid.actionJoin(['w2', 'w1', 'w3'])(graph);

    expect(graph.entity('w1').nodes).toEqual(['a', 'b', 'c', 'd']);
    expect(graph.hasEntity('w2')).toBeUndefined();
    expect(graph.hasEntity('w3')).toBeUndefined();
  });

  // iD's summable tags (step_count, parking capacities) are added up when both ways have a number.
  // Without that rule, these three tests still get 'conflicting_tags', because the two values differ.
  // So they pass, but they do not test the summing rule (see F-actions-b-5).
  it('returns conflicting_tags when the first way has a non-numeric summable tag', () => {
    const graph = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [4, 0] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b'], tags: { highway: 'steps', step_count: 'many' } }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['b', 'c'], tags: { highway: 'steps', step_count: '10' } })
    ]);
    expect(Rapid.actionJoin(['-', '=']).disabled(graph)).toEqual('conflicting_tags');
  });

  it('returns conflicting_tags when the second way has a non-numeric summable tag', () => {
    const graph = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [4, 0] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b'], tags: { highway: 'steps', step_count: '10' } }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['b', 'c'], tags: { highway: 'steps', step_count: 'bbb' } })
    ]);
    expect(Rapid.actionJoin(['-', '=']).disabled(graph)).toEqual('conflicting_tags');
  });

  it('returns conflicting_tags when both ways have non-numeric summable tags', () => {
    const graph = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [4, 0] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b'], tags: { highway: 'steps', step_count: 'many' } }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['b', 'c'], tags: { highway: 'steps', step_count: 'lots' } })
    ]);
    expect(Rapid.actionJoin(['-', '=']).disabled(graph)).toEqual('conflicting_tags');
  });

  // needs F-actions-b-10 (iD adds up summable tags such as step_count when both ways have numbers)
  it.todo('merges the number of steps', () => {
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [1, 0] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [4, 0] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b'], tags: { highway: 'steps', step_count: '12' } }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['b', 'c'], tags: { highway: 'steps', step_count: '30' } })
    ]);
    let graph = new Rapid.Graph(base);
    graph = Rapid.actionJoin(['-', '='])(graph);
    // step count should be merged
    expect(graph.entity('-').tags.step_count).toEqual('42');
  });

  it('transfers memberships of collapsed single-member multipolygon onto resulting basic area', () => {
    // Situation: same as above, but the multipolygon relation was also
    // a member of a site relation. #9064
    const base = new Rapid.Graph(context, [
      new Rapid.OsmNode(context, { id: 'a', loc: [0, 0] }),
      new Rapid.OsmNode(context, { id: 'b', loc: [0, 2] }),
      new Rapid.OsmNode(context, { id: 'c', loc: [2, 2] }),
      new Rapid.OsmNode(context, { id: 'd', loc: [2, 0] }),
      new Rapid.OsmWay(context, { id: '-', nodes: ['a', 'b', 'c', 'd'] }),
      new Rapid.OsmWay(context, { id: '=', nodes: ['d', 'a'] }),
      new Rapid.OsmRelation(context, { id: 'm', members: [
        { id: '-', role: 'outer', type: 'way' },
        { id: '=', role: 'outer', type: 'way' }
      ], tags: {
        type: 'multipolygon',
        man_made: 'pier'
      } }),
      new Rapid.OsmRelation(context, { id: 's', members: [
        { id: 'm', role: 'main', type: 'relation' }
      ], tags: {
        type: 'site'
      } })
    ]);
    let graph = new Rapid.Graph(base);
    graph = Rapid.actionJoin(['-', '='])(graph);

    expect(graph.hasEntity('s')).toBeDefined();
    expect(graph.entity('s').members.length).toEqual(1);
    expect(graph.entity('s').members[0]).toEqual(
      { id: '-', role: 'main', type: 'way' }
    );
  });
});
