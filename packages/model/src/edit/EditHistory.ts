// Ported from Rapid modules/core/EditSystem.ts, ISC, © Rapid contributors. Cut: persistence, backups, UI and other systems.
import { Difference } from '../lib/Difference.ts';
import { Edit } from '../lib/Edit.ts';
import { Graph } from '../lib/Graph.ts';
import { Extent, projWgs84ToWorld } from '@rapid-sdk/math';
import { OsmEntity, createOsmEntity } from '../data/index.ts';
import { TypedEmitter } from './TypedEmitter.ts';

import type { Context } from '../Context.ts';
import type { Action } from '../actions/types.ts';
import type { OsmEntityProps, OsmNode, OsmRelation, OsmWay, Segment } from '../data/types.ts';
import type { SpatialID, SpatialIndex, SpatialItem } from '../spatial/SpatialIndex.ts';

/** A box in world coordinates, as used by the spatial index */
type WorldBox = { minX: number; minY: number; maxX: number; maxY: number };
const EVERYTHING: WorldBox = { minX: -Infinity, minY: -Infinity, maxX: Infinity, maxY: Infinity };
/** Identifies a checkpoint */
export type CheckpointID = string;


/** Options for commit/commitAppend */
export interface CommitOptions {
  /** Annotation describing the edit */
  annotation?: string | Record<string, unknown>;
  /** IDs of selected entities */
  selectedIDs?: EntityID[];
}

/** Saved checkpoint state */
interface Checkpoint {
  /** Shallow copy of history at checkpoint time */
  history: Edit[];
  /** Index at checkpoint time */
  index: number;
}

/** Changes summary returned by changes() */
export interface ChangesSummary {
  /** Newly created entities */
  created: OsmEntity[];
  /** Modified entities */
  modified: OsmEntity[];
  /** Deleted entities */
  deleted: OsmEntity[];
}


/** The events emitted by `EditHistory`, same names and payloads as in Rapid's EditSystem. */
export interface EditHistoryEvents {
  stagingchange: (difference: Difference) => void
  stablechange: (difference: Difference) => void
  historyjump: (prevIndex: number, currIndex: number) => void
  merge: (seenIDs: Set<EntityID>) => void
}

/**
 * `EditHistory` maintains the history of user edits.
 * (This used to be called 'history', but that word means something else in browsers)
 *
 * This system maintains a Base Graph, a stack of Edit history, and a `staging` Edit.
 *
 * The Base Graph contains the base map state - all map entities that have been loaded
 *   and what they look like before any edits have occurred.
 * As more map is loaded, more map features get merged into the Base Graph.
 *
 * Each entry in the history stack is an `Edit`.  An Edit may contain:
 *  - `annotation`  - undo/redo annotation, a String saying what the Edit did. e.g. "Started a Line".
 *  - `graph`       - Graph at the time of the Edit
 *  - `selectedIDs` - ids that the user had selected at the time (assumed to be OSM)
 *  - `sources`     - sources being used to make the Edit (imagery, photos, data)
 *  - `transform`   - map transform at the time of the Edit
 *
 * Special named Edits:
 *  - `base` - The initial Edit, `history[0]`.
 *     The `base` Edit contains the Base Graph and nothing else.
 *  - `stable` - The latest accepted Edit, `history[index]`.
 *     The `stable` Edit is suitable for validation, backups, saving.
 *  - `staging` - A work-in-progress Edit, not yet added to the history.
 *     The `staging` Edit is used throughout the application to determine the current map state.
 *
 *  The history might look like this:
 *  ```
 *   `base`           …undo    `stable`   redo…
 *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
 *                                 \
 *                                  \-->  EditN
 *                                       `staging` (WIP after `stable`)
 * ```
 * Code elsewhere in the application can use these methods to make edits and manipulate the history:
 * - `perform(action)` - This performs a bit of work.  Perform accepts a varible number of
 *      "action" arguments. Actions are functions that accept a Graph and return a modified Graph.
 *      All work is performed against the `staging` edit.
 * - `revert()` - This reverts all work in progress by replacing `staging` with a fresh copy of `stable`.
 * - `commit(options)` - This accepts the `staging` work-in-progress edit by adding
 *      it to the end of the history (removing any forward redo history, if any)
 *      Commit accepts an `annotation` (e.g. "Started a line") to say what the edit does.
 * - `commitAppend(options)` - This is just like `commit` but instead of
 *      adding `staging` after `stable`, `staging` replaces `stable`.
 * - `undo()` - Move the `stable` index back to the previous Edit (or `_index = 0`).
 * - `redo()` - Move the `stable` index forward to the next Edit (if any)
 * - `setCheckpoint(checkpointID)` - Save `history` and `index` as a checkpoint to return to later.
 * - `restoreCheckpoint(checkpointID)` - Restore `history` and `index` identified by checkpointID.
 *
 * Code can also wrap calls in a "transaction", which will prevent change events from being emitted.
 * - `beginTransaction()` - Prevents `stagingchange` and `stablechange` events from being emitted.
 * - `endTransaction()` - Marks transaction as complete.  Any `stagingchange` and `stablechange`
 *      events will be emitted that cover the difference from the beginning -> end of the transaction.
 *
 * Events available:
 * - 'stagingchange' - Fires on every edit performed (i.e. when `staging` changes),
 *      Receives Difference between old `staging` Graph and new `staging` Graph.
 * - 'stablechange' - Fires only when the history actually changes (i.e. when `stable` changes)
 *      Receives Difference between old `stable` Graph and new `stable` Graph.
 * - 'historyjump' - Fires on undo/redo/restore.  This is for situations when we may need to
 *      jump the user to a different part of the map and restore a different selection.
 *      Receives `prevIndex` and `currIndex`
 * - 'merge'  - Fires when new base entities are merged into the base graph
 */
