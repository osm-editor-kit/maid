import { Difference } from './Difference.ts';
import { utilIterable } from '../util/iterable.ts';

import type { Context } from '../Context.ts';
import type { Iterable, OneOrMore } from '../util/iterable.ts';
import type { OsmEntity, OsmNode, OsmRelation, OsmWay } from '../data/types.ts';


/**
 * Properties object for a Graph
 */
export interface GraphProps {
  /** Unique string to identify this Graph */
  id: GraphID;
  /** Internal version of the Graph, can be used to detect changes */
  v: number;
}


/**
 * Internal cache structure used to store entities and their relationships
 */
export interface GraphCache {
  /** Map<entityID, OsmEntity> - stores all entities */
  entities: Map<EntityID, OsmEntity | undefined>;
  /** Map<entityID, Set<entityIDs>> - maps child IDs to parent Way IDs */
  parentWays: Map<EntityID, Set<EntityID>>;
  /** Map<entityID, Set<entityIDs>> - maps child IDs to parent Relation IDs */
  parentRels: Map<EntityID, Set<EntityID>>;
}


/**
 * A `Graph` is a special collection of OSM Entities.
 * Each graph contains a "base" state (uneditied) and "local" state (edited).
 * The graph also contains all the caches and methods needed to manage OSM topology.
 *
 * In previous versions of the code, `Graph` was written in an immutable style,
 * so that calls to `replace`/`remove`/`revert` would return a new `Graph`.
 * This became a performance concern, so now `Graphs` are transactional.
 * You can call these methods anytme to make modifications to the `Graph`,
 * but then you must call `commit` to update any Entities that rely on the `Graph`.
 *
 * Properties available:
 * - `id`    - Unique string to identify this Graph
 * - `v`     - Internal version of the Graph, can be used to detect changes
 * - `props` - Properties object
 */
export class Graph {

  /** Unique string identifier for this Graph */
  public id: GraphID;
  /** Global shared application context */
  public context: Context;
  /** Properties object (id, v) */
  public props: GraphProps;
  /** Whether this is the initial base Graph (vs a derived/edited Graph) */
  public isBaseGraph: boolean;
  /** The preceding Graph in the edit chain (null for the base Graph) */
  public previous: Graph | null;
  /** Shared base cache for unedited entities (shared with all descendant Graphs) */
  public base: GraphCache;
  /** Local (edited) entity cache, cloned from the predecessor Graph on construction */
  public local: GraphCache;
  /**
   * Maid: differs from Rapid here. The `local.entities` entries of the ids written since the last `commit()`,
   * as they were before the first of those writes (`_recordWrite`). Rapid kept a full copy of the Graph at
   * each commit and diffed the whole `local` map against it, which costs O(all edits of the session).
   */
  protected _written: Map<EntityID, { had: boolean, value: OsmEntity | undefined, seq: number }>;
  /**
   * Maid: differs from Rapid here. `true` once `commit()` has run on this Graph, so `_written` holds every
   * change since then. A Graph copied from another (or a snapshot) diffs its first commit against `previous`.
   */
  protected _tracked: boolean;
  /**
   * Maid: differs from Rapid here. The position of each key of `local.entities`, as a number that grows with
   * each new key. Rapid's `Difference` visits the changed ids in the order of the `local` Map, and the order
   * decides which parent relations `complete()` reaches; `commit()` sorts the written ids by these numbers to
   * visit them in that same order (see `_setLocal`).
   */
  protected _seqs: Map<EntityID, number>;
  /** Maid: differs from Rapid here. The last number given out in `_seqs`. */
  protected _clock: number;


