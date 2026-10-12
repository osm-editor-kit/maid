/**
 * Not in Rapid's model. Ported from iD's `utilOldestID` and the ordering behind it (`utilCompareIDs`,
 * modules/util/util.ts at iD commit 0194f3926), for the survivor rules of the merge and connect actions
 * (docs/research/id-tests/actions-b.md, F-util-10).
 */

/**
 * Returns the number in an entity ID like `n12` or `w-3`, or `NaN` for any other string.
 * @param   id - An EntityID
 * @return  The signed number after the type letter, or `NaN`
 */
function numericID(id: EntityID): number {
  const match = id.match(/^[cnwr](-?\d+)$/);
  return match ? parseInt(match[1], 10) : NaN;
}

/**
 * Compares two numeric IDs as iD does: existing (positive) IDs before new (negative) ones, the smaller
 * number is the older one; anything that is not a number comes last.
 * @param   left   - Number of the first ID, or `NaN`
 * @param   right  - Number of the second ID, or `NaN`
 * @return  `-1` if `left` is older, `1` if `right` is older, `0` if they are the same
 */
function compareNumericIDs(left: number, right: number): number {
  if (isNaN(left) && isNaN(right)) return -1;
  if (isNaN(left)) return 1;
  if (isNaN(right)) return -1;
  if (Math.sign(left) !== Math.sign(right)) return -Math.sign(left);
  if (Math.sign(left) < 0) return Math.sign(right - left);
  return Math.sign(left - right);
}

/**
 * Returns the oldest of several entity IDs: database IDs (positive numbers) before editor IDs (negative
 * numbers), and among each kind the number closest to zero. IDs that are not numeric come last.
 * When no ID is numeric, the first one in the list is returned.
 * @param   ids - Array of EntityIDs
 * @return  The oldest ID, or `undefined` if the array is empty
 */
export function utilOldestID<T extends EntityID>(ids: T[]): T | undefined {
  if (ids.length === 0) return undefined;

  let oldestIndex = 0;
  let oldest = numericID(ids[0]);

  for (let i = 1; i < ids.length; i++) {
    const num = numericID(ids[i]);
    if (compareNumericIDs(oldest, num) === 1) {
      oldestIndex = i;
      oldest = num;
    }
  }

  return ids[oldestIndex];
}

/** The fields of an entity that the survivor rule reads. */
export interface SurvivorCandidate {
  id: EntityID;
  version?: number;
}

/**
 * Whether an entity exists on the OSM server, as the survivor rule sees it: it has a positive numeric
 * OSM id, or it has an OSM `version` (Rapid's notion, which its tests use with ids such as `b`).
 * @param   entity - The entity, or any object with its `id` and `version`
 * @return  `true` if the entity exists on the server
 */
export function utilIsExistingEntity(entity: SurvivorCandidate): boolean {
  const num = numericID(entity.id);
  return (!isNaN(num) && num > 0) || !!entity.version;
}

/**
 * Whether the survivor rule can order an entity: it has a numeric id (`n12`, `n-1`), or a version.
 * A test id without a version (`a`, `r`) cannot be ordered, so the actions keep their own rule for it.
 * @param   entity - The entity, or any object with its `id` and `version`
 * @return  `true` if the entity can be ordered
 */
export function utilIsOrderedEntity(entity: SurvivorCandidate): boolean {
  return !isNaN(numericID(entity.id)) || !!entity.version;
}

/**
 * Returns the ID of the entity that survives when several entities become one (connect, merge, merge_polygon).
 * 1. An existing entity (see `utilIsExistingEntity`) beats a new one.
 * 2. Among existing entities with numeric ids, the smallest id wins: the oldest.
 * 3. Among new entities with numeric ids, the one closest to zero wins, as in `utilOldestID`.
 * Returns `undefined` when the ids cannot be ordered: a test id without a version is among the
 * entities, or several existing entities have no numeric id. The caller then keeps its own rule.
 * @param   entities - The candidate entities
 * @return  The ID of the survivor, or `undefined`
 */
export function utilSurvivorID<T extends SurvivorCandidate>(entities: T[]): EntityID | undefined {
  if (entities.length === 0) return undefined;
  if (!entities.every(utilIsOrderedEntity)) return undefined;

  const existing = entities.filter(utilIsExistingEntity);
  if (existing.length === 0) return utilOldestID(entities.map((entity) => entity.id));

  const numeric = existing.filter((entity) => !isNaN(numericID(entity.id))).map((entity) => entity.id);
  if (numeric.length) return utilOldestID(numeric);

  return existing.length === 1 ? existing[0].id : undefined;
}
