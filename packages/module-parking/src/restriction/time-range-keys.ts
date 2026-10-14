/**
 * The keys of the time ranges in the condition editor: one key per range, so that a row keeps its inputs and its focus
 * when another row is removed. The keys are kept in the editor's component state, never written to OSM. A range without
 * a stored key (its ranges changed in the text) gets its position as the key. Pure.
 */

/** The keys for `count` ranges: the stored ones, and the position for each range without one */
export function keysOf(stored: readonly string[], count: number): string[] {
  return Array.from({ length: count }, (_, position) => stored[position] ?? `position-${position}`)
}

/** The keys after the range at `index` is removed: the other rows keep theirs */
export function removeRangeKey(keys: readonly string[], index: number): string[] {
  return keys.filter((_, position) => position !== index)
}

/** The keys after a range is added at the end, with a key no other range has */
export function addRangeKey(keys: readonly string[], mint: () => string): string[] {
  return [...keys, mint()]
}

/** A process-wide counter gives each new range a key no other range has (called in an event, not while rendering) */
let counter = 0
export function mintRangeKey(): string {
  counter += 1
  return `range-${counter}`
}