  /**
   * @param  otherOrContext  - copy another Graph, or pass application context
   * @param  propsOrEntities - optional properties or base Entities to include in the graph.
   */
  public constructor(otherOrContext: Graph | Context, propsOrEntities: OsmEntity[] | Partial<GraphProps> = {}) {
    this.id = '';  // put this first so debug inspect shows it first
    this._written = new Map();  // Maid: differs from Rapid here (see `_written`)
    this._tracked = false;

    // A Graph derived from a predecessor Graph
    if (otherOrContext instanceof Graph) {  // copy other
      const other = otherOrContext;
      this.context = other.context;
      this.props = {} as GraphProps;
      this.isBaseGraph = false;
      this.previous = other;

      this.base = other.base;     // Base cache is shared among the chain of Graphs
      this.local = {              // Local data is a clone of the predecessor data
        entities:    new Map<EntityID, OsmEntity | undefined>(other.local.entities),  // shallow clone
        parentWays:  new Map<EntityID, Set<EntityID>>(other.local.parentWays),        // shallow clone
        parentRels:  new Map<EntityID, Set<EntityID>>(other.local.parentRels)         // shallow clone
      };
      this._seqs = new Map(other._seqs);  // Maid: differs from Rapid here (see `_seqs`)
      this._clock = other._clock;

    // A fresh Graph
    } else {
      const context = otherOrContext as Context;
      this.context = context;
      this.props = {} as GraphProps;
      this.isBaseGraph = true;
      this.previous = null;

      this.base = {
        entities:    new Map<EntityID, OsmEntity | undefined>(),
        parentWays:  new Map<EntityID, Set<EntityID>>(),
        parentRels:  new Map<EntityID, Set<EntityID>>()
      };
      this.local = {
        entities:    new Map<EntityID, OsmEntity | undefined>(),
        parentWays:  new Map<EntityID, Set<EntityID>>(),
        parentRels:  new Map<EntityID, Set<EntityID>>()
      };
      this._seqs = new Map();  // Maid: differs from Rapid here (see `_seqs`)
      this._clock = 0;
    }

    // Deal with extra argument
    if (Array.isArray(propsOrEntities)) {
      const toRebase = propsOrEntities;
      this.rebase(toRebase);   // seed with base Entities, if provided

    } else {
      const props = propsOrEntities;
      Object.assign(this.props, structuredClone(props));  // override with passed in props
    }

    if (!this.props.id) {  // no ID provided - generate one
      this.props.id = 'g-' + this.context.next('graph');
    }

    // For consistency, offer a `this.id` property.
    this.id = this.props.id;
  }


  /**
   * Remove all saved state and free memory.
   * Do not use the Graph after calling `destroy()`.
   */
  public destroy(): void {
    this.base = null!;
    this.local = null!;
    this.previous = null;
    this.props = null!;
    this.context = null!;
  }


  /**
   * Unique string to identify this Graph.
   * @return  This graph's unique ID
   * @readonly
   */
  public get graphID(): string {
    return this.id;
  }

  /**
   * Internal version of the Graph, can be used to detect changes.
   * @return  Version counter
   * @readonly
   */
  public get v(): number {
    return this.props.v || 0;
  }

  /**
   * The 'key' includes both the id and the version
   * @return  Combined `id + version` key string
   * @readonly
   */
  public get key(): string {
    return `${this.id}v${this.v}`;
  }

  /**
   * Bump internal version number in place (typically, forcing a rerender)
   * Note that this version number always increases and is shared by all data elements.
   * We did it this way to avoid situations where you undo to a previous version
   *  you don't want it to increment it back to the same version and appear unchanged.
   * @see Rapid@9ac2776a
   * @return   this Graph
   */
  public touch(): Graph {
    this.props.v = this.context.next('v');
    return this;
  }


  /**
   * Gets an OsmEntity, searches the local cache first, then the base cache.
   * @param   entityID - The entityID to lookup
   * @return  OsmEntity from either local or base cache, or `undefined` if not found.
   */
  public hasEntity(entityID: EntityID): OsmEntity | undefined {
    const base = this.base.entities;
    const local = this.local.entities;
    return local.has(entityID) ? local.get(entityID) : base.get(entityID);
  }


  /**
   * Gets an OsmEntity, searches the local cache first, then the base cache.
   * (same as `hasEntity` but throws if not found)
   * @param   entityID - The entityID to lookup
   * @return  OsmEntity from either local or base cache
   * @throws  Will throw if the entity is not found
   */
  public entity(entityID: EntityID): OsmEntity {
    const entity = this.hasEntity(entityID);
    if (!entity) {
      throw new Error(`OsmEntity ${entityID} not found`);
    }
    return entity;
  }


