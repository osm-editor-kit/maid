// The side keys of a road on a reverse: rows A to G of docs/research/reverse-side-keys.md (Tobias, 2026-11-27)
import { describe, expect, it } from 'bun:test';
import { Graph } from '../lib/Graph.ts';
import { ModelContext } from '../Context.ts';
import { OsmNode, OsmRelation, OsmWay } from '../data/index.ts';
import { actionReverse, reverseWayTags } from './reverse.ts';

describe('reverseWayTags: the sides of a road (docs/research/reverse-side-keys.md)', () => {
  it('A: a second side of a two-way road stays', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:both': 'lane', 'cycleway:both:marking:left': 'dashed_line' })).toEqual({
      highway: 'residential',
      'cycleway:both': 'lane',
      'cycleway:both:marking:left': 'dashed_line',
    });
  });

  it('B: explicit lane directions of a two-way road keep the lanes where they ride', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:left:oneway': '-1', 'cycleway:right:oneway': 'yes' })).toEqual({
      highway: 'residential',
      'cycleway:right:oneway': 'yes',
      'cycleway:left:oneway': '-1',
    });
  });

  it('C: the road side swaps, the second side stays', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' })).toEqual({
      highway: 'residential',
      'cycleway:left': 'lane',
      'cycleway:left:separation:left': 'bollard',
    });
  });

  it('D: a two-way lane keeps its second side and its oneway=no', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:right:oneway': 'no', 'cycleway:right:separation:left': 'kerb' })).toEqual({
      highway: 'residential',
      'cycleway:left:oneway': 'no',
      'cycleway:left:separation:left': 'kerb',
    });
  });

  it('E: on a one-way road V turns the traffic round (iD), so the second side swaps; with reverseOneway it stays', () => {
    const tags = { highway: 'residential', oneway: 'yes', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' };
    expect(reverseWayTags(tags)).toEqual({
      highway: 'residential',
      oneway: 'yes',
      'cycleway:left': 'lane',
      'cycleway:left:separation:right': 'bollard',
    });
    expect(reverseWayTags(tags, { reverseOneway: true })).toEqual({
      highway: 'residential',
      oneway: '-1',
      'cycleway:left': 'lane',
      'cycleway:left:separation:left': 'bollard',
    });
  });

  it('E: a contraflow lane of a one-way road stays a contraflow lane', () => {
    expect(reverseWayTags({ highway: 'residential', oneway: 'yes', 'cycleway:left:oneway': '-1' })).toEqual({
      highway: 'residential',
      oneway: 'yes',
      'cycleway:right:oneway': '-1',
    });
    expect(reverseWayTags({ highway: 'residential', oneway: 'yes', 'cycleway:left:oneway': '-1' }, { reverseOneway: true })).toEqual({
      highway: 'residential',
      oneway: '-1',
      'cycleway:right:oneway': 'yes',
    });
  });

  it('F: a one-way cycleway swaps its separation with iD`s V and keeps it with reverseOneway', () => {
    const tags = { highway: 'cycleway', oneway: 'yes', 'separation:left': 'kerb' };
    expect(reverseWayTags(tags)).toEqual({ highway: 'cycleway', oneway: 'yes', 'separation:right': 'kerb' });
    expect(reverseWayTags(tags, { reverseOneway: true })).toEqual({ highway: 'cycleway', oneway: '-1', 'separation:left': 'kerb' });
  });

  it('G: a two-way cycleway swaps its separation, relative to the line', () => {
    expect(reverseWayTags({ highway: 'cycleway', 'separation:left': 'kerb' })).toEqual({ highway: 'cycleway', 'separation:right': 'kerb' });
  });

  it('forward and backward still swap under a road side; red_turn stays', () => {
    expect(reverseWayTags({ 'cycleway:right:lane:forward': 'exclusive', 'red_turn:right': 'no' })).toEqual({
      'cycleway:left:lane:backward': 'exclusive',
      'red_turn:right': 'no',
    });
  });
});

