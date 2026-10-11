import { beforeEach, describe, it, mock } from 'bun:test';
import { assert } from 'chai';
import * as Rapid from '../rapid.ts';
import { EditHistory } from '../../src/edit/EditHistory.ts';
import { SpatialIndex } from '../../src/spatial/SpatialIndex.ts';


describe('EditHistory', () => {
  // Setup context..
  const context = new Rapid.MockContext();

  function actionAddNode(nodeID) {
    return (graph) => graph.replace(new Rapid.OsmNode(context, { id: nodeID })).commit();
  }

  // Test construction and startup of the system..
  describe('lifecycle', () => {
    describe('constructor', () => {
      it('constructs an EditHistory from a context and a spatial index', () => {
        const spatial = new SpatialIndex();
        const editor = new EditHistory(context, spatial);
        assert.instanceOf(editor, EditHistory);
        assert.strictEqual(editor.context, context);
        assert.strictEqual(editor.spatial, spatial);
        assert.lengthOf(editor.history, 1);
        assert.strictEqual(editor.index, 0);
      });

      it('on() returns an unsubscribe function', () => {
        const editor = new EditHistory(context, new SpatialIndex());
        const onStagingChange = mock();
        const off = editor.on('stagingchange', onStagingChange);
        editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 1);
        off();
        editor.perform(actionAddNode('n-2'));
        assert.lengthOf(onStagingChange.mock.calls, 1);
      });
    });

    describe('reset', () => {
      it('resets without error', () => {
        const editor = new EditHistory(context, new SpatialIndex());
        editor.reset();
        assert.lengthOf(editor.history, 1);
      });

      it('clears the history stack', () => {
        const editor = new EditHistory(context, new SpatialIndex());
        editor.commit({ annotation: 'one' });
        editor.commit({ annotation: 'two' });
        editor.undo();
        editor.reset();
        assert.isArray(editor._history, Array);
        assert.lengthOf(editor._history, 1);
        assert.strictEqual(editor._index, 0);
      });

      it('emits events', () => {
        const editor = new EditHistory(context, new SpatialIndex());
        const onStagingChange = mock();
        const onStableChange = mock();
        const onHistoryJump = mock();
        editor.on('stagingchange', onStagingChange);
        editor.on('stablechange', onStableChange);
        editor.on('historyjump', onHistoryJump);

        editor.reset();
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 1);
        assert.lengthOf(onHistoryJump.mock.calls, 1);

        assert.deepEqual(onStagingChange.mock.lastCall[0], editor._fullDifference);
        assert.deepEqual(onStableChange.mock.lastCall[0], editor._fullDifference);
        assert.strictEqual(onHistoryJump.mock.lastCall[0], 0);
        assert.strictEqual(onHistoryJump.mock.lastCall[1], 0);
      });
    });
  });


  // Test an already-constructed instance of the system..
  describe('methods', () => {
    let _editor;

    beforeEach(() => {
      _editor = new EditHistory(context, new SpatialIndex());
    });


    // Some tests use this to prepare the EditHistory for testing add, update, remove, differences.
    // After calling this, the history will contain:
    //   Base graph contains "n1", "n2", "n3"
    //   Edit1:  "added n-1"
    //   Edit2:  "updated n2"
    //   Edit3:  "deleted n3"
    function prepareTestHistory() {
      const node_1 = new Rapid.OsmNode(context, { id: 'n-1' });
      const node1 = new Rapid.OsmNode(context, { id: 'n1' });
      const node2 = new Rapid.OsmNode(context, { id: 'n2' });
      const node3 = new Rapid.OsmNode(context, { id: 'n3' });

      _editor.merge([node1, node2, node3]);   // merge base entities

      _editor.perform(Rapid.actionAddEntity(node_1));
      _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });

      _editor.perform(Rapid.actionChangeTags('n2', { natural: 'tree' } ));
      _editor.commit({ annotation: 'updated n2', selectedIDs: ['n2'] });

      _editor.perform(Rapid.actionDeleteNode('n3'));
      _editor.commit({ annotation: 'deleted n3', selectedIDs: [] });
    }


    describe('base', () => {
      it('returns the base edit', () => {
        assert.instanceOf(_editor.base, Rapid.Edit);
        assert.strictEqual(_editor.base, _editor._history[0]);
      });
    });

    describe('stable', () => {
      it('returns the stable edit', () => {
        _editor.commit({ annotation: 'one' });
        assert.instanceOf(_editor.stable, Rapid.Edit);
        assert.strictEqual(_editor.stable, _editor._history[1]);
      });
    });

    describe('staging', () => {
      it('returns the staging edit', () => {
        _editor.commit({ annotation: 'one' });
        assert.instanceOf(_editor.staging, Rapid.Edit);
        assert.notStrictEqual(_editor.staging, _editor.stable);
        assert.notStrictEqual(_editor.staging, _editor.base);
      });
    });

    describe('history', () => {
      it('returns the history', () => {
        assert.isArray(_editor.history, Array);
        assert.lengthOf(_editor.history, 1);
      });
    });

    describe('index', () => {
      it('returns the index', () => {
        assert.strictEqual(_editor.index, 0);
      });
    });

    describe('hasWorkInProgress', () => {
      it('returns true when work has been performed on the staging edit', () => {
        assert.isFalse(_editor.hasWorkInProgress);
        _editor.perform(Rapid.actionNoop());
        assert.isTrue(_editor.hasWorkInProgress);
      });
    });


    describe('merge', () => {
      it('merges the entities into all graph versions', () => {
        const n = new Rapid.OsmNode(context, { id: 'n1' });
        _editor.merge([n]);
        assert.strictEqual(_editor.base.graph.entity('n1'), n);
        assert.strictEqual(_editor.stable.graph.entity('n1'), n);
        assert.strictEqual(_editor.staging.graph.entity('n1'), n);
      });

      it('emits a merge event with the new entities', () => {
        const n = new Rapid.OsmNode(context, { id: 'n1' });
        const onMerge = mock();
        _editor.on('merge', onMerge);
        _editor.merge([n]);
        assert.lengthOf(onMerge.mock.calls, 1);
        assert.deepEqual(onMerge.mock.lastCall[0], new Set([n.id]));  // first argument
      });
    });


    describe('waySegments', () => {
      // Two ways crossing at the origin:  w1 is vertical (n1-n2), w2 is horizontal (n3-n4)
      function mergeCrossingWays() {
        const n1 = new Rapid.OsmNode(context, { id: 'n1', loc: [0, -1] });
        const n2 = new Rapid.OsmNode(context, { id: 'n2', loc: [0,  1] });
        const n3 = new Rapid.OsmNode(context, { id: 'n3', loc: [-1, 0] });
        const n4 = new Rapid.OsmNode(context, { id: 'n4', loc: [ 1, 0] });
        const w1 = new Rapid.OsmWay(context, { id: 'w1', nodes: ['n1', 'n2'] });
        const w2 = new Rapid.OsmWay(context, { id: 'w2', nodes: ['n3', 'n4'] });
        _editor.merge([n1, n2, n3, n4, w1, w2]);
      }

      it('indexes way segments and finds them by extent', () => {
        mergeCrossingWays();
        const extent = new Rapid.sdk.Extent([-0.5, -0.5], [0.5, 0.5]);
        const segments = _editor.waySegments(extent, _editor.base.graph);
        const wayIDs = new Set(segments.map(s => s.wayID));
        assert.isTrue(wayIDs.has('w1'));
        assert.isTrue(wayIDs.has('w2'));
      });

      it('returns no segments outside the queried extent', () => {
        mergeCrossingWays();
        const extent = new Rapid.sdk.Extent([10, 10], [11, 11]);  // far away
        const segments = _editor.waySegments(extent, _editor.base.graph);
        assert.isEmpty(segments);
      });

      it('removes a way\'s segments from the stable cache when the way is deleted', () => {
        mergeCrossingWays();
        const extent = new Rapid.sdk.Extent([-0.5, -0.5], [0.5, 0.5]);
        assert.isNotEmpty(_editor.waySegments(extent, _editor.base.graph));

        _editor.perform(Rapid.actionDeleteWay('w1'));
        _editor.commit({ annotation: 'deleted w1' });

        const segments = _editor.waySegments(extent, _editor.stable.graph);
        const wayIDs = new Set(segments.map(s => s.wayID));
        assert.isFalse(wayIDs.has('w1'));  // w1 segments gone
        assert.isTrue(wayIDs.has('w2'));   // w2 segments remain
      });
    });


    describe('perform', () => {
      it('returns a Difference', () => {
        const diff = _editor.perform(Rapid.actionNoop());
        assert.instanceOf(diff, Rapid.Difference);
        assert.instanceOf(diff.changes, Map);
        assert.isEmpty(diff.changes);
      });

      it('returns an empty Difference when passed no args', () => {
        const diff = _editor.perform();
        assert.instanceOf(diff, Rapid.Difference);
        assert.instanceOf(diff.changes, Map);
        assert.isEmpty(diff.changes);
      });

      it('updates the staging graph only', () => {
        const staging = _editor.staging.graph;
        const stagingKey = staging.key;
        const stable = _editor.stable.graph;
        const stableKey = stable.key;

        _editor.perform(actionAddNode('n-1'));
        assert.isUndefined(_editor.base.graph.hasEntity('n-1'));
        assert.isUndefined(_editor.stable.graph.hasEntity('n-1'));
        assert.isOk(_editor.staging.graph.hasEntity('n-1'));
        assert.notStrictEqual(_editor.staging.graph.key, stagingKey);  // staging changed
        assert.strictEqual(_editor.stable.graph.key, stableKey);       // same stable
      });

      it('emits an stagingchange event only', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        const action = Rapid.actionNoop();
        const difference = _editor.perform(action);
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.deepEqual(onStagingChange.mock.lastCall[0], difference);  // first argument
        assert.lengthOf(onStableChange.mock.calls, 0);
      });

      it('performs multiple actions, emits a single stagingchange event', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        const action1 = actionAddNode('n-1');
        const action2 = actionAddNode('n-2');
        const difference = _editor.perform(action1, action2);
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.deepEqual(onStagingChange.mock.lastCall[0], difference);  // first argument
        assert.lengthOf(onStableChange.mock.calls, 0);
      });
    });


    describe('revert', () => {
      it('replaces staging with a fresh copy of stable', () => {
        _editor.perform(actionAddNode('n-1'));
        assert.isOk(_editor.staging.graph.hasEntity('n-1'));
        assert.isTrue(_editor.hasWorkInProgress);

        const staging = _editor.staging;
        const stable = _editor.stable;

        _editor.revert();
        assert.isUndefined(_editor.staging.graph.hasEntity('n-1'));
        assert.isFalse(_editor.hasWorkInProgress);
        assert.notStrictEqual(_editor.staging, staging);  // new staging
        assert.strictEqual(_editor.stable, stable);       // same stable
      });

      it('emits stagingchange and stablechange events', () => {
        _editor.perform(actionAddNode('n-1'));

        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        _editor.revert();
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 0);
      });

      it('does nothing if no work in progress', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        const staging = _editor.staging;
        const stable = _editor.stable;

        _editor.revert();
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);
        assert.strictEqual(_editor.staging, staging);   // same staging
        assert.strictEqual(_editor.stable, stable);     // same stable
      });
    });


    describe('commit', () => {
      it('commit work in progress to history', () => {
        assert.isArray(_editor.history, Array);
        assert.lengthOf(_editor.history, 1);
        assert.strictEqual(_editor.index, 0);
        assert.isUndefined(_editor.staging.graph.hasEntity('n-1'));
        assert.isUndefined(_editor.staging.graph.hasEntity('n-2'));

        _editor.perform(actionAddNode('n-1'));
        _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });

        assert.lengthOf(_editor.history, 2);
        assert.strictEqual(_editor.index, 1);
        assert.isOk(_editor.staging.graph.hasEntity('n-1'));
        assert.isUndefined(_editor.staging.graph.hasEntity('n-2'));

        _editor.perform(actionAddNode('n-2'));
        _editor.commit({ annotation: 'added a node', selectedIDs: ['n-2'] });

        assert.lengthOf(_editor.history, 3);
        assert.strictEqual(_editor.index, 2);
        assert.isOk(_editor.staging.graph.hasEntity('n-1'));
        assert.isOk(_editor.staging.graph.hasEntity('n-2'));
      });

      it('emits stagingchange and stablechange events', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        _editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });
        assert.lengthOf(onStagingChange.mock.calls, 2);
        assert.lengthOf(onStableChange.mock.calls, 1);

        _editor.perform(actionAddNode('n-2'));
        assert.lengthOf(onStagingChange.mock.calls, 3);
        assert.lengthOf(onStableChange.mock.calls, 1);

        _editor.commit({ annotation: 'added a node', selectedIDs: ['n-2'] });
        assert.lengthOf(onStagingChange.mock.calls, 4);
        assert.lengthOf(onStableChange.mock.calls, 2);
      });
    });


    describe('commitAppend', () => {
      it('throws if you try to commitAppend to the base edit', () => {
        _editor.perform(actionAddNode('n-1'));
        const fn = () => _editor.commitAppend('added a node');
        assert.throws(fn, /can not commitAppend to the base edit/i);
      });

      it('commitAppend work in progress to history', () => {
        assert.isArray(_editor.history, Array);
        assert.lengthOf(_editor.history, 1);
        assert.strictEqual(_editor.index, 0);
        assert.isUndefined(_editor.staging.graph.hasEntity('n-1'));
        assert.isUndefined(_editor.staging.graph.hasEntity('n-2'));

        _editor.perform(actionAddNode('n-1'));
        _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });

        assert.lengthOf(_editor.history, 2);
        assert.strictEqual(_editor.index, 1);
        assert.isOk(_editor.staging.graph.hasEntity('n-1'));
        assert.isUndefined(_editor.staging.graph.hasEntity('n-2'));

        _editor.perform(actionAddNode('n-2'));
        _editor.commitAppend({ annotation: 'added a node', selectedIDs: ['n-2'] });  // commitAppend

        assert.lengthOf(_editor.history, 2);   // still 2
        assert.strictEqual(_editor.index, 1);  // still 1
        assert.isOk(_editor.staging.graph.hasEntity('n-1'));
        assert.isOk(_editor.staging.graph.hasEntity('n-2'));
      });

      it('emits stagingchange and stablechange events', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        _editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.commit({ annotation: 'added a node', selectedIDs: ['n-1'] });
        assert.lengthOf(onStagingChange.mock.calls, 2);
        assert.lengthOf(onStableChange.mock.calls, 1);

        _editor.perform(actionAddNode('n-2'));
        assert.lengthOf(onStagingChange.mock.calls, 3);
        assert.lengthOf(onStableChange.mock.calls, 1);

        _editor.commitAppend({ annotation: 'added a node', selectedIDs: ['n-2'] });  // commitAppend
        assert.lengthOf(onStagingChange.mock.calls, 4);
        assert.lengthOf(onStableChange.mock.calls, 2);
      });
    });


    describe('undo / #redo', () => {
      it('can undo and redo edits', () => {
        _editor.perform(actionAddNode('n-1'));
        _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
        _editor.perform(actionAddNode('n-2'));
        _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
        _editor.perform(actionAddNode('n-3'));
        _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });

        assert.strictEqual(_editor.getUndoAnnotation(), 'added n-3');
        assert.isUndefined(_editor.getRedoAnnotation());
        assert.isOk(_editor.stable.graph.hasEntity('n-3'));

        _editor.undo();

        assert.strictEqual(_editor.getUndoAnnotation(), 'added n-2');
        assert.strictEqual(_editor.getRedoAnnotation(), 'added n-3');
        assert.isUndefined(_editor.stable.graph.hasEntity('n-3'));

        _editor.redo();

        assert.strictEqual(_editor.getUndoAnnotation(), 'added n-3');
        assert.isUndefined(_editor.getRedoAnnotation());
        assert.isOk(_editor.stable.graph.hasEntity('n-3'));
      });

      it('emits stagingchange, stablechange, and historyjump events', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        const onHistoryJump = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);
        _editor.on('historyjump', onHistoryJump);

        _editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 0);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
        assert.lengthOf(onStagingChange.mock.calls, 2);
        assert.lengthOf(onStableChange.mock.calls, 1);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.perform(actionAddNode('n-2'));
        assert.lengthOf(onStagingChange.mock.calls, 3);
        assert.lengthOf(onStableChange.mock.calls, 1);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
        assert.lengthOf(onStagingChange.mock.calls, 4);
        assert.lengthOf(onStableChange.mock.calls, 2);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.perform(actionAddNode('n-3'));
        assert.lengthOf(onStagingChange.mock.calls, 5);
        assert.lengthOf(onStableChange.mock.calls, 2);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });
        assert.lengthOf(onStagingChange.mock.calls, 6);
        assert.lengthOf(onStableChange.mock.calls, 3);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.undo();
        assert.lengthOf(onStagingChange.mock.calls, 7);
        assert.lengthOf(onStableChange.mock.calls, 4);
        assert.lengthOf(onHistoryJump.mock.calls, 1);

        _editor.redo();
        assert.lengthOf(onStagingChange.mock.calls, 8);
        assert.lengthOf(onStableChange.mock.calls, 5);
        assert.lengthOf(onHistoryJump.mock.calls, 2);
      });

      it('does nothing if nothing to undo', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        const onHistoryJump = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);
        _editor.on('historyjump', onHistoryJump);

        _editor.undo();
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);
        assert.lengthOf(onHistoryJump.mock.calls, 0);
      });

      it('does nothing if nothing to redo', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        const onHistoryJump = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);
        _editor.on('historyjump', onHistoryJump);

        _editor.redo();
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);
        assert.lengthOf(onHistoryJump.mock.calls, 0);
      });
    });


    describe('setCheckpoint / #restoreCheckpoint', () => {
      it('can set and restore checkpoints', () => {
        _editor.perform(actionAddNode('n-1'));
        _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });

        _editor.setCheckpoint('checkpoint');

        _editor.perform(actionAddNode('n-2'));
        _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
        _editor.perform(actionAddNode('n-3'));
        _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });

        _editor.restoreCheckpoint('checkpoint');

        assert.strictEqual(_editor.getUndoAnnotation(), 'added n-1');
        assert.isUndefined(_editor.getRedoAnnotation());
        assert.isOk(_editor.stable.graph.hasEntity('n-1'));
        assert.isUndefined(_editor.stable.graph.hasEntity('n-2'));
        assert.isUndefined(_editor.stable.graph.hasEntity('n-3'));
      });

      it('emits stagingchange, stablechange, and historyjump events', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        const onHistoryJump = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);
        _editor.on('historyjump', onHistoryJump);

        _editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 0);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
        _editor.setCheckpoint('checkpoint');
        assert.lengthOf(onStagingChange.mock.calls, 2);
        assert.lengthOf(onStableChange.mock.calls, 1);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.perform(actionAddNode('n-2'));
        assert.lengthOf(onStagingChange.mock.calls, 3);
        assert.lengthOf(onStableChange.mock.calls, 1);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
        assert.lengthOf(onStagingChange.mock.calls, 4);
        assert.lengthOf(onStableChange.mock.calls, 2);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.perform(actionAddNode('n-3'));
        assert.lengthOf(onStagingChange.mock.calls, 5);
        assert.lengthOf(onStableChange.mock.calls, 2);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.commit({ annotation: 'added n-3', selectedIDs: ['n-3'] });
        assert.lengthOf(onStagingChange.mock.calls, 6);
        assert.lengthOf(onStableChange.mock.calls, 3);
        assert.lengthOf(onHistoryJump.mock.calls, 0);

        _editor.restoreCheckpoint('checkpoint');
        assert.lengthOf(onStagingChange.mock.calls, 7);
        assert.lengthOf(onStableChange.mock.calls, 4);
        assert.lengthOf(onHistoryJump.mock.calls, 1);
      });

      it('does nothing if checkpointID is missing or invalid', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        const onHistoryJump = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);
        _editor.on('historyjump', onHistoryJump);

        _editor.restoreCheckpoint();
        _editor.restoreCheckpoint('fake');
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);
        assert.lengthOf(onHistoryJump.mock.calls, 0);
      });
    });


    describe('beginTransaction / #endTransaction', () => {
      it('prevents change events from getting dispatched in a transaction', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        _editor.beginTransaction();

        _editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.perform(actionAddNode('n-2'));
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.endTransaction();   // events emit here
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 1);

        // diff should contain all things changed during the transaction
        const diff = onStagingChange.mock.lastCall[0];  // first argument
        assert.instanceOf(diff, Rapid.Difference);
        assert.instanceOf(diff.changes, Map);
        assert.hasAllKeys(diff.changes, ['n-1', 'n-2']);
      });

      it('does nothing if endTransaction called without beginTransaction', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        _editor.endTransaction();

        _editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
        assert.lengthOf(onStagingChange.mock.calls, 2);
        assert.lengthOf(onStableChange.mock.calls, 1);
      });

      it('uses earliest difference if beginTransaction called multiple times', () => {
        const onStagingChange = mock();
        const onStableChange = mock();
        _editor.on('stagingchange', onStagingChange);
        _editor.on('stablechange', onStableChange);

        _editor.beginTransaction();

        _editor.perform(actionAddNode('n-1'));
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.commit({ annotation: 'added n-1', selectedIDs: ['n-1'] });
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        // This beginTransaction has no effect - we are already in a transaction
        _editor.beginTransaction();

        _editor.perform(actionAddNode('n-2'));
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.commit({ annotation: 'added n-2', selectedIDs: ['n-2'] });
        assert.lengthOf(onStagingChange.mock.calls, 0);
        assert.lengthOf(onStableChange.mock.calls, 0);

        _editor.endTransaction();   // events emit here
        assert.lengthOf(onStagingChange.mock.calls, 1);
        assert.lengthOf(onStableChange.mock.calls, 1);

        // diff should contain all things changed during the transaction
        const diff = onStagingChange.mock.lastCall[0];  // first argument
        assert.instanceOf(diff, Rapid.Difference);
        assert.instanceOf(diff.changes, Map);
        assert.hasAllKeys(diff.changes, ['n-1', 'n-2']);
      });
    });


    describe('difference / #hasChanges / #changes', () => {
      it('returns the difference between base -> stable', () => {
        prepareTestHistory();

        assert.isTrue(_editor.hasChanges());

        const diff = _editor.difference();
        assert.instanceOf(diff, Rapid.Difference);
        assert.instanceOf(diff.changes, Map);
        assert.hasAllKeys(diff.changes, ['n-1', 'n2', 'n3']);

        const detail = _editor.changes();
        assert.isObject(detail);
        assert.hasAllKeys(detail, ['created', 'modified', 'deleted']);

        const stable = _editor.stable.graph;
        const base = _editor.base.graph;
        assert.strictEqual(detail.created[0], stable.entity('n-1'));
        assert.strictEqual(detail.modified[0], stable.entity('n2'));
        assert.strictEqual(detail.deleted[0], base.entity('n3'));
      });
    });
  });
});
