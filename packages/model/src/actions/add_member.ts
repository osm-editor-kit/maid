import { osmJoinWays } from '../lib/multipolygon.ts';
import { OsmWay } from '../data/OsmWay.ts';
// Deep import: the barrel pulls aes-js into the start chunk.
import { utilArrayGroupBy } from '@rapid-sdk/util/array';
import { utilObjectOmit } from '@rapid-sdk/util/object';

import type { Action } from './types.ts';
import type { Graph } from '../lib/Graph.ts';
import type { OsmRelation, OsmRelationMember, IndexedMember } from '../data/OsmRelation.ts';


/** InsertPair data for paired member insertion */
export interface InsertPair {
  originalID: EntityID;
  insertedID: EntityID;
  nodes: EntityID[];
}

/**
 * An `IndexedMember` that may have been decorated with a `pair` property
 * during way-member ordering.  The `pair` holds the two real members that
 * replace a temporary "wTemp" way once ordering is complete.
 */
// Maid: differs from Rapid here (F-relations-1, F-relations-2, see docs/research/relations-vs-id.md)
// `origin` is the position of a loaded way in the member list, it does not change when the way moves.
type PairedMember = IndexedMember & { pair?: OsmRelationMember[]; origin?: number };


/**
 * Adds a member to a relation, with special handling for way members
 * to insert them in sensible positions based on how ways connect.
 *
 * @param   relationID   - EntityID of the relation to add to
 * @param   member       - The member to add
 * @param   memberIndex  - Optional index position (if missing, code will choose)
 * @param   insertPair   - Optional InsertPair for paired insertions (used by actionSplit)
 * @return  An Action function that adds the member to the graph
 */
