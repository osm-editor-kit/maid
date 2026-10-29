import { geomPolygonContainsPolygon } from '@rapid-sdk/math';

import type { Vec2 } from '@rapid-sdk/math';
import { OsmRelation } from '../data/OsmRelation.ts';
import { osmJoinWays } from '../lib/multipolygon.ts';
// Deep import: the barrel pulls aes-js into the start chunk.
import { utilArrayGroupBy, utilArrayIntersection, utilArrayUnion } from '@rapid-sdk/util/array';
import { utilObjectOmit } from '@rapid-sdk/util/object';
import { utilUnicodeCharsTruncated } from '@rapid-sdk/util/string';
import { utilSurvivorID } from '../util/ids.ts';

import type { Action } from './types.ts';
import type { Graph } from '../lib/Graph.ts';
import type { JoinedWaySequence } from '../lib/multipolygon.ts';
import type { OsmEntity } from '../data/OsmEntity.ts';
import type { OsmNode } from '../data/OsmNode.ts';
import type { OsmRelationMember } from '../data/OsmRelation.ts';
import type { OsmTags } from '../data/types.ts';
import type { OsmWay } from '../data/OsmWay.ts';


/** Data collected from gathering entities for merging */
interface EntityData {
  closedWay: OsmWay[];
  multipolygon: OsmRelation[];
  other: OsmEntity[];
}

/** Polygon representation with member array and nodes */
interface MergePolygon extends Array<OsmRelationMember | OsmWay> {
  nodes: OsmNode[];
}

/**
 * Tags that stay on an outer way when its area becomes a multipolygon: they describe a line, not an area.
 * iD's `osmWayOnlyTags` (modules/osm/tags.ts), the same single entry.
 */
const osmWayOnlyTags: Record<string, Record<string, true>> = {
  natural: { coastline: true },
};

/**
 * Merges `from` into `into` the way iD's `mergeTags` does: a new key is added, and different values are
 * joined with ';' (no `building` special case, unlike Rapid's `OsmEntity.mergeTags`).
 * @param   into  - The tags to merge into
 * @param   from  - The tags to add
 * @return  The merged tags, a new object
 */
function mergeTagsAsID(into: OsmTags, from: OsmTags): OsmTags {
  const merged: OsmTags = { ...into };
  for (const key in from) {
    const t1 = merged[key];
    const t2 = from[key];
    if (!t1) {
      merged[key] = t2;
    } else if (t1 !== t2) {
      merged[key] = utilUnicodeCharsTruncated(
        utilArrayUnion(t1.split(/;\s*/), t2.split(/;\s*/)).join(';'),
        255  // avoid exceeding character limit; see also OsmEntity.mergeTags
      );
    }
  }
  return merged;
}


/**
 * Merges multiple closed ways and/or multipolygon relations into a single
 * multipolygon relation, properly handling outer/inner roles based on containment.
 *
 * @param   ids            - Array of EntityIDs to merge (closed ways or multipolygons)
 * @param   newRelationID  - EntityID for the new relation if one needs to be created
 * @return  An Action function that merges the polygons
 */