describe('reverseWayTags: more cases', () => {
  it('oneway=-1: V keeps it, so the traffic turns and the second side swaps; with reverseOneway the traffic stays', () => {
    const tags = { highway: 'residential', oneway: '-1', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' };
    expect(reverseWayTags(tags)).toEqual({
      highway: 'residential',
      oneway: '-1',
      'cycleway:left': 'lane',
      'cycleway:left:separation:right': 'bollard',
    });
    expect(reverseWayTags(tags, { reverseOneway: true })).toEqual({
      highway: 'residential',
      oneway: 'yes',
      'cycleway:left': 'lane',
      'cycleway:left:separation:left': 'bollard',
    });
  });

  it('oneway=reversible is no direction: nothing turns round, the second side stays', () => {
    const tags = { highway: 'residential', oneway: 'reversible', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' };
    expect(reverseWayTags(tags)).toEqual({
      highway: 'residential',
      oneway: 'reversible',
      'cycleway:left': 'lane',
      'cycleway:left:separation:left': 'bollard',
    });
  });

  it('a side with a quality key swaps its side and keeps the value: sidewalk:both:surface, parking:left:orientation', () => {
    expect(
      reverseWayTags({
        'sidewalk:both:surface': 'paving_stones',
        'sidewalk:left:surface': 'asphalt',
        'parking:left:orientation': 'parallel',
        'parking:right': 'lane',
      }),
    ).toEqual({
      'sidewalk:both:surface': 'paving_stones',
      'sidewalk:right:surface': 'asphalt',
      'parking:right:orientation': 'parallel',
      'parking:left': 'lane',
    });
  });

  it('traffic_mode:left on a one-way cycleway keeps its side with reverseOneway, and swaps with iD`s V', () => {
    const tags = { highway: 'cycleway', oneway: 'yes', 'traffic_mode:left': 'parking' };
    expect(reverseWayTags(tags)).toEqual({ highway: 'cycleway', oneway: 'yes', 'traffic_mode:right': 'parking' });
    expect(reverseWayTags(tags, { reverseOneway: true })).toEqual({ highway: 'cycleway', oneway: '-1', 'traffic_mode:left': 'parking' });
    // a two-way way of its own: tied to the line, always swaps
    expect(reverseWayTags({ highway: 'cycleway', 'traffic_mode:left': 'parking' }, { reverseOneway: true })).toEqual({
      highway: 'cycleway',
      'traffic_mode:right': 'parking',
    });
  });

  it('a oneway:bicycle road and a oneway cycleway are read the same way (item 3)', () => {
    // a road whose bicycle traffic is one-way: V keeps oneway:bicycle, the traffic turns, the second side swaps
    const road = { highway: 'residential', 'oneway:bicycle': 'yes', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' };
    expect(reverseWayTags(road)).toEqual({
      highway: 'residential',
      'oneway:bicycle': 'yes',
      'cycleway:left': 'lane',
      'cycleway:left:separation:right': 'bollard',
    });
    // with a two-way oneway:bicycle=no on a one-way road the bicycles ride both ways: nothing turns
    expect(
      reverseWayTags({ highway: 'residential', oneway: 'yes', 'oneway:bicycle': 'no', 'cycleway:right': 'lane', 'cycleway:right:separation:left': 'bollard' }),
    ).toEqual({
      highway: 'residential',
      oneway: 'yes',
      'oneway:bicycle': 'no',
      'cycleway:left': 'lane',
      'cycleway:left:separation:left': 'bollard',
    });
    // a path with oneway:bicycle=yes: its riding keys stay with reverseOneway, as with oneway=yes
    expect(
      reverseWayTags({ highway: 'path', 'oneway:bicycle': 'yes', 'separation:left': 'kerb' }, { reverseOneway: true }),
    ).toEqual({ highway: 'path', 'oneway:bicycle': 'yes', 'separation:left': 'kerb' });
    // oneway=yes with oneway:bicycle=no: the bicycles ride both ways, so the way is a two-way way of its own
    expect(
      reverseWayTags({ highway: 'path', oneway: 'yes', 'oneway:bicycle': 'no', 'separation:left': 'kerb' }, { reverseOneway: true }),
    ).toEqual({ highway: 'path', oneway: '-1', 'oneway:bicycle': 'no', 'separation:right': 'kerb' });
  });

  it('cycleway:oneway (no side) turns like the side oneway values (item 4)', () => {
    expect(reverseWayTags({ highway: 'residential', 'cycleway:oneway': 'yes' })).toEqual({ highway: 'residential', 'cycleway:oneway': '-1' });
    expect(reverseWayTags({ highway: 'residential', 'cycleway:oneway': '-1' })).toEqual({ highway: 'residential', 'cycleway:oneway': 'yes' });
    expect(reverseWayTags({ highway: 'residential', 'cycleway:oneway': 'no' })).toEqual({ highway: 'residential', 'cycleway:oneway': 'no' });
    // on a one-way road V turns the traffic, the lane stays as tagged (like the side oneway values)
    expect(reverseWayTags({ highway: 'residential', oneway: 'yes', 'cycleway:oneway': '-1' })).toEqual({
      highway: 'residential',
      oneway: 'yes',
      'cycleway:oneway': '-1',
    });
  });
});

describe('actionReverse: nodes and the whole way', () => {
  const model = new ModelContext();

  it('a node: direction=N turns to S, forward to backward', () => {
    const north = new OsmNode(model, { id: 'n-1', loc: [0, 0], tags: { direction: 'N' } });
    const forward = new OsmNode(model, { id: 'n-2', loc: [0, 0], tags: { direction: 'forward' } });
    const graph = new Graph(model, [north, forward]);
    expect(actionReverse('n-1')(new Graph(graph)).entity('n-1').tags).toEqual({ direction: 'S' });
    expect(actionReverse('n-2')(new Graph(graph)).entity('n-2').tags).toEqual({ direction: 'backward' });
  });

  it('a node of a reversed way: a compass bearing stays, forward turns', () => {
    const graph = new Graph(model, [
      new OsmNode(model, { id: 'n-1', loc: [0, 0], tags: { direction: 'N' } }),
      new OsmNode(model, { id: 'n-2', loc: [0, 1], tags: { direction: 'forward' } }),
      new OsmWay(model, { id: 'w-1', nodes: ['n-1', 'n-2'], tags: { highway: 'residential' } }),
    ]);
    const after = actionReverse('w-1')(new Graph(graph));
    expect(after.entity('n-1').tags).toEqual({ direction: 'N' });
    expect(after.entity('n-2').tags).toEqual({ direction: 'backward' });
  });

  it('end to end: the nodes, the road side keys, the second side, the lane oneway, the node and the relation role', () => {
    const graph = new Graph(model, [
      new OsmNode(model, { id: 'n-1', loc: [0, 0], tags: {} }),
      new OsmNode(model, { id: 'n-2', loc: [0, 1], tags: { traffic_sign: 'stop', direction: 'forward' } }),
      new OsmWay(model, {
        id: 'w-1',
        nodes: ['n-1', 'n-2'],
        tags: {
          highway: 'residential',
          'cycleway:right': 'track',
          'cycleway:right:oneway': 'yes',
          'cycleway:right:separation:left': 'kerb',
          'cycleway:left:oneway': 'no',
          'sidewalk:both:surface': 'asphalt',
          'sidewalk:left:surface': 'paving_stones',
          incline: '5%',
        },
      }),
      new OsmRelation(model, { id: 'r-1', members: [{ id: 'w-1', type: 'way', role: 'forward' }], tags: { type: 'route' } }),
    ]);
    const after = actionReverse('w-1')(new Graph(graph));
    expect((after.entity('w-1') as OsmWay).nodes).toEqual(['n-2', 'n-1']);
    expect(after.entity('w-1').tags).toEqual({
      highway: 'residential',
      'cycleway:left': 'track',
      'cycleway:left:oneway': '-1',
      'cycleway:left:separation:left': 'kerb',
      'cycleway:right:oneway': 'no',
      'sidewalk:both:surface': 'asphalt',
      'sidewalk:right:surface': 'paving_stones',
      incline: '-5%',
    });
    expect(after.entity('n-2').tags).toEqual({ traffic_sign: 'stop', direction: 'backward' });
    expect((after.entity('r-1') as OsmRelation).members[0]!.role).toBe('backward');
  });
});