export class EditHistory extends TypedEmitter<EditHistoryEvents> {

  /** The shared context (id sequences, schema) */
  public readonly context: Context;
  /**
   * The spatial index that EditHistory keeps in sync with the `base`, `stable` and `staging` graphs.
   * Undefined when the history was created without one (then nothing is indexed).
   */
  public readonly spatial: SpatialIndex | undefined;


  /** Whether there are unsaved edits relative to the last stable state */
  protected _hasWorkInProgress: boolean;

  /** The stack of committed edits; `_history[0]` is always the `base` Edit */
  protected _history: Edit[];
  /** Index into `_history` pointing to the current `stable` Edit */
  protected _index: number;
  /** The work-in-progress Edit that accumulates changes before they are committed */
  protected _staging: Edit;

  /** Named snapshots of `_history` and `_index` that can be restored */
  protected _checkpoints: Map<CheckpointID, Checkpoint>;
  /** Whether a transaction is open (suppresses intermediate change events) */
  protected _inTransaction: boolean;
  /** Per-cache tracking of which segment box ids belong to each way, so they can be removed later */
  protected _osmSegmentIDs: Map<SpatialID, Map<EntityID, EntityID[]>>;

  /** Cache key used to detect when `stable` has changed and a new backup is needed */
  protected _stableKey: string | null;
  /** Snapshot of the stable Graph captured at the last `stablechange` event */
  protected _stableSnapshot: Graph | null;
  /** Cache key used to detect when `staging` has changed */
  protected _stagingKey: string | null;
  /** Snapshot of the staging Graph captured at the last `stagingchange` event */
  protected _stagingSnapshot: Graph | null;
  /** Accumulated Difference across the entire open transaction (if any) */
  protected _fullDifference: Difference;


  /**
   * @param context - Shared context (id sequences, schema)
   * @param spatial - Optional spatial index that this history keeps in sync with its graphs.
   *  Without one, `intersects()` and `waySegments()` throw; everything else works the same.
   */
  public constructor(context: Context, spatial?: SpatialIndex) {
    super();
    this.context = context;
    this.spatial = spatial;

    this._hasWorkInProgress = false;

    this._history = [];
    this._index = 0;
    this._staging = null!;

    this._checkpoints = new Map<CheckpointID, Checkpoint>();
    this._inTransaction = false;
    this._osmSegmentIDs = new Map();

    this._stableKey = null;
    this._stableSnapshot = null;
    this._stagingKey = null;
    this._stagingSnapshot = null;
    this._fullDifference = null!;

    this._reset();
  }


  /**
   * Called after completing an edit session to reset all state, and tell listeners about it.
   */
  public reset(): void {
    const prevIndex = this._index;
    this._reset();

    // Emit all events
    this.emit('stagingchange', this._fullDifference);  // will be an empty Difference (this is ok)
    this.emit('stablechange', this._fullDifference);
    this.emit('historyjump', prevIndex, this._index);
  }


