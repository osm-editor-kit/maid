// Adopted from iD test/spec/actions/merge_remote_changes.js (ISC, © iD contributors), at commit 0194f3926.
// Only the seven tests whose Rapid ports drop iD's `action.conflicts()` check are here. The other twenty
// are in test/actions/merge_remote_changes.test.js. The setup block is iD's, with the unused w3 left out.
// iD's `toEqual(localGraph)` is written as `toBe(localGraph)`: the action returns the same graph object when it
// records a conflict (Rapid's port uses strictEqual for the same check).
import { describe, expect, it } from 'bun:test';
import * as Rapid from '../../rapid.ts';

describe('iD.actionMergeRemoteChanges', () => {
  const context = new Rapid.MockContext();
  const discardTags = { created_by: true };

  const base = new Rapid.Graph(context, [
    new Rapid.OsmNode(context, { id: 'a', loc: [1, 1], version: '1', tags: { foo: 'foo' } }),

    new Rapid.OsmNode(context, { id: 'p1', loc: [10, 10], version: '1' }),
    new Rapid.OsmNode(context, { id: 'p2', loc: [10, -10], version: '1' }),
    new Rapid.OsmNode(context, { id: 'p3', loc: [-10, -10], version: '1' }),
    new Rapid.OsmNode(context, { id: 'p4', loc: [-10, 10], version: '1' }),
    new Rapid.OsmWay(context, {
      id: 'w1',
      nodes: ['p1', 'p2', 'p3', 'p4', 'p1'],
      version: '1',
      tags: { foo: 'foo', area: 'yes' }
    }),

    new Rapid.OsmNode(context, { id: 'q1', loc: [5, 5], version: '1' }),
    new Rapid.OsmNode(context, { id: 'q2', loc: [5, -5], version: '1' }),
    new Rapid.OsmNode(context, { id: 'q3', loc: [-5, -5], version: '1' }),
    new Rapid.OsmNode(context, { id: 'q4', loc: [-5, 5], version: '1' }),
    new Rapid.OsmWay(context, {
      id: 'w2',
      nodes: ['q1', 'q2', 'q3', 'q4', 'q1'],
      version: '1',
      tags: { foo: 'foo', area: 'yes' }
    }),

    new Rapid.OsmRelation(context, {
      id: 'r',
      members: [{ id: 'w1', role: 'outer' }, { id: 'w2', role: 'inner' }],
      version: '1',
      tags: { type: 'multipolygon', foo: 'foo' }
    })
  ]);

  // some new objects not in the graph yet..
  const r1 = new Rapid.OsmNode(context, { id: 'r1', loc: [12, 12], version: '1' });
  const r2 = new Rapid.OsmNode(context, { id: 'r2', loc: [12, -12], version: '1' });
  const r3 = new Rapid.OsmNode(context, { id: 'r3', loc: [-12, -12], version: '1' });
  const r4 = new Rapid.OsmNode(context, { id: 'r4', loc: [-12, 12], version: '1' });

  const s1 = new Rapid.OsmNode(context, { id: 's1', loc: [6, 6], version: '1' });
  const s2 = new Rapid.OsmNode(context, { id: 's2', loc: [6, -6], version: '1' });
  const s3 = new Rapid.OsmNode(context, { id: 's3', loc: [-6, -6], version: '1' });
  const s4 = new Rapid.OsmNode(context, { id: 's4', loc: [-6, 6], version: '1' });
  const w4 = new Rapid.OsmWay(context, {
    id: 'w4',
    nodes: ['s1', 's2', 's3', 's4', 's1'],
    version: '1',
    tags: { foo: 'foo_new', area: 'yes' }
  });

  function makeGraph(entities: Rapid.OsmEntity[]) {
    const staging = new Rapid.Graph(base);
    staging.replace(entities);
    return staging.commit();
  }

  describe('non-destuctive merging', () => {
    describe('tags', () => {
      it('doesn\'t merge tags if conflict (local change, remote change)', () => {
        const localTags = { foo: 'foo_local' };      // changed foo
        const remoteTags = { foo: 'foo_remote' };    // changed foo
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = Rapid.actionMergeRemoteChanges('a', { localGraph, remoteGraph, discardTags });
        const result = action(localGraph);

        expect(result).toBe(localGraph);
        expect(action.conflicts()).toHaveLength(1);
      });

      it('doesn\'t merge tags if conflict (local change, remote delete)', () => {
        const localTags = { foo: 'foo_local' };     // changed foo
        const remoteTags = {};                      // deleted foo
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = Rapid.actionMergeRemoteChanges('a', { localGraph, remoteGraph, discardTags });
        const result = action(localGraph);

        expect(result).toBe(localGraph);
        expect(action.conflicts()).toHaveLength(1);
      });

      it('doesn\'t merge tags if conflict (local delete, remote change)', () => {
        const localTags = {};                       // deleted foo
        const remoteTags = { foo: 'foo_remote' };   // changed foo
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = Rapid.actionMergeRemoteChanges('a', { localGraph, remoteGraph, discardTags });
        const result = action(localGraph);

        expect(result).toBe(localGraph);
        expect(action.conflicts()).toHaveLength(1);
      });

      it('doesn\'t merge tags if conflict (local add, remote add)', () => {
        const localTags = { foo: 'foo', bar: 'bar_local' };    // same foo, added bar
        const remoteTags = { foo: 'foo', bar: 'bar_remote' };  // same foo, added bar
        const local = base.entity('a').update({ tags: localTags });
        const remote = base.entity('a').update({ tags: remoteTags, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = Rapid.actionMergeRemoteChanges('a', { localGraph, remoteGraph, discardTags });
        const result = action(localGraph);

        expect(result).toBe(localGraph);
        expect(action.conflicts()).toHaveLength(1);
      });
    });

    describe('ways', () => {
      it('doesn\'t merge ways if nodelist changes overlap', () => {
        const localTags = { foo: 'foo_local', area: 'yes' };                // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', area: 'yes' };   // same foo, added bar
        const localNodes = ['p1', 'r1', 'r2', 'p3', 'p4', 'p1'];             // changed p2 -> r1, r2
        const remoteNodes = ['p1', 'r3', 'r4', 'p3', 'p4', 'p1'];            // changed p2 -> r3, r4
        const local = base.entity('w1').update({ tags: localTags, nodes: localNodes });
        const remote = base.entity('w1').update({ tags: remoteTags, nodes: remoteNodes, version: '2' });
        const localGraph = makeGraph([local, r1, r2]);
        const remoteGraph = makeGraph([remote, r3, r4]);
        const action = Rapid.actionMergeRemoteChanges('w1', { localGraph, remoteGraph, discardTags });
        const result = action(localGraph);

        expect(result).toBe(localGraph);
        expect(action.conflicts()).toHaveLength(1);
      });

      it('doesn\'t merge ways if childNode location is different', () => {
        const localLoc = [12, 12];     // moved node
        const remoteLoc = [13, 13];    // moved node
        const local = base.entity('p1').update({ loc: localLoc });
        const remote = base.entity('p1').update({ loc: remoteLoc, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote]);
        const action = Rapid.actionMergeRemoteChanges('w1', { localGraph, remoteGraph, discardTags });
        const result = action(localGraph);

        expect(result).toBe(localGraph);
        expect(action.conflicts()).toHaveLength(1);
      });
    });

    describe('relations', () => {
      it('doesn\'t merge relations if members have changed', () => {
        const localTags = { foo: 'foo_local', type: 'multipolygon' };                   // changed foo
        const remoteTags = { foo: 'foo', bar: 'bar_remote', type: 'multipolygon' };      // same foo, added bar
        const localMembers = [{ id: 'w1', role: 'outer' }, { id: 'w2', role: 'inner' }];  // same members
        const remoteMembers = [{ id: 'w1', role: 'outer' }, { id: 'w4', role: 'inner' }]; // changed inner to w4
        const local = base.entity('r').update({ tags: localTags, members: localMembers });
        const remote = base.entity('r').update({ tags: remoteTags, members: remoteMembers, version: '2' });
        const localGraph = makeGraph([local]);
        const remoteGraph = makeGraph([remote, s1, s2, s3, s4, w4]);
        const action = Rapid.actionMergeRemoteChanges('r', { localGraph, remoteGraph, discardTags });
        const result = action(localGraph);

        expect(result).toBe(localGraph);
        expect(action.conflicts()).toHaveLength(1);
      });
    });
  });
});
