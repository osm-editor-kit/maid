// Adopted from iD test/spec/actions/reverse.js (ISC, © iD contributors), at commit 0194f3926.
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('actionReverse', () => {
  const context = new Rapid.MockContext();

  describe('reverses directional tags on nodes', () => {
    // needs F-actions-b-23 (iD splits the value on ';' and reverses each part)
    it.todo('reverses directions with multiple semicolon separated values');
    // needs F-actions-b-23
    it.todo('reverses directions with multiple semicolon separated values, preserves non-directional part');
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

    // needs F-actions-b-21 (Maid turns side=right into side=left)
    it.todo('preserves the value of the side tag of a cycling waiting aid');

    // needs F-actions-b-21 (Maid turns railway:turnout_side=right into left)
    it.todo('preserves the value of railway:turnout_side');

    // needs F-actions-b-22 (Maid renames red_turn:right to red_turn:left)
    it.todo('preserves the direction of a red turn at a traffic signal');
  });
});
