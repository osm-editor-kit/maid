// Adopted from iD test/spec/actions/reverse.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('actionReverse', () => {
  const context = new Rapid.MockContext();

  describe('reverses directional tags on nodes', () => {
    it('reverses directions with multiple semicolon separated values', () => {
      const node1 = new Rapid.OsmNode(context, { tags: { 'direction': 'N;90' } });
      const base = new Rapid.Graph(context, [node1]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(node1.id)(graph);
      expect(result.entity(node1.id).tags).toEqual({ 'direction': 'S;270' });
    });

    it('reverses directions with multiple semicolon separated values, preserves non-directional part', () => {
      const node1 = new Rapid.OsmNode(context, { tags: { 'direction': '0;error' } });
      const base = new Rapid.Graph(context, [node1]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(node1.id)(graph);
      expect(result.entity(node1.id).tags).toEqual({ 'direction': '180;error' });
    });
  });

  describe('directionless nodes', () => {
    // needs F-actions-b-20 (the node's preset decides which direction key to add)
    it.todo('adds a direction tag to directionless nodes if the preset has a direction field');
    // needs F-actions-b-20
    it.todo('adds a direction tag to directionless nodes if the preset has a direction field under moreFields');
    // needs F-actions-b-20
    it.todo('does not add a direction tag to directionless nodes if the preset has no direction field');
    // needs F-actions-b-20
    it.todo('adds a custom direction tag to directionless nodes if the preset has a custom direction field');
  });

  describe('does not reverse values which are relative to another reversed tag', () => {
    it('preserves the turn direction of a single lane road', () => {
      const way = new Rapid.OsmWay(context, { tags: { 'turn:lanes': 'right' } });
      const base = new Rapid.Graph(context, [way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(way.id).tags['turn:lanes']).toEqual('right');
    });

    it('preserves the turn directions of a multi-lane road', () => {
      const way = new Rapid.OsmWay(context, { tags: { 'turn:lanes': 'through|through|right' } });
      const base = new Rapid.Graph(context, [way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(way.id).tags['turn:lanes']).toEqual('through|through|right');
    });

    // https://github.com/openstreetmap/iD/issues/5674
    it('preserves the turn direction of each direction with a single lane', () => {
      const way = new Rapid.OsmWay(context, { tags: { 'turn:lanes:forward': 'right', 'turn:lanes:backward': 'left' } });
      const base = new Rapid.Graph(context, [way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(way.id).tags['turn:lanes:backward']).toEqual('right');
      expect(result.entity(way.id).tags['turn:lanes:forward']).toEqual('left');
    });

    it('preserves the turn direction of each direction with multiple lanes', () => {
      const way = new Rapid.OsmWay(context, {
        tags: { 'turn:lanes:forward': 'through|right', 'turn:lanes:backward': 'through|through|left' }
      });
      const base = new Rapid.Graph(context, [way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(way.id).tags['turn:lanes:backward']).toEqual('through|right');
      expect(result.entity(way.id).tags['turn:lanes:forward']).toEqual('through|through|left');
    });

    it('preserves the turn direction of explicitly bidirectional turn lane values', () => {
      const way = new Rapid.OsmWay(context, { tags: { 'turn:lanes:both_ways': 'left' } });
      const base = new Rapid.Graph(context, [way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(way.id).tags['turn:lanes:both_ways']).toEqual('left');
    });

    it('preserves the value of the side tag of a cycling waiting aid', () => {
      const node1 = new Rapid.OsmNode(context);
      const node2 = new Rapid.OsmNode(context, { tags: { 'highway': 'cyclist_waiting_aid', 'direction': 'forward', 'side': 'right' } });
      const node3 = new Rapid.OsmNode(context);
      const way = new Rapid.OsmWay(context, { nodes: [node1.id, node2.id, node3.id] });
      const base = new Rapid.Graph(context, [node1, node2, node3, way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(node2.id).tags['direction']).toEqual('backward');
      expect(result.entity(node2.id).tags['side']).toEqual('right');
    });

    it('preserves the value of railway:turnout_side', () => {
      const node1 = new Rapid.OsmNode(context);
      const node2 = new Rapid.OsmNode(context, { tags: { 'direction': 'forward', 'railway:turnout_side': 'right' } });
      const node3 = new Rapid.OsmNode(context);
      const way = new Rapid.OsmWay(context, { nodes: [node1.id, node2.id, node3.id] });
      const base = new Rapid.Graph(context, [node1, node2, node3, way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(node2.id).tags['direction']).toEqual('backward');
      expect(result.entity(node2.id).tags['railway:turnout_side']).toEqual('right');
    });

    it('preserves the direction of a red turn at a traffic signal', () => {
      const node1 = new Rapid.OsmNode(context);
      const node2 = new Rapid.OsmNode(context, {
        tags: {
          'highway': 'traffic_signals',
          'traffic_signals:direction': 'forward',
          'red_turn:right': 'no',
          'red_turn:right:bicycle': 'yes'
        }
      });
      const node3 = new Rapid.OsmNode(context);
      const way = new Rapid.OsmWay(context, { nodes: [node1.id, node2.id, node3.id] });
      const base = new Rapid.Graph(context, [node1, node2, node3, way]);
      const graph = new Rapid.Graph(base);
      const result = Rapid.actionReverse(way.id)(graph);
      expect(result.entity(node2.id).tags['traffic_signals:direction']).toEqual('backward');
      expect(result.entity(node2.id).tags['red_turn:right']).toEqual('no');
      expect(result.entity(node2.id).tags['red_turn:right:bicycle']).toEqual('yes');
    });
  });
});