  /**
   * Internal reset of all stored data
   */
  protected _reset(): void {
    // Create a new Base Graph / Base Edit.
    const baseGraph = new Graph(this.context);
    const base = new Edit({ graph: baseGraph });
    this._history = [ base ];
    this._index = 0;

    // Create a work-in-progress Edit derived from the base edit.
    const currGraph = new Graph(baseGraph);
    const staging = new Edit({ graph: currGraph });
    this._staging = staging;
    this._hasWorkInProgress = false;

    // Clear the spatial caches.
    this.spatial?.clearMatching(id => id.startsWith('editor_'));
    this._osmSegmentIDs = new Map();

    this._stableKey = baseGraph.key;
    this._stableSnapshot = baseGraph.snapshot();
    this._stagingKey = currGraph.key;
    this._stagingSnapshot = currGraph.snapshot();
    this._fullDifference = new Difference(baseGraph, baseGraph);

    this._checkpoints.clear();
    this._inTransaction = false;
  }


  /**
   * The `base` edit is the initial edit in the history.  It contains the Base Graph.
   * It will not contain any actual user edits, sources, annotation.
   * @return The initial Edit containing the Base Graph
   */
  public get base(): Edit {
    return this._history[0];
  }

  /**
   * The `stable` edit is the latest accepted edit in the history, as indicated by `_index`.
   * The `stable` edit is suitable for validation or backups.
   * Before the user edits anything, `_index === 0`, so the `stable === base`.
   * Note that "future" redo history can continue past the `stable` edit, if the user has undone.
   * @return The latest accepted Edit in the history
   */
  public get stable(): Edit {
    return this._history[this._index];
  }

  /**
   * The `staging` edit will be a placeholder work-in-progress edit in the chain immediately
   * following the `stable` edit.  The user may be drawing a feature or editing tags.
   * The `staging` edit has not been added to the history yet.
   * @return The `staging` work-in-progress Edit
   */
  public get staging(): Edit {
    return this._staging;
  }

  /**
   * A shallow copy of the history.
   * @return A shallow copy of the history
   */
  public get history(): Edit[] {
    return this._history.slice();
  }

  /**
   * Index pointing to the current `stable` Edit
   * @return Index pointing to the current `stable` Edit
   */
  public get index(): number {
    return this._index;
  }

  /**
   * Is there work in progress in the `staging` edit?
   * @return `true` if there is work in progress in the `staging` edit.
   */
  public get hasWorkInProgress(): boolean {
    return this._hasWorkInProgress;
  }


  /**
   * This performs a bit of work.  Perform accepts a variable number of "action" arguments.
   * "Actions" are functions that accept a Graph and return a modified Graph.
   * All work is performed against the `staging` work-in-progress edit.
   * If multiple functions are passed, they will be performed in order,
   *   and an `stagingchange` event will be emitted after they have all completed.
   * @param args - Variable number of Action functions to peform
   * @return Difference between before and after of `staging` Edit
   */
  public perform(...args: Action[]): Difference | undefined {
    this._perform(args, 1);
    return this._emitChanges();   // only one place in the code uses this return - split operation?
  }


  /**
   * This reverts the `staging` work-in-progress by replacing `staging` with a fresh copy of `stable`.
   * (It's more like what `git reset --hard` does, but we can't call it "reset")
   * @return  The difference produced by reverting, or `undefined` if there was no work in progress
   */
  public revert(): Difference | undefined {
    if (!this._hasWorkInProgress) return;

    this._replaceStaging();
    return this._emitChanges();
  }


  /**
   * This finalizes the `staging` work-in-progress edit.
   * (It's somewhat like what `git commit` does.)
   *  - Set annotation, sources, and other edit metadata properties
   *  - Add the `staging` edit to the end of the history (at this point `staging` becomes `stable`)
   *  - Finally, create a new empty `staging` work-in-progress Edit
   *
   * Before calling `commit()`:
   * ```
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `staging` (WIP after Edit2)
   * ```
   * After calling `commit()`:
   * ```
   *   `base`                     …undo    `stable`
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> EditN0 ]
   *                                           \
   *                                            \-->  EditN1
   *                                                 `staging` (WIP after EditN0)
   * ```
   * @param options - Optional `Object` of options passed
   * @param options.annotation - A String saying what the Edit did. e.g. "Started a Line".
   *   Note that Rapid edits pass an Object as the annotation including more info about the edit.
   * @param options.selectedIDs - Array of selectedIDs
   */
  public commit(options: CommitOptions = {}): void {

    const staging = this.staging;

    const annotation = options.annotation ?? '';
    staging.annotation  = annotation as string;
    staging.selectedIDs = options.selectedIDs ?? [];
    // (Rapid also records `sources` and `transform` here. Not ported: they stay at their defaults.)

    // Discard forward/redo history if any, and add `staging` after `stable`
    this._history.splice(this._index + 1, Infinity, staging);
    this._index++;
    // (At this point `stable` === `staging`)

    this._replaceStaging();
    this._emitChanges();
  }


