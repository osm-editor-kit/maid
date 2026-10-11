/**
 * Deep copy for the plain data that entity properties are made of: primitives, arrays and
 * plain objects. Anything else (a Date, a Map, a class instance) goes through `structuredClone`.
 *
 * Not in Rapid. Rapid uses `structuredClone` for every entity, twice. That call was almost all of
 * the time it took to create entities when loading a scene (docs/architecture/05-data-store.md).
 */
export function cloneData<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    const out = new Array(value.length)
    for (let i = 0; i < value.length; i++) out[i] = cloneData(value[i])
    return out as T
  }
  const proto = Object.getPrototypeOf(value)
  if (proto !== Object.prototype && proto !== null) return structuredClone(value)
  const out: Record<string, unknown> = {}
  for (const key in value) out[key] = cloneData((value as Record<string, unknown>)[key])
  return out as T
}
