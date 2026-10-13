// Narrowing helpers for the untyped id-tagging-schema JSON. Nothing here throws on bad input:
// a value that has the wrong shape is simply absent.
import type { Geometry, Tags } from './types.ts'

export type RawRecord = Record<string, unknown>

const GEOMETRIES: ReadonlySet<string> = new Set<string>([
  'point',
  'vertex',
  'line',
  'area',
  'relation',
])

export function isGeometry(value: unknown): value is Geometry {
  return typeof value === 'string' && GEOMETRIES.has(value)
}

export function asRecord(value: unknown): RawRecord | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as RawRecord
}

export function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The string entries of an array, or undefined when the value is not an array. */
export function asStrings(value: unknown) {
  if (!Array.isArray(value)) return undefined
  return value.filter((item): item is string => typeof item === 'string')
}

export function asGeometries(value: unknown): Geometry[] {
  if (!Array.isArray(value)) return []
  return value.filter(isGeometry)
}

/** A copy of an object's own string values. */
export function asTags(value: unknown): Tags {
  const tags: Tags = {}
  const record = asRecord(value)
  if (!record) return tags
  for (const key of Object.keys(record)) {
    const text = asString(record[key])
    if (text !== undefined) tags[key] = text
  }
  return tags
}

/** `{name}` → `name`; anything else → undefined. iD uses this form for references to other presets and fields. */
export function referenceOf(text: string) {
  return /^\{([^{}]+)\}$/.exec(text)?.[1]
}

/** Own property lookup that never reaches the prototype chain. */
export function own(section: RawRecord, id: string) {
  return Object.hasOwn(section, id) ? section[id] : undefined
}