  /**
   * This is like `commit`, but instead of adding `staging` after stable,
   *   it replaces `stable` with `staging` and does not advance the history.
   * (It's somewhat like what `git commit --append` does.)
   *  - Set annotation, sources, and other edit metadata properties
   *  - Replace the `stable` edit with the `staging` edit (at this point `staging` becomes `stable`)
   *  - Finally, create a new empty `staging` work-in-progress Edit
   *
   * Note:  You can't do this if there are no edits yet - it will throw if you try to append to the `base` edit.
   *
   * Before calling `commitAppend()`:
   * ```
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `staging` (WIP after Edit2)
   * ```
   * After calling `commitAppend()`:
   * ```
   *   `base`           …undo    `stable`
   *  [ Edit0 --> … --> Edit1 --> EditN0 ]
   *                                 \
   *                                  \-->  EditN1
   *                                       `staging` (WIP after EditN0)
   * ```
   * @param options - Optional `Object` of options passed
   * @param options.annotation - A String saying what the Edit did. e.g. "Started a Line".
   *   Note that Rapid edits pass an Object as the annotation including more info about the edit.
   * @param options.selectedIDs - Array of selectedIDs
   * @throws Will throw if you try to append to the `base` edit
   */
  public commitAppend(options: CommitOptions = {}): void {

    const staging = this.staging;

    if (this._index === 0) {
      throw new Error(`Can not commitAppend to the base edit!`);
    }

    const annotation = options.annotation ?? '';
    staging.annotation  = annotation as string;
    staging.selectedIDs = options.selectedIDs ?? [];
    // (Rapid also records `sources` and `transform` here. Not ported: they stay at their defaults.)

    // Discard forward/redo history if any, and replace `stable` with `staging`.
    this._history.splice(this._index, Infinity, staging);
    // (At this point `stable` === `staging`)

    this._replaceStaging();
    this._emitChanges();
  }


  /**
   * If there is work-in-progress on the `staging` edit, revert to `stable`
   * Otherwise, move the `stable` index back to the previous Edit (or `_index = 0`).
   * Note that all work-in-progress in the `staging` Edit is lost when calling `undo()`.
   *
   * Before calling `undo()`:
   * ```
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `staging` (WIP after Edit2)
   * ```
   * After calling `undo()`:
   * ```
   *   `base`  …undo   `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                       \
   *                        \-->  EditN1
   *                             `staging` (WIP after Edit1)
   * ```
   */
  public undo(): void {

    const prevIndex = this._index;

    if (this._hasWorkInProgress) {
      this.revert();
      this.emit('historyjump', prevIndex, this._index);
      return;
    }

    if (this._index > 0) {
      this._index--;
    }

    if (this._index !== prevIndex) {
      this._replaceStaging();
      this._emitChanges();
      this.emit('historyjump', prevIndex, this._index);
    }
  }


  /**
   * Move the `stable` index forward to the next Edit (if any)
   * Note that all work-in-progress in the `staging` Edit is lost when calling `redo()`.
   *
   * Before calling `redo()`:
   * ```
   *   `base`           …undo    `stable`   redo…
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                 \
   *                                  \-->  EditN0
   *                                       `staging` (WIP after Edit2)
   * ```
   * After calling `redo()`:
   * ```
   *   `base`                     …undo    `stable`
   *  [ Edit0 --> … --> Edit1 --> Edit2 --> Edit3 ]
   *                                           \
   *                                            \-->  EditN1
   *                                                 `staging` (WIP after Edit3)
   * ```
   */
  public redo(): void {

    const prevIndex = this._index;
    if (this._index < this._history.length - 1) {
      this._index++;
    }

    if (this._index !== prevIndex) {
      this._replaceStaging();
      this._emitChanges();
      this.emit('historyjump', prevIndex, this._index);
    }
  }