export function actionMergePolygon(ids: EntityID[], newRelationID?: EntityID): Action {

  /**
   * Categorizes the selected entities into closed ways, multipolygon relations,
   * and anything else (treated as invalid input).
   * @param   graph - The current graph
   * @return  Object with `closedWay`, `multipolygon`, and `other` arrays
   */
  function gatherEntityData(graph: Graph): EntityData {
    const entities = ids.map(id => graph.entity(id));

    const geometryGroups = utilArrayGroupBy(entities, (entity: OsmEntity) => {
      if (entity.type === 'way' && (entity as OsmWay).isClosed()) {
        return 'closedWay';
      } else if (entity.type === 'relation' && (entity as OsmRelation).isMultipolygon()) {
        return 'multipolygon';
      } else {
        return 'other';
      }
    }) as Partial<EntityData>;

    return Object.assign(
      { closedWay: [], multipolygon: [], other: [] },
      geometryGroups
    );
  }


  const action: Action = ((graph: Graph): Graph => {
    const entities = gatherEntityData(graph);

    // An array representing all the polygons that are part of the multipolygon.
    // Each element is itself an array of objects with an id property, and has a
    // locs property which is an array of the locations forming the polygon.
    let polygons: MergePolygon[] = (entities.multipolygon.reduce((polygons: JoinedWaySequence[], m: OsmRelation) => {
      return polygons.concat(osmJoinWays(m.members, graph));
    }, [] as JoinedWaySequence[]) as MergePolygon[])
    .concat(entities.closedWay.map((d: OsmWay): MergePolygon => {
      const member: MergePolygon = [{id: d.id, type: 'way', role: ''}] as unknown as MergePolygon;
      member.nodes = graph.childNodes(d);
      return member;
    }));

    // contained is an array of arrays of boolean values,
    // where contained[j][k] is true iff the jth way is
    // contained by the kth way.
    let contained: (boolean | null)[][] = polygons.map((w: MergePolygon, i: number) => {
      return polygons.map((d: MergePolygon, n: number): boolean | null => {
        if (i === n) return null;
        return geomPolygonContainsPolygon(
          d.nodes.map((node: OsmNode): Vec2 => node.loc!),
          w.nodes.map((node: OsmNode): Vec2 => node.loc!)
        );
      });
    });

    // Sort all polygons as either outer or inner ways
    const members: OsmRelationMember[] = [];
    let outer = true;

    while (polygons.length) {
      extractUncontained(polygons);
      polygons = polygons.filter(isContained);
      contained = contained.filter(isContained).map(filterContained);
    }

    /**
     * Returns `true` if the polygon at index `i` is contained by at least one
     * other polygon (i.e. should be treated as an inner ring).
     * @param   _d - Unused polygon value (array callback signature)
     * @param   i  - Index into `contained`
     * @return  `true` if any containment entry for row `i` is truthy
     */
    function isContained(_d: unknown, i: number): boolean {
      return contained[i].some(Boolean);
    }

    /**
     * Filters one row of the `contained` matrix, keeping only the entries
     * whose corresponding polygon is still in the unprocessed set (i.e. still
     * considered "contained").
     * @param   d - A row from the containment matrix
     * @return  The same row with entries for already-extracted polygons removed
     */
    function filterContained(d: (boolean | null)[]): (boolean | null)[] {
      return d.filter((_v: boolean | null, i: number) => isContained(null, i));
    }

    /**
     * Assigns outer or inner roles to polygons that are not contained by any
     * remaining polygon, pushes them to `members`, and alternates the
     * `outer`/`inner` flag for the next iteration.
     * @param   polygons - Current list of unprocessed polygon sequences
     */
    function extractUncontained(polygons: MergePolygon[]): void {
      polygons.forEach((d: MergePolygon, i: number) => {
        if (!isContained(d, i)) {
          for (const member of d) {
            members.push({
              type: 'way',
              id: member.id,
              role: outer ? 'outer' : 'inner'
            });
          }
        }
      });
      outer = !outer;
    }

    // Move all tags to one relation
    // Maid: differs from Rapid here (F-actions-b-3): the oldest existing entity survives
    // Maid: differs from Rapid here (F-actions-b-3): the oldest existing entity survives, as iD's utilOldestID
    // (test ids without a version cannot be ordered: the first in the list survives, Rapid's rule)
    let relation = entities.multipolygon[0];
    const oldestID = utilSurvivorID(entities.multipolygon);
    if (oldestID) {
      relation = entities.multipolygon.find((m: OsmRelation) => m.id === oldestID)!;
    }
    if (!relation) {
      relation = new OsmRelation(graph.context, { id: newRelationID, tags: { type: 'multipolygon' }});
    }

    const keptID = relation.id;
    entities.multipolygon.filter((m: OsmRelation) => m.id !== keptID).forEach((m: OsmRelation) => {
      relation = relation.update({ tags: mergeTagsAsID(relation.tags, m.tags) });
      graph.remove(m);
    });

    entities.closedWay.forEach((way: OsmWay) => {
      const role = members.find((m: OsmRelationMember) => m.id === way.id)?.role;
      if (role === 'inner') {
        // an inner ring whose only tag is area=yes gets no tags: the multipolygon already makes it an area
        const tags = way.tags;
        if (Object.keys(tags).length === 1 && tags.area === 'yes') {
          graph.replace(way.update({ tags: {} }));
        }
        return;
      }
      if (role === 'outer') {
        // as iD: the tags move to the relation, except those that describe a line (natural=coastline stays on the way)
        const areaTags: OsmTags = {};
        const lineTags: OsmTags = {};
        for (const key in way.tags) {
          if (osmWayOnlyTags[key]?.[way.tags[key]]) {
            lineTags[key] = way.tags[key];
          } else {
            areaTags[key] = way.tags[key];
          }
        }
        relation = relation.update({ tags: mergeTagsAsID(relation.tags, areaTags) });
        graph.replace(way.update({ tags: lineTags }));
      }
    });

    relation = relation.update({
      members: members,
      tags: utilObjectOmit(relation.tags, ['area'])
    });

    return graph.replace(relation).commit();
  }) as Action;


  /**
   * Returns a reason string if the merge-polygon operation cannot be performed,
   * or `false` if it is allowed.
   * @param   graph - The current graph
   * @return  `'not_eligible'` if the selection has non-polygon entities, fewer than two closed ways
   *          or multipolygons, a redundant shared multipolygon already exists, or a way is already
   *          a member of one of the selected multipolygons;
   *          `'incomplete_relation'` if any selected multipolygon has undownloaded members;
   *          `false` if the action is enabled
   */
  action.disabled = function(graph: Graph): string | false {
    const entities = gatherEntityData(graph);
    if (entities.other.length > 0 ||
      entities.closedWay.length + entities.multipolygon.length < 2) {
      return 'not_eligible';
    }
    if (!entities.multipolygon.every(r => r.isComplete(graph))) {
      return 'incomplete_relation';
    }

    if (!entities.multipolygon.length) {
      let sharedMultipolygons: OsmRelation[] = [];
      entities.closedWay.forEach((way: OsmWay, i: number) => {
        const parentMultipolygons = graph.parentRelations(way).filter(r => r.isMultipolygon());

        if (i === 0) {
          sharedMultipolygons = parentMultipolygons;
        } else {
          sharedMultipolygons = utilArrayIntersection(sharedMultipolygons, parentMultipolygons);
        }
      });

      sharedMultipolygons = sharedMultipolygons.filter(r => r.members.length === entities.closedWay.length);

      if (sharedMultipolygons.length) {
        // don't create a new multipolygon if it'd be redundant
        return 'not_eligible';
      }

    } else if (entities.closedWay.some((way: OsmWay) => {
        const parentMultipolygons = graph.parentRelations(way).filter(r => r.isMultipolygon());
        return utilArrayIntersection(parentMultipolygons, entities.multipolygon).length;
      })) {
      // don't add a way to a multipolygon again if it's already a member
      return 'not_eligible';
    }
    return false;
  };


  return action;
}