  /**
   * Makes an Array containing parent Ways for the given OsmEntity.
   * Makes a shallow copy (i.e. the Array is new, but the Entities in it are references)
   * @param   entity - The OsmEntity to get parentWays for
   * @return  Array of parent Ways
   * @throws  Will throw if any parent Way is not found
   */
  public parentWays(entity: OsmEntity): OsmWay[] {
    const base = this.base.parentWays;
    const local = this.local.parentWays;
    const parentIDs = local.get(entity.id) ?? base.get(entity.id) ?? new Set<EntityID>();
    return Array.from(parentIDs).map(parentID => this.entity(parentID) as OsmWay);
  }


  /**
   * Makes an Array containing parent Relations for the given OsmEntity.
   * Makes a shallow copy (i.e. the Array is new, but the Entities in it are references)
   * @param   entity - The OsmEntity to get parentRelations for
   * @return  Array of parent Relations
   * @throws  Will throw if any parent Relation is not found
   */
  public parentRelations(entity: OsmEntity): OsmRelation[] {
    const base = this.base.parentRels;
    const local = this.local.parentRels;
    const parentIDs = local.get(entity.id) ?? base.get(entity.id) ?? new Set<EntityID>();
    return Array.from(parentIDs).map(parentID => this.entity(parentID) as OsmRelation);
  }


  /**
   * Makes an Array containing child Nodes for the given OsmEntity.
   * Makes a shallow copy (i.e. the Array is new, but the Entities in it are references)
   * @param   entity - The OsmEntity to get childNodes for
   * @return  Array of child Nodes
   */
  public childNodes(entity: OsmWay): OsmNode[] {
    if (!entity.nodes) return [];  // not a way?
    return entity.nodes.map(nodeID => this.entity(nodeID) as OsmNode);
  }


  /**
   * Replace an OsmEntity in this Graph
   * @param   entities - entities to replace
   * @return  this Graph
   * @throws  Will throw if called on a base graph
   */
  public replace(entities: OneOrMore<OsmEntity>): Graph {
    if (this.isBaseGraph) {
      throw new Error(`Do not call 'replace' on a base graph`);
    }

    const arr = [...utilIterable(entities)].sort(this._nodesFirst);
    for (const entity of arr) {
      const entityID = entity.id;
      const current = this.hasEntity(entityID);
      if (current === entity) continue;  // no change

      this._setLocal(entityID, entity);  // Maid: differs from Rapid here (see `_written`)
      this._updateCaches(current, entity);
    }
    return this.touch();
  }


  /**
   * Remove an OsmEntity from this Graph
   * @param   entities - entities to remove
   * @return  this Graph
   * @throws  Will throw if called on a base graph
   */
  public remove(entities: OneOrMore<OsmEntity>): Graph {
    if (this.isBaseGraph) {
      throw new Error(`Do not call 'remove' on a base graph`);
    }

    const arr = [...utilIterable(entities)].sort(this._nodesFirst);
    for (const entity of arr) {
      const entityID = entity.id;
      const current = this.hasEntity(entityID);
      if (!current) continue;  // not in the graph

      this._setLocal(entityID, undefined);  // Maid: differs from Rapid here (see `_written`)
      this._updateCaches(current, undefined);
    }
    return this.touch();
  }


  /**
   * Revert an OsmEntity back to whatever state it had in the base graph
   * @param   entityIDs - the entityIDs of the Entities to revert
   * @return  this Graph
   * @throws  Will throw if called on a base graph
   */
  public revert(entityIDs: OneOrMore<EntityID>): Graph {
    if (this.isBaseGraph) {
      throw new Error(`Do not call 'revert' on a base graph`);
    }

    for (const entityID of utilIterable(entityIDs) as EntityID[]) {
      const original = this.base.entities.get(entityID);
      const current = this.hasEntity(entityID);
      if (current === original) continue;   // no change

      this._deleteLocal(entityID);  // Maid: differs from Rapid here (see `_written`)
      this._updateCaches(current, original);
    }
    return this.touch();
  }


