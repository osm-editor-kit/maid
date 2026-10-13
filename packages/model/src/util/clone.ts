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

/**
 * Set by a caller that passes a props object it will not use again, read once by the next `AbstractData`
 * constructor: that entity then keeps the object instead of copying it. Not in Rapid. The load path
 * (`entitiesFromOsmJson`) builds a fresh props object for every element, and copying it again was a
 * fifth of the time the merge of a tile took.
 */
let ownsNextProps = false

/** The next entity made takes the props object it is given, without copying it. The caller must not use that object again. */
export function ownNextProps(): void {
  ownsNextProps = true
}

/** True once after `ownNextProps()`. Called first thing in the `AbstractData` constructor, so the flag cannot outlive the entity. */
export function takeOwnedProps(): boolean {
  const owned = ownsNextProps
  ownsNextProps = false
  return owned
}