  /**
   * This saves the `history` and `index` as a "checkpoint" that we can return to later.
   * If the given checkpointID exists, it will be overwritten.
   * @param checkpointID - A string to identify the checkpoint
   */
  public setCheckpoint(checkpointID: CheckpointID): void {
    if (!checkpointID) return;

    // Save a shallow copy of history, in case user undos away the edit that `_index` points to.
    this._checkpoints.set(checkpointID, {
      history: this._history.slice(),  // shallow copy
      index: this._index
    });
  }


  /**
   * This returns the `history` and `index` back to the edit identified by the given checkpointID.
   * Note that all work-in-progress in the `staging` Edit is lost when calling `restoreCheckpoint()`.
   * @param checkpointID - A string to identify the checkpoint
   */
  public restoreCheckpoint(checkpointID: CheckpointID): void {
    if (!checkpointID) return;

    const prevIndex = this._index;
    const checkpoint = this._checkpoints.get(checkpointID);

    if (checkpoint) {
      this._history = checkpoint.history.slice();   // shallow copy
      this._index = checkpoint.index;

      this._replaceStaging();
      this._emitChanges();
      this.emit('historyjump', prevIndex, this._index);
    }
  }


  /**
   * This removes the checkpoint identified by the given checkpointID.
   * @param checkpointID - A string to identify the checkpoint
   */
  public deleteCheckpoint(checkpointID: CheckpointID): void {
    if (!checkpointID) return;
    this._checkpoints.delete(checkpointID);
  }


  /**
   *  Merge new entities into the Base Graph.
   *  (Sorry, but this one is not like what `git merge` does.)
   *
   *  This function is called when we have parsed a new tile of OSM data, we will
   *   receive the new entities and a list of all entity ids that the tile contains.
   *  Can also be called in other situations, like restoring history from
   *    storage, or loading specific entities from the OSM API.
   *  This function can accept an Array of Entities or an Array of props to construct.
   *
   *  @param toMerge - Entities (or props) to merge into base graph (usually only the new ones)
   *  @param seenIDs - Optional set of all entity IDs on the tile (including previously seen ones)
   */
  public merge(toMerge: (OsmEntity | OsmEntityProps)[], seenIDs?: Set<EntityID>): void {
    const context = this.context;
    const baseGraph = this.base.graph!;
    const stagingGraph = this.staging.graph!;
    const newIDs = new Set<EntityID>();

    // Collect the Entities, create if necessary...
    const entities: OsmEntity[] = [];
    for (const entityOrProps of toMerge) {
      let entity: OsmEntity;
      if (entityOrProps instanceof OsmEntity) {
        entity = entityOrProps;
      } else {
        entity = createOsmEntity(context, entityOrProps);
      }
      entities.push(entity);

      // Which ones are really new (not in the Base Graph)?
      if (!baseGraph.hasEntity(entity.id)) {
        newIDs.add(entity.id);
      }
    }
    if (!entities.length) return;  // nothing to do


    // Note: I'd like to try to find a way to avoid seenIDs, but we probably need it for now.
    // The `emit('merge', seenIDs)` below triggers a re-render of all features on a tile,
    // even the previously seen ones. The reason is because new information could cause
    // features to render differently.  An example would be: ways that are members of
    // a large multipolygon could be part of the outer or a hole, and those ways need to
    // redraw even if different ways appear.
    // see https://github.com/facebook/Rapid/commit/4223385
    let effectiveSeenIDs: Set<EntityID>;
    if (seenIDs instanceof Set) {
      effectiveSeenIDs = seenIDs;
    } else {
      effectiveSeenIDs = new Set<EntityID>(entities.map(entity => entity.id));
    }

    // If we are merging in new relation members, bump the relation's version.
    for (const id of effectiveSeenIDs) {
      const entity = stagingGraph.hasEntity(id);
      if (entity?.type !== 'relation') continue;

      const relation = entity as OsmRelation;
      for (const member of relation.members) {
        if (newIDs.has(member.id)) {
          relation.touch();  // bump version in place
        }
      }
    }

    // Append staging graph..
    // It's not in the history yet, but it represents the current state of things.
    const graphs = this._history.map(state => state.graph!);
    graphs.push(stagingGraph);

    baseGraph.rebase(entities, graphs, false);  // force = false

    // Newly downloaded data should appear in every OSM cache (unless locally overridden).
    this._mergeIntoCache('editor_base', baseGraph, entities);
    this._mergeIntoCache('editor_stable', this.stable.graph!, entities);
    this._mergeIntoCache('editor_staging', this.staging.graph!, entities);

    this.emit('merge', effectiveSeenIDs);
  }