  /**
   * Updates any Entities affected by the work in progress
   * @return  this Graph
   */
  public commit(): Graph {
    // Maid: differs from Rapid here (see `_written`). Rapid diffed this Graph against `previous`, a full
    // copy taken at the last commit, so every commit cost O(all edits of the session). Now the diff covers
    // only the ids written since the last commit. Both sides are views that `Difference` reads through
    // `hasEntity`, `local.entities` and the parent lookups: the "before" side answers from the pre-images
    // in `_written` and from the shared base (as the copy did), the "after" side from this Graph. An id
    // that was not written is the same on both sides, so `Difference` finds the same changes as before.
    // The first commit of a Graph copied from another (or a snapshot) has no pre-images: it diffs against
    // `previous` as Rapid does.
    let diff: Difference;
    if (this._tracked) {
      // The ids in the order `Difference` would meet them: the keys of `local` (in their order there), then
      // the keys the last commit had and this one has not (in their order there). Only the written ids can differ.
      const written = this._written;
      const local = this.local.entities;
      const inLocal = [...written.keys()].filter(id => local.has(id));
      inLocal.sort((a, b) => this._seqs.get(a)! - this._seqs.get(b)!);
      const gone = [...written].filter(([id, pre]) => pre.had && !local.has(id)).map(([id]) => id);
      gone.sort((a, b) => written.get(a)!.seq - written.get(b)!.seq);

      const before = {
        local: { entities: new Map<EntityID, undefined>([...inLocal, ...gone].map((id): [EntityID, undefined] => [id, undefined])) },
        hasEntity: (id: EntityID): OsmEntity | undefined => {
          const pre = written.get(id)!;
          return pre.had ? pre.value : this.base.entities.get(id);
        },
      } as unknown as Graph;
      const after = {
        local: { entities: new Map<EntityID, undefined>(inLocal.map((id): [EntityID, undefined] => [id, undefined])) },
        hasEntity: (id: EntityID): OsmEntity | undefined => this.hasEntity(id),
        parentWays: (entity: OsmEntity): OsmWay[] => this.parentWays(entity),
        parentRelations: (entity: OsmEntity): OsmRelation[] => this.parentRelations(entity),
      } as unknown as Graph;
      diff = new Difference(before, after);
    } else {
      diff = new Difference(this.previous, this);
    }

    const ids = [...diff.complete().keys()];
    this._updateGeometries(ids);

    // Nothing is copied any more: the next commit only needs the writes made after this one.
    // (`previous` was the copy Rapid kept here; it is released so the predecessor can be collected.)
    this._written.clear();
    this._tracked = true;
    this.previous = null;
    return this;
  }


  /**
   * Maid: differs from Rapid here (see `_written`). Remembers what `local.entities` held for `entityID` before
   * its first write since the last `commit()`. Call it before every write to `local.entities`.
   * @param  entityID - The entity that is about to be written
   */
  protected _recordWrite(entityID: EntityID): void {
    if (this._written.has(entityID)) return;
    const local = this.local.entities;
    this._written.set(entityID, { had: local.has(entityID), value: local.get(entityID), seq: this._seqs.get(entityID) ?? 0 });
  }


  /**
   * Maid: differs from Rapid here (see `_written` and `_seqs`). Sets an entry of `local.entities`, and gives a
   * new key the next position number, as a new key goes last in the Map.
   * @param  entityID - The entity to set
   * @param  entity   - The entity, or `undefined` for a deletion
   */
  protected _setLocal(entityID: EntityID, entity: OsmEntity | undefined): void {
    this._recordWrite(entityID);
    const local = this.local.entities;
    if (!local.has(entityID)) this._seqs.set(entityID, ++this._clock);
    local.set(entityID, entity);
  }


  /**
   * Maid: differs from Rapid here (see `_written` and `_seqs`). Removes an entry of `local.entities`.
   * @param  entityID - The entity to remove from the local data
   */
  protected _deleteLocal(entityID: EntityID): void {
    this._recordWrite(entityID);
    this.local.entities.delete(entityID);
    this._seqs.delete(entityID);
  }


  /**
   * A Graph "snapshot" is a copy of the Graph that can be used to compute Differences.
   * It's just a copy with a special `id` and with no `previous`.
   * (The `previous = null` helps avoid leaking memory, we don't need to reference the previous Graph).
   * @return  A new Graph
   */
  public snapshot(): Graph {
    const id = this.id + '-snapshot';
    const snapshot = new Graph(this, { id: id });
    snapshot.previous = null;
    return snapshot;
  }


