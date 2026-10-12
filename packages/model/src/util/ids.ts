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
  const match = id.match(/^[cnwr](-?\d+)$/)
  return match ? parseInt(match[1], 10) : NaN
}

/**
 * Compares two numeric IDs as iD does: existing (positive) IDs before new (negative) ones, the smaller
 * number is the older one; anything that is not a number comes last.
 * @param   left   - Number of the first ID, or `NaN`
 * @param   right  - Number of the second ID, or `NaN`
 * @return  `-1` if `left` is older, `1` if `right` is older, `0` if they are the same
 */
function compareNumericIDs(left: number, right: number): number {
  if (isNaN(left) && isNaN(right)) return -1
  if (isNaN(left)) return 1
  if (isNaN(right)) return -1
  if (Math.sign(left) !== Math.sign(right)) return -Math.sign(left)
  if (Math.sign(left) < 0) return Math.sign(right - left)
  return Math.sign(left - right)
}

/**
 * Returns the oldest of several entity IDs: database IDs (positive numbers) before editor IDs (negative
 * numbers), and among each kind the number closest to zero. IDs that are not numeric come last.
 * When no ID is numeric, the first one in the list is returned.
 * @param   ids - Array of EntityIDs
 * @return  The oldest ID, or `undefined` if the array is empty
 */
export function utilOldestID<T extends EntityID>(ids: T[]): T | undefined {
  if (ids.length === 0) return undefined

  let oldestIndex = 0
  let oldest = numericID(ids[0])

  for (let i = 1; i < ids.length; i++) {
    const num = numericID(ids[i])
    if (compareNumericIDs(oldest, num) === 1) {
      oldestIndex = i
      oldest = num
    }
  }

  return ids[oldestIndex]
}