  /**
   * Prevents `stagingchange` and `stablechange` events from being emitted.
   * During a transaction, edits can be performed but no `change` events will be emitted.
   * This is to prevent other parts of the code from rendering/validating partial or incomplete edits.
   */
  public beginTransaction(): void {
    this._inTransaction = true;
  }


  /**
   * This marks the transaction as complete, and allows events to be emitted again.
   * Any `stagingchange` and `stablechange` events will be emitted that cover
   *   the difference from the beginning -> end of the transaction.
   * @return  The accumulated difference for the transaction, or `undefined` if nothing changed
   */
  public endTransaction(): Difference | undefined {
    this._inTransaction = false;
    return this._emitChanges();
  }


  /**
   * Finds the annotation describing the edit that would be undone next.
   * @return The previous undo annotation, or `undefined` if none
   */
  public getUndoAnnotation(): string | undefined {
    let i = this._index;
    while (i >= 0) {
      const edit = this._history[i];
      if (edit.annotation) return edit.annotation;
      i--;
    }
  }


  /**
   * Finds the annotation describing the edit that would be redone next.
   * @return The next redo annotation, or `undefined` if none
   */
  public getRedoAnnotation(): string | undefined {
    let i = this._index + 1;
    while (i <= this._history.length - 1) {
      const edit = this._history[i];
      if (edit.annotation) return edit.annotation;
      i++;
    }
  }


  /**
   * Returns the spatialID of the OSM spatial cache that corresponds to the given graph.
   * Each OSM cache reflects exactly one graph and is kept current by `EditHistory`.
   * @param graph - a graph (typically the base, stable, or staging graph)
   * @return the matching spatialID; defaults to the staging cache if no match
   */
  public spatialIDForGraph(graph: Graph): SpatialID {
    if (graph === this.base.graph) return 'editor_base';
    if (graph === this.stable.graph) return 'editor_stable';
    return 'editor_staging';
  }


  /**
   * Returns the OSM entities whose bounding boxes intersect the given box, resolved against the given graph.
   * (This replaces the old `Tree.intersects`.)
   * Rapid asks the viewport for the visible box. EditHistory has no viewport, so the caller passes the box.
   * @param graph - the graph to resolve entities against (defaults to the staging graph)
   * @param box - box in world coordinates (defaults to everything)
   * @return Entities in the box
   */
  public intersects(graph?: Graph, box: WorldBox = EVERYTHING): OsmEntity[] {
    const spatial = this.spatial;
    if (!spatial) throw new Error('EditHistory was created without a spatial index');
    const useGraph = graph ?? this.staging.graph!;
    const spatialID = this.spatialIDForGraph(useGraph);

    const results: OsmEntity[] = [];
    for (const hit of spatial.getVisibleItems(spatialID, box)) {
      const entity = useGraph.hasEntity(hit.id);
      if (entity) results.push(entity);
    }
    return results;
  }


  /**
   * Returns the way Segments whose bounding boxes intersect the given extent.
   * (This replaces the old `Tree.waySegments`.)
   * @param extent - the extent to test (WGS84 lon/lat)
   * @param graph - the graph to resolve segments against
   * @return Array of way Segments intersecting the extent
   */
  public waySegments(extent: Extent, graph: Graph): Segment[] {
    const spatial = this.spatial;
    if (!spatial) throw new Error('EditHistory was created without a spatial index');

    // Convert the WGS84 query extent to a world-coordinate box.
    const bb = extent.bbox();
    const [ax, ay] = projWgs84ToWorld([bb.minX, bb.minY]);
    const [bx, by] = projWgs84ToWorld([bb.maxX, bb.maxY]);
    const box = {
      minX: Math.min(ax, bx), minY: Math.min(ay, by),
      maxX: Math.max(ax, bx), maxY: Math.max(ay, by)
    };

    const segSpatialID = this.spatialIDForGraph(graph) + '-segments';
    return spatial.getItemsAtBox(segSpatialID, box).map(hit => hit.contents as Segment);
  }


  /**
   * Returns a `Difference` containing all edits from `base` -> `stable`
   * We use this pretty frequently, so it's cached in `this._fullDifference`
   *  and recomputed by the `_emitChanges` function only when `stable` changes.
   * @return The total changes made by the user during their edit session
   */
  public difference(): Difference {
    return this._fullDifference;
  }