  /**
   * Loads new Entities into the local Graph, obliterating any existing Entities.
   * Used when restoring history or entering/leaving walkthrough.
   * This is just a shortcut for doing a bunch of `replace`/`remove` calls.
   * (The Entities passed in may be undefined, in the case of deletion)
   * @param   entities - Entities to load into the Graph
   * @return  this Graph
   * @throws  Will throw if called on a base graph
   */
  public load(entities: Record<EntityID, OsmEntity | undefined> = {}): Graph {
    if (this.isBaseGraph) {
      throw new Error(`Do not call 'load' on a base graph`);
    }

    const _loadOne = (entityID: EntityID, entity: OsmEntity | undefined): void => {
      const current = this.hasEntity(entityID);
      const replacement = entity || undefined;
      this._setLocal(entityID, replacement);  // Maid: differs from Rapid here (see `_written`)
      this._updateCaches(current, replacement);
    };

    // we want to process the nodes first..
    for (const [entityID, entity] of Object.entries(entities)) {
      if ((entity as OsmEntity | undefined)?.type === 'node') {
        _loadOne(entityID, entity);
      }
    }
    for (const [entityID, entity] of Object.entries(entities)) {
      if ((entity as OsmEntity | undefined)?.type !== 'node') {
        _loadOne(entityID, entity);
      }
    }

    return this.commit().touch();
  }


  /**
   * Loads new Entities into the base graph.
   * This is used to merge newly-downloaded data into an existing stack of edits.
   * To external observers, it should appear as if these Graphs always contained the newly downloaded data.
   * Important: `rebase` should be called on the base graph
   * @param  entities - Entities to add to the base Graph
   * @param  stack - Stack of graphs that need updates after this rebase
   * @param  force - If `true`, always update, if `false` skip Entities that we've seen already
   * @throws  Will throw if _not_ called on a base graph
   */
  public rebase(entities: OneOrMore<OsmEntity>, stack: Graph[] = [], force: boolean = false): void {
//    if (!this.isBaseGraph) {
//      throw new Error(`Must call 'rebase' on a base graph`);
//    }

    const base = this.base;
    const head = stack.at(-1)?.local?.entities;
    const restoreIDs = new Set<EntityID>();
    const newIDs = new Set<EntityID>();

    const arr = [...utilIterable(entities)].sort(this._nodesFirst);
    for (const entity of arr) {
      if (!entity.visible || (!force && base.entities.has(entity.id))) continue;

      // Merge data into the base graph
      base.entities.set(entity.id, entity);
      this._updateCaches(undefined, entity, base);  // note 'base' here
      newIDs.add(entity.id);

      // A weird thing we have to watch out for.. iD#2085
      // Sometimes an edit can remove a node, then we download more information and realize that
      // that Node was shared with another way.  If we detect this condition, restore the node.
      // (A "delete" is stored as: setting that entity = `undefined`)
      if (head && entity.type === 'way') {
        for (const id of (entity as OsmWay).nodes) {
          if (head.has(id) && head.get(id) === undefined) {  // was deleted
            restoreIDs.add(id);
          }
        }
      }
    }

    for (const graph of stack) {
      graph._updateRebased(restoreIDs);
    }

    this._updateGeometries(newIDs);
  }


