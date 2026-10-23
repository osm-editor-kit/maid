import type { Action } from './types.ts';
import type { Graph } from '../lib/Graph.ts';
import type { OsmNode, OsmTags, OsmWay } from '../data/types.ts';


/** Options for the reverse action */
export interface ReverseOptions {
  /** Whether to also reverse the direction values of `oneway` and `conveying` (iD#13026, iD#13027) */
  reverseOneway?: boolean;
}

/** Options for reverseValue */
export interface ReverseValueOptions {
  /** When `true`, also reverse absolute compass bearings (a node that is reversed itself) */
  includeAbsolute?: boolean;
  /** When `true`, also reverse the direction values of `oneway` and `conveying` (iD#13026, iD#13027) */
  reverseOneway?: boolean;
}

/** A reverse action with additional methods */
export interface ReverseAction extends Action {
  /** Returns a reason string if disabled, or false if not disabled */
  disabled: (graph: Graph) => string | false;
  /** Returns the entity ID being reversed */
  entityID: () => EntityID;
}

/** Key replacement pairs: [pattern to match, replacement string] */
type KeyReplacement = [RegExp, string];

/** Value replacement lookup table */
type ValueReplacements = Record<string, string>;

/** Role replacement lookup table */
type RoleReplacements = Record<string, string>;

/** Oneway replacement lookup table */
type OnewayReplacements = Record<string, string>;

/** Compass direction replacement lookup table */
type CompassReplacements = Record<string, string>;

// Matches the word as a whole part of the key: `name`, `addr:name`, `note_left`, but not `railway:preferred_direction` (contains `ref`)
const IGNORE_KEY = /(^|_|:)(description|name|note|website|ref|source|comment|watch|attribution)(_|:|$)/;
const NUMERIC = /^([+\-]?)(?=[\d.])/;
const DIRECTION_KEY = /direction$/;
const TURN_LANES = /^turn:lanes:?/;
// Maid: differs from Rapid here (iD#10736: red_turn:right and red_turn:left are not relative to the way)
const RED_TURN_KEY = /^red_turn:(right|left):?/;

const KEY_REPLACEMENTS: KeyReplacement[] = [
  [/:right$/, ':left'],
  [/:left$/, ':right'],
  [/:forward$/, ':backward'],
  [/:backward$/, ':forward'],
  [/:right:/, ':left:'],
  [/:left:/, ':right:'],
  [/:forward:/, ':backward:'],
  [/:backward:/, ':forward:']
];

const VALUE_REPLACEMENTS: ValueReplacements = {
  left: 'right',
  right: 'left',
  up: 'down',
  down: 'up',
  forward: 'backward',
  backward: 'forward',
  forwards: 'backward',
  backwards: 'forward',
};

const ROLE_REPLACEMENTS: RoleReplacements = {
  forward: 'backward',
  backward: 'forward',
  forwards: 'backward',
  backwards: 'forward'
};

/**
 * The values that point along a way and their opposite, per key. They turn only with `reverseOneway`: a plain
 * reverse keeps them, as iD does (iD#13027 for conveying). `oneway=1` is not here: iD dropped it (iD#13026).
 */
const DIRECTION_REPLACEMENTS: Record<string, OnewayReplacements> = {
  oneway: { yes: '-1', '-1': 'yes' },
  conveying: { forward: 'backward', backward: 'forward' },
};

const COMPASS_REPLACEMENTS: CompassReplacements = {
  N: 'S',
  NNE: 'SSW',
  NE: 'SW',
  ENE: 'WSW',
  E: 'W',
  ESE: 'WNW',
  SE: 'NW',
  SSE: 'NNW',
  S: 'N',
  SSW: 'NNE',
  SW: 'NE',
  WSW: 'ENE',
  W: 'E',
  WNW: 'ESE',
  NW: 'SE',
  NNW: 'SSE'
};

/** A lookup that ignores inherited names: `constructor` is a value, not Object.prototype.constructor */
function lookup(table: Record<string, string>, value: string): string | undefined {
  return Object.hasOwn(table, value) ? table[value] : undefined;
}