  /**
   * This returns a summery of all changes made from `base` -> `stable`
   * Optionally includes a given action function to apply to the `stable` graph.
   * @param action - Optional action to apply to the `stable` graph
   * @return Object containing `modified`, `created`, `deleted` summary of changes
   */
  public changes(action?: Action): ChangesSummary {
    let difference = this._fullDifference;

    if (action) {
      const base = this.base.graph!;
      const head = action(this.stable.graph!);
      difference = new Difference(base, head);
    }

    return {
      created:  difference.created(),
      modified: difference.modified(),
      deleted:  difference.deleted()
    };
  }


  /**
   * This counts meangful edits only (modified, created, deleted).
   * For example, we could perform a bunch of no-op edits and it would still return false.
   * @return `true` if the user has made any meaningful edits
   */
  public hasChanges(): boolean {
    return this._fullDifference.changes.size > 0;
  }


  /**
   * Internal `_perform`, accepts both Actions array and eased time,
   * Performs the edits and emits no events.
   * @param actions - Array of Action functions to perform
   * @param t - Eased time, should be in the range [0..1]
   */
  protected _perform(actions: Action[], t: number = 1): void {
    // for now, call commit() before performing work.
    let graph = this._staging.graph!.commit();
    for (const fn of actions) {
      if (typeof fn === 'function') {
        graph = fn(graph, t);
      }
    }

    this._staging.graph = graph;
    this._hasWorkInProgress = true;
  }


  /**
   * This replaces the `staging` work-in-progress edit with a fresh copy of `stable`.
   * Rolls back the edits and emits no events.
   */
  protected _replaceStaging(): void {
    this._staging = new Edit({ graph: new Graph(this.stable.graph!) });
    this._hasWorkInProgress = false;
  }


  /**
   * Update an OSM spatial cache to reflect the changes in a `Difference`.
   * Called immediately before emitting the corresponding change event, so that
   *  listeners can rely on the spatial cache being current.
   * @param spatialID - the OSM spatial cache to update (e.g. 'editor_staging' or 'editor_stable')
   * @param graph - the head graph of the difference (staging or stable)
   * @param diff - the difference to apply
   */
  protected _syncCacheFromDiff(spatialID: SpatialID, graph: Graph, diff: Difference): void {
    const spatial = this.spatial;
    if (!spatial) return;

    // `complete()` includes the changed entities plus their affected parents/children.
    // A value of `undefined` means the entity no longer exists in the head graph.
    const complete = diff.complete();

    const toReplace: OsmEntity[] = [];
    const toRemove: EntityID[] = [];
    for (const [entityID, entity] of complete) {
      if (entity) {
        toReplace.push(entity);
      } else {
        toRemove.push(entityID);
      }
    }

    spatial.removeItems(spatialID, toRemove);
    spatial.replaceData(spatialID, toReplace);

    // Keep way segments in sync for any affected ways.
    for (const entityID of toRemove) {
      this._removeWaySegments(spatialID, entityID);  // safe even if it wasn't a way
    }
    for (const entity of toReplace) {
      if (entity.type === 'way') {
        this._updateWaySegments(spatialID, entity as OsmWay, graph);
      }
    }
  }


  /**
   * Merge newly-downloaded entities into an OSM cache that reflects the given graph.
   * New base data should appear in the cache unless the graph locally overrides or deletes it.
   * @param spatialID - the OSM spatial cache to update
   * @param graph - the graph this cache reflects (base, stable, or staging)
   * @param entities - the newly-merged entities
   */
  protected _mergeIntoCache(spatialID: SpatialID, graph: Graph, entities: OsmEntity[]): void {
    const spatial = this.spatial;
    if (!spatial) return;

    const toReplace: OsmEntity[] = [];
    for (const entity of entities) {
      const current = graph.hasEntity(entity.id);  // a local override or deletion wins
      if (current?.visible) {
        toReplace.push(current);
      } else {
        spatial.removeItems(spatialID, entity.id);
        this._removeWaySegments(spatialID, entity.id);
      }
    }

    spatial.replaceData(spatialID, toReplace);

    for (const entity of toReplace) {
      if (entity.type === 'way') {
        this._updateWaySegments(spatialID, entity as OsmWay, graph);
      }
    }
  }


  /**
   * Get (or create) the per-way segment-id tracking map for an OSM cache.
   * @param spatialID - the OSM spatial cache
   * @return Map of wayID to its segment box ids
   */
  protected _segmentTracker(spatialID: SpatialID): Map<EntityID, EntityID[]> {
    let tracker = this._osmSegmentIDs.get(spatialID);
    if (!tracker) {
      tracker = new Map<EntityID, EntityID[]>();
      this._osmSegmentIDs.set(spatialID, tracker);
    }
    return tracker;
  }