export function actionAddMember(relationID: EntityID, member: OsmRelationMember, memberIndex?: number, insertPair?: InsertPair): Action {

  return function action(graph: Graph): Graph {
    const relation = graph.entity(relationID) as OsmRelation;

    // There are some special rules for Public Transport v2 routes.
    const isPTv2 = /stop|platform/.test(member.role || '');

    if ((memberIndex === undefined || isNaN(memberIndex) || insertPair) && member.type === 'way' && !isPTv2) {
      // Try to perform sensible inserts based on how the ways join together
      addWayMember(relation, graph);

    } else {
      // see https://wiki.openstreetmap.org/wiki/Public_transport#Service_routes
      // Stops and Platforms for PTv2 should be ordered first.
      // hack: We do not currently have the ability to place them in the exactly correct order.
      if (isPTv2 && (memberIndex === undefined || isNaN(memberIndex))) {
        memberIndex = 0;
      }

      graph.replace(relation.addMember(member, memberIndex));
    }

    return graph.commit();
  };


  /**
   * Adds a way member to the relation at the most sensible position by using
   * `osmJoinWays` to determine how the existing members connect together.
   * @param   relation - The relation to add the way to
   * @param   graph    - The current graph
   */
  function addWayMember(relation: OsmRelation, graph: Graph): void {
    let groups: Record<string, any[]>;
    let sequence: OsmRelationMember[];
    let tempWay: OsmWay | undefined;

    // remove PTv2 stops and platforms before doing anything.
    const PTv2members: OsmRelationMember[] = [];
    const members: OsmRelationMember[] = [];
    for (const member of relation.members) {
      if (/stop|platform/.test(member.role || '')) {
        PTv2members.push(member);
      } else {
        members.push(member);
      }
    }
    relation = relation.update({ members: members });


    if (insertPair) {
      // We're adding a member that must stay paired with an existing member.
      // (This feature is used by `actionSplit`)
      //
      // This is tricky because the members may exist multiple times in the
      // member list, and with different A-B/B-A ordering and different roles.
      // (e.g. a bus route that loops out and back - iD#4589).
      //
      // Replace the existing member with a temporary way,
      // so that `osmJoinWays` can treat the pair like a single way.
      tempWay = new OsmWay(relation.context, { id: 'wTemp', nodes: insertPair.nodes });
      graph.replace(tempWay);
      const tempMember: OsmRelationMember = { id: tempWay.id, type: 'way', role: member.role };
      const tempRelation = relation.replaceMember({ id: insertPair.originalID }, tempMember, true);
      groups = utilArrayGroupBy(tempRelation.members, 'type');
      sequence = tempRelation.members;

    } else {
      // Add the member anywhere, one time. Just push and let `osmJoinWays` decide where to put it.
      groups = utilArrayGroupBy(relation.members, 'type');
      sequence = relation.members.concat([member]);
    }

    // Maid: differs from Rapid here (F-relations-1, F-relations-2, see docs/research/relations-vs-id.md)
    // Only the loaded ways are joined and reordered. Every other entry (a way that is not loaded, a relation)
    // is not moved by the join: it is written after the loaded way before it in the member list (see `anchors`).
    const isLoaded = (m: OsmRelationMember): boolean => m.type === 'way' && graph.hasEntity(m.id) !== undefined;
    const loaded = sequence.filter(isLoaded);
    // origin of the new member, when it is a loaded way (it is the last one in the sequence)
    const newOrigin = !insertPair && loaded.length > 0 && loaded[loaded.length - 1] === member ? loaded.length - 1 : -1;

    // (computed before the join, because the join removes a temporary way of `insertPair`)
    const anchors = new Map<number, OsmRelationMember[]>();
    let previous = -1;
    let loadedCount = 0;
    for (const m of sequence) {
      if (m.type === 'node') continue;
      if (isLoaded(m)) {
        previous = loadedCount++;
        continue;
      }
      anchors.set(previous, [...(anchors.get(previous) ?? []), m]);
    }

    const indexedMembers: PairedMember[] = withIndex(loaded);
    const joined = osmJoinWays(indexedMembers, graph);
    const joinedOrigins = new Set<number>();

    // `joined` might not contain all of the way members,
    // But will contain only the completed (downloaded) members
    for (const segment of joined) {
      const nodes = segment.nodes.slice();
      const startIndex = segment[0].index;
      let j: number, k: number;

      // j = array index in `members` where this segment starts
      for (j = 0; j < indexedMembers.length; j++) {
        if (indexedMembers[j].index === startIndex) {
          break;
        }
      }

      // k = each member in segment
      for (k = 0; k < segment.length; k++) {
        const item = segment[k];
        const way = graph.entity(item.id) as OsmWay;

        // Maid: differs from Rapid here (F-relations-2, see docs/research/relations-vs-id.md)
        // a way that the join placed behind the previous way of its segment
        if (k > 0) {
          joinedOrigins.add(item.origin!);
        }

        // If this is a paired item, generate members in correct order and role
        if (insertPair && tempWay && item.id === tempWay.id) {
          // Maid: differs from Rapid here (F-relations-3, F-actions-b-36, see docs/research/relations-vs-id.md)
          // The half that comes first along the route is the one with the route's node at this point, whichever
          // half keeps the original id (`split` may swap them to keep the longer history).
          const originalWay = graph.entity(insertPair.originalID) as OsmWay;
          const originalFirst = originalWay.nodes[0] === nodes[0].id || originalWay.nodes[originalWay.nodes.length - 1] === nodes[0].id;
          if (originalFirst) {
            item.pair = [
              { id: insertPair.originalID, type: 'way', role: item.role },
              { id: insertPair.insertedID, type: 'way', role: item.role }
            ];
          } else {
            item.pair = [
              { id: insertPair.insertedID, type: 'way', role: item.role },
              { id: insertPair.originalID, type: 'way', role: item.role }
            ];
          }
        }

        // reorder `members` if necessary
        if (k > 0) {
          if (j+k >= indexedMembers.length || item.index !== indexedMembers[j+k].index) {
            moveMember(indexedMembers, item.index, j+k);
          }
        }

        nodes.splice(0, way.nodes.length - 1);
      }
    }

    if (tempWay) {
      graph.remove(tempWay);
    }

    // Maid: differs from Rapid here (F-relations-1, F-relations-2, see docs/research/relations-vs-id.md)
    // Each entry that is not a loaded way waits under the loaded way before it in the member list (-1: none).
    // It is written after that way, but before the next loaded way of the join, except that a new way
    // the join placed directly behind that way is written first.
    // Final pass: skip dead items, split pairs, remove index properties
    const wayMembers: OsmRelationMember[] = [];
    let current = -1;
    const flushAnchors = (): void => {
      wayMembers.push(...(anchors.get(current) ?? []));
      anchors.delete(current);
    };
    for (const item of indexedMembers) {
      if (item.index === -1) continue;

      if (item.origin !== newOrigin || !joinedOrigins.has(item.origin)) {
        flushAnchors();
        current = item.origin!;
      }

      if (item.pair) {
        wayMembers.push(item.pair[0]);
        wayMembers.push(item.pair[1]);
      } else {
        wayMembers.push(utilObjectOmit(item, ['index', 'origin']) as OsmRelationMember);
      }
    }
    flushAnchors();

    // Put stops and platforms first, then nodes, ways, and the entries that are not loaded ways (relations)
    // This is recommended for Public Transport v2 routes:
    // see https://wiki.openstreetmap.org/wiki/Public_transport#Service_routes
    const newMembers = PTv2members.concat( (groups.node || []), wayMembers );

    graph.replace(relation.update({ members: newMembers }));


    /**
     * Changes the `members` array in place by splicing
     * the item with `.index = findIndex` to where it belongs,
     * and marking the old position as "dead" with `.index = -1`
     * ```
     * j=5, k=0                jk
     * segment                 5 4 7 6
     * members       0 1 2 3 4 5 6 7 8 9        keep 5 in j+k
     *
     * j=5, k=1                j k
     * segment                 5 4 7 6
     * members       0 1 2 3 4 5 6 7 8 9        move 4 to j+k
     * members       0 1 2 3 x 5 4 6 7 8 9      moved
     *
     * j=5, k=2                j   k
     * segment                 5 4 7 6
     * members       0 1 2 3 x 5 4 6 7 8 9      move 7 to j+k
     * members       0 1 2 3 x 5 4 7 6 x 8 9    moved
     *
     * j=5, k=3                j     k
     * segment                 5 4 7 6
     * members       0 1 2 3 x 5 4 7 6 x 8 9    keep 6 in j+k
     * ```
     * @param arr
     * @param findIndex
     * @param toIndex
     */
    function moveMember(arr: IndexedMember[], findIndex: number, toIndex: number): void {
      let i: number;
      for (i = 0; i < arr.length; i++) {
        if (arr[i].index === findIndex) {
          break;
        }
      }

      const item = { ...arr[i] };   // shallow copy
      arr[i].index = -1;   // mark as dead
      item.index = toIndex;
      arr.splice(toIndex, 0, item);
    }


    /**
     * Shallow-copies each element of `arr` and attaches an `.index` property
     * equal to its array position.  Equivalent to `Relation.indexedMembers`
     * but scoped only to the way-member subset.
     * @param   arr - Array of relation member objects
     * @return  The same members with an added `.index` property
     */
    function withIndex(arr: any[]): PairedMember[] {
      const result = new Array(arr.length);
      for (let i = 0; i < arr.length; i++) {
        result[i] = { ...arr[i] };   // shallow copy
        result[i].index = i;
        // Maid: differs from Rapid here (F-relations-1, F-relations-2, see docs/research/relations-vs-id.md)
        result[i].origin = i;
      }
      return result;
    }
  }
}