/**
 * Applies the key replacement table to swap directional suffixes such as
 * `:right`/`:left` and `:forward`/`:backward`. Pure. Reversing a key twice gives the key back.
 * @param   key - The tag key to transform
 * @return  Transformed key, or the original key if no replacement matched
 */
export function reverseKey(key: string): string {
  if (RED_TURN_KEY.test(key)) return key;  // Maid: differs from Rapid here (see RED_TURN_KEY)
  for (const replacement of KEY_REPLACEMENTS) {
    if (replacement[0].test(key)) {
      return key.replace(replacement[0], replacement[1]);
    }
  }
  return key;  // no change
}

/**
 * Transforms a tag value to its directional opposite. Pure.
 * Handles `left`/`right`, `forward`/`backward`, `up`/`down`, numeric `incline` negation, the direction values of `oneway`
 * and `conveying` (when `reverseOneway` is set; a plain reverse keeps them), and absolute compass directions on
 * `*direction` keys (when `includeAbsolute` is set).
 * Keys matching the ignore list (names, descriptions, refs, etc.) are passed through unchanged.
 * @param   key      - The tag key (used to select the reversal strategy)
 * @param   value    - The tag value to transform
 * @param   allTags  - All tags of the entity, to check the tags a value depends on
 * @param   options  - see ReverseValueOptions
 * @return  Transformed value, or the original value if no replacement applied
 */
export function reverseValue(
  key: string,
  value: string,
  allTags: OsmTags,
  options: ReverseValueOptions = {},
): string {
  if (IGNORE_KEY.test(key)) return value;

  // Turn lanes are left/right to key (not way) direction - iD#5674
  if (TURN_LANES.test(key)) return value;

  // Maid: differs from Rapid here (iD#10128, the side of a cyclist waiting aid and railway:turnout_side are not relative to the way)
  if ((key === 'side' && allTags.highway === 'cyclist_waiting_aid') || key === 'railway:turnout_side') return value;

  if (key === 'incline' && NUMERIC.test(value)) {
    // Maid: differs from Rapid here: a zero stays zero; iD writes '-0', which is not a value and compares as different
    if (parseFloat(value) === 0) return value.replace(NUMERIC, '');
    return value.replace(NUMERIC, (_: string, sign: string) => {
      return sign === '-' ? '' : '-';
    });
  }

  // iD#13026, iD#13027: the direction values of oneway and conveying are kept, unless the reverse is asked to turn them
  const directions = Object.hasOwn(DIRECTION_REPLACEMENTS, key) ? DIRECTION_REPLACEMENTS[key] : undefined;
  const opposite = directions ? lookup(directions, value) : undefined;
  if (opposite !== undefined) return options.reverseOneway ? opposite : value;

  // Maid: differs from Rapid here (iD splits the value on ';' and reverses each part, so 'N;90' becomes 'S;270')
  if (options.includeAbsolute && DIRECTION_KEY.test(key)) {
    return value.split(';').map((part: string) => {
      const compass = lookup(COMPASS_REPLACEMENTS, part);
      if (compass) return compass;

      let degrees: number = Number(part);  // Number, not parseFloat: '90deg' is not a bearing, as in iD
      if (Number.isFinite(degrees)) {
        if (degrees < 180) {
          degrees += 180;
        } else {
          degrees -= 180;
        }
        return degrees.toString();
      }
      return lookup(VALUE_REPLACEMENTS, part) ?? part;
    }).join(';');
  }

  return lookup(VALUE_REPLACEMENTS, value) ?? value;
}