  /**
   * Build `SpatialItem`s (with world-coordinate extents) for a way's segments.
   * @param way - the way whose segments to build
   * @param graph - the graph holding the node positions
   * @return Array of SpatialItems, one per segment
   */
  protected _segmentItems(way: OsmWay, graph: Graph): SpatialItem[] {
    const items: SpatialItem[] = [];
    for (const seg of way.segments(graph)) {
      const n0 = graph.hasEntity(seg.edge[0]) as OsmNode | undefined;
      const n1 = graph.hasEntity(seg.edge[1]) as OsmNode | undefined;
      if (!n0?.loc || !n1?.loc) continue;

      const [ax, ay] = projWgs84ToWorld(n0.loc);
      const [bx, by] = projWgs84ToWorld(n1.loc);
      const extent = new Extent(
        [Math.min(ax, bx), Math.min(ay, by)],
        [Math.max(ax, bx), Math.max(ay, by)]
      );

      const item = Object.assign({ id: seg.id, contents: seg }, extent.bbox()) as SpatialItem;
      items.push(item);
    }
    return items;
  }


  /**
   * Add or update a way's segments in an OSM spatial cache, tracking the segment ids
   *  so they can be removed later even if the segment count changes.
   * @param spatialID - the OSM spatial cache to update
   * @param way - the way whose segments to index
   * @param graph - the graph holding the node positions
   */
  protected _updateWaySegments(spatialID: SpatialID, way: OsmWay, graph: Graph): void {
    const spatial = this.spatial;
    if (!spatial) return;

    const tracker = this._segmentTracker(spatialID);
    const prevIDs = tracker.get(way.id);
    const segSpatialID = spatialID + '-segments';
    if (prevIDs?.length) {
      spatial.removeItems(segSpatialID, prevIDs);
    }

    const items = this._segmentItems(way, graph);
    if (items.length) {
      spatial.replaceItems(segSpatialID, items);
      tracker.set(way.id, items.map(item => item.id));
    } else {
      tracker.delete(way.id);
    }
  }


  /**
   * Remove a way's tracked segments from an OSM spatial cache.
   * No-op if the id is not a tracked way.
   * @param spatialID - the OSM spatial cache to update
   * @param wayID - the wayID whose segments to remove
   */
  protected _removeWaySegments(spatialID: SpatialID, wayID: EntityID): void {
    const spatial = this.spatial;
    if (!spatial) return;

    const tracker = this._segmentTracker(spatialID);
    const prevIDs = tracker.get(wayID);
    const segSpatialID = spatialID + '-segments';
    if (prevIDs?.length) {
      spatial.removeItems(segSpatialID, prevIDs);
    }
    tracker.delete(wayID);
  }


  /**
   * Recalculate the differences and emit `stablechange` and `stagingchange` events.
   * @return Difference between before and after of `staging` Edit
   */
  protected _emitChanges(): Difference | undefined {
    if (this._inTransaction) return;

    const baseGraph = this.base.graph!;
    const stableGraph = this.stable.graph!;
    const stagingGraph = this.staging.graph!;
    let stagingDifference: Difference | undefined;

    // Note: `this._hasWorkInProgress` is included here because in some cases the graph
    // won't actually change - for example an Action that exits early or "performs" a no-op.
    // We still want to generate an empty Difference and emit 'stagingchange' in these situations.
    if (this._stagingKey !== stagingGraph.key || this._hasWorkInProgress) {
      stagingDifference = new Difference(this._stagingSnapshot!, stagingGraph);
      this._syncCacheFromDiff('editor_staging', stagingGraph, stagingDifference);
      this._stagingKey = stagingGraph.key;
      this._stagingSnapshot = stagingGraph.snapshot();
      this.emit('stagingchange', stagingDifference);
    }

    if (this._stableKey !== stableGraph.key) {
      this._fullDifference = new Difference(baseGraph, stableGraph);
      const stableDifference = new Difference(this._stableSnapshot!, stableGraph);
      this._syncCacheFromDiff('editor_stable', stableGraph, stableDifference);
      this._stableKey = stableGraph.key;
      this._stableSnapshot = stableGraph.snapshot();
      this.emit('stablechange', stableDifference);
          }

    return stagingDifference;  // only one place in the code uses this return - split operation?
  }

}