  /**
   * Internal function, used to update internal caches after an OsmEntity update.
   * @param  previous  - The previous OsmEntity, may be undefined if new
   * @param  current   - The current OsmEntity, may be undefined if delete
   * @param  caches    - which caches to update, defaults to the local caches
   */
  protected _updateCaches(previous: OsmEntity | undefined, current: OsmEntity | undefined, caches?: GraphCache): void {
    const base = this.base;
    const local = this.local;
    const which = caches ?? local;
    const parentWays = which.parentWays;
    const parentRels = which.parentRels;

    const entity = current ?? previous;
    if (!entity) return;   // Either current or previous must be set

    if (entity.type === 'way') {  // update parentWays
      const prevNodes = new Set<EntityID>((previous as OsmWay | undefined)?.nodes);
      const currNodes = new Set<EntityID>((current as OsmWay | undefined)?.nodes);
      const removed = prevNodes.difference(currNodes);
      const added = currNodes.difference(prevNodes);

      // shallow copy whatever parentWays had in it before, and perform deletes/adds as needed
      for (const childID of removed) {
        const parentIDs = new Set<EntityID>( local.parentWays.get(childID) ?? base.parentWays.get(childID) ?? [] );
        parentIDs.delete(entity.id);
        parentWays.set(childID, parentIDs);
      }
      for (const childID of added) {
        const parentIDs = new Set<EntityID>( local.parentWays.get(childID) ?? base.parentWays.get(childID) ?? [] );
        parentIDs.add(entity.id);
        parentWays.set(childID, parentIDs);
      }

    } else if (entity.type === 'relation') {  // Update parentRels
      // diff only on the IDs since the same entity can be a member multiple times with different roles
      const prevMembers = new Set<EntityID>((previous as OsmRelation | undefined)?.members?.map(m => m.id));
      const currMembers = new Set<EntityID>((current as OsmRelation | undefined)?.members?.map(m => m.id));
      const removed = prevMembers.difference(currMembers);
      const added = currMembers.difference(prevMembers);

      // shallow copy whatever parentRels had in it before, and perform deletes/adds as needed
      for (const childID of removed) {
        const parentIDs = new Set<EntityID>( local.parentRels.get(childID) ?? base.parentRels.get(childID) ?? [] );
        parentIDs.delete(entity.id);
        parentRels.set(childID, parentIDs);
      }
      for (const childID of added) {
        const parentIDs = new Set<EntityID>( local.parentRels.get(childID) ?? base.parentRels.get(childID) ?? [] );
        parentIDs.add(entity.id);
        parentRels.set(childID, parentIDs);
      }
    }
  }


  /**
   * Internal function, used to update a graph following a `rebase` (base graph has changed).
   * Check local `parentWays` and `parentRels` caches and make sure they are consistent
   *  with the data in the base caches.
   * @param restoreIDs
   */
  protected _updateRebased(restoreIDs: Set<EntityID> | EntityID[] = []): void {
    const base = this.base;
    const local = this.local;

    let didChange = false;
    // Restore deleted nodes that were discovered to belong to a parentWay.
    for (const id of restoreIDs) {
      if (local.entities.has(id) && local.entities.get(id) === undefined) {  // was deleted
        this._deleteLocal(id);  // Maid: differs from Rapid here (see `_written`). "delete the delete", aka restore.
        didChange = true;
      }
    }
    if (didChange) {
      this.touch();
    }

    for (const [childID, parentWayIDs] of local.parentWays) {  // for all this.parentWays we've cached
      const baseWayIDs = base.parentWays.get(childID);         // compare to base.parentWays
      if (!baseWayIDs) continue;
      for (const wayID of baseWayIDs) {
        if (!local.entities.has(wayID)) {  // if the Way hasn't been edited
          parentWayIDs.add(wayID);         // update `this.parentWays` cache
        }
      }
    }

    for (const [childID, parentRelIDs] of local.parentRels) {  // for all this.parentRels we've cached
      const baseRelIDs = base.parentRels.get(childID);         // compare to base.parentRels
      if (!baseRelIDs) continue;
      for (const relID of baseRelIDs) {
        if (!local.entities.has(relID)) {  // if the Relation hasn't been edited
          parentRelIDs.add(relID);         // update `this.parentRels` cache
        }
      }
    }
  }


  /**
   * Internal function, used to update OsmEntity geometries affected by recent graph changes.
   * This needs to be called after all `_updateCaches` calls have finished.
   * @param entityIDs
   */
  protected _updateGeometries(entityIDs: Iterable<EntityID>): void {
    for (const entityID of entityIDs) {
      const entity = this.hasEntity(entityID);
      if (!entity) continue;                  // entity was deleted
      if (entity.type === 'node') continue;   // nodes don't need this
      (entity as OsmWay | OsmRelation).updateGeometry(this);
    }
  }


  /**
   * Internal function, compare function to sort nodes first.
   * @param a - First entity to compare
   * @param b - Second entity to compare
   * @return  Negative, zero, or positive per standard sort comparator semantics
   */
  protected _nodesFirst(a: OsmEntity, b: OsmEntity): number {
    const aIsNode = (a.type === 'node');
    const bIsNode = (b.type === 'node');
    return (aIsNode && !bIsNode) ? -1 : (!aIsNode && bIsNode) ? 1 : 0;
  }

}