/**
 * Order the nodes of a way in reverse order and reverse any direction dependent tags
 * other than `oneway` and `conveying`, which turn only with `reverseOneway`. (We assume that correcting
 * a backwards oneway is the primary reason for reversing a way.)
 *
 * In addition, numeric-valued `incline` tags are negated.
 *
 * References:
 *     http://wiki.openstreetmap.org/wiki/Forward_%26_backward,_left_%26_right
 *     http://wiki.openstreetmap.org/wiki/Key:direction#Steps
 *     http://wiki.openstreetmap.org/wiki/Key:incline
 *     http://wiki.openstreetmap.org/wiki/Route#Members
 *     http://josm.openstreetmap.de/browser/josm/trunk/src/org/openstreetmap/josm/corrector/ReverseWayTagCorrector.java
 *     http://wiki.openstreetmap.org/wiki/Tag:highway%3Dstop
 *     http://wiki.openstreetmap.org/wiki/Key:traffic_sign#On_a_way_or_area
 * @param   entityID  - The EntityID to reverse
 * @param   options - reverse options
 * @return  An Action function that reverses the given Entity
*/
export function actionReverse(entityID: EntityID, options?: ReverseOptions): ReverseAction {
  const valueOptions = { reverseOneway: options?.reverseOneway };

  /**
   * Applies key and value reversal to all tags on the listed nodes, writing
   * the updated nodes back into the graph.  Used to reverse direction-dependent
   * tags on nodes that belong to the way being reversed.
   * @param   graph   - The current graph (mutated in place)
   * @param   nodeIDs - EntityIDs of the nodes whose tags should be reversed
   */
  // Reverse the direction of tags attached to the nodes - iD#3076
  function reverseNodeTags(graph: Graph, nodeIDs: EntityID[]): void {
    for (const nodeID of nodeIDs) {
      const node = graph.hasEntity(nodeID) as OsmNode | undefined;
      if (!node || !Object.keys(node.tags).length) continue;

      const tags: OsmTags = {};
      for (const [key, value] of Object.entries(node.tags)) {
        tags[reverseKey(key)] = reverseValue(key, value, node.tags, {
          ...valueOptions,
          includeAbsolute: node.id === entityID,
        });
      }
      graph.replace(node.update({ tags: tags }));
    }
  }


  /**
   * Reverses the order of the way's nodes, transforms all direction-dependent
   * tags (keys and values), updates any parent relation roles that reference
   * forward/backward direction, and reverses directional tags on the way's nodes.
   * @param   graph - The current graph (mutated in place)
   * @param   way   - The way to reverse
   */
  function reverseWay(graph: Graph, way: OsmWay): void {
    const nodes: EntityID[] = way.nodes.slice().reverse();
    const tags: OsmTags = {};

    for (const [key, value] of Object.entries(way.tags)) {
      tags[reverseKey(key)] = reverseValue(key, value, way.tags, valueOptions);
    }

    for (let relation of graph.parentRelations(way)) {
      for (const member of relation.indexedMembers()) {
        if (member.id !== way.id) continue;

        const reverseRole: string | undefined = lookup(ROLE_REPLACEMENTS, member.role);
        if (!reverseRole) continue;

        relation = relation.updateMember({ role: reverseRole }, member.index);
        graph.replace(relation);
      }
    }

    // Reverse any associated directions on nodes on the way and then replace
    // the way itself with the reversed node ids and updated way tags
    reverseNodeTags(graph, nodes);
    graph.replace(way.update({ nodes: nodes, tags: tags }));
  }


  const action = (graph: Graph): Graph => {
    const entity = graph.entity(entityID);
    if (entity.type === 'way') {
      reverseWay(graph, entity as OsmWay);
    } else if (entity.type === 'node') {
      reverseNodeTags(graph, [entityID]);
    }
    return graph.commit();
  };


  /**
   * Returns a reason string if the reverse operation cannot be performed,
   * or `false` if it is allowed.
   * @param   graph - The current graph
   * @return  `'nondirectional_node'` if the entity is a node whose tags contain no directional
   *          key or value that would be changed by reversing;
   *          `false` if the action is enabled
   */
  action.disabled = function(graph: Graph): string | false {
    const entity = graph.hasEntity(entityID);
    if (!entity || entity.type === 'way') return false;

    for (const [key, value] of Object.entries(entity.tags)) {
      if (reverseKey(key) !== key || reverseValue(key, value, entity.tags, { ...valueOptions, includeAbsolute: true }) !== value) {
        return false;
      }
    }
    return 'nondirectional_node';
  };

  action.entityID = function(): EntityID {
    return entityID;
  };

  return action;
}
