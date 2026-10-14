/**
 * What a measure on the map writes into a width field: the distance in metres as the field's value,
 * and `source:<key>` with the name of the background that was visible while measuring. This module is pure. The
 * Inspector gives the result to the engine in one edit, so it is one undo step.
 */

/**
 * The tag changes of one measure. `background` is the name of the background imagery (undefined
 * with none chosen, or the plain map style); then no source is written, and an existing one stays
 * as it is because the result does not mention it. Nothing at all when the distance rounds to zero
 * (two clicks in one place).
 */
export function measureTags(
  key: string,
  metres: number,
  background: string | undefined,
): Record<string, string> {
  // one decimal, as OSM width values are written (3.5, not "3.5 m"); the same rounding as the check
  const value = Math.round(metres * 10) / 10
  if (!(value > 0)) return {}
  const tags: Record<string, string> = { [key]: String(value) }
  const source = background?.trim()
  if (source) tags[`source:${key}`] = source
  return tags
}
