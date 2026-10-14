// The schema's deprecated tags, ported from iD's modules/osm/deprecated.ts (ISC, © iD contributors), at commit
// 0194f3926: getDeprecatedTags, with the entries indexed by key and value so that a tag set is looked up, not searched.
import { asRecord, asTags } from './raw.ts'
import type { DeprecatedTag, Tags } from './types.ts'

/**
 * One entry of the list, with its place in the list. The key lists are made once, here, not for each look-up:
 * `oldKeys` are the keys of `old`, `transferKeys` the wildcard ones among them (the order of `$1`, `$2`).
 */
type Candidate = {
  position: number
  entry: DeprecatedTag
  oldKeys: readonly string[]
  transferKeys: readonly string[]
}

/** The entries whose first `old` key is one key: those with a wildcard value, and those by their value for that key */
type KeyEntries = {
  wildcard: Candidate[]
  byValue: Map<string, Candidate[]>
}

/** The entries of the list, by their first `old` key (every match has that key) */
export type DeprecatedIndex = ReadonlyMap<string, KeyEntries>

/** The list of the schema, read without trusting its shape: an entry that is not an object with `old` is left out */
export function deprecatedIndexOf(raw: unknown): DeprecatedIndex {
  const index = new Map<string, KeyEntries>()
  if (!Array.isArray(raw)) return index
  raw.forEach((item, position) => {
    const record = asRecord(item)
    const old = asTags(record?.old)
    // an entry without `old` would match every feature: iD's data has none, so it is left out here
    const [firstKey] = Object.keys(old)
    if (firstKey === undefined) return
    const replace = asRecord(record?.replace) ? asTags(record?.replace) : undefined
    const entry: DeprecatedTag = replace ? { old, replace } : { old }
    const oldKeys = Object.keys(old)
    const candidate: Candidate = {
      position,
      entry,
      oldKeys,
      transferKeys: oldKeys.filter((key) => old[key] === '*'),
    }
    let entries = index.get(firstKey)
    if (!entries) {
      entries = { wildcard: [], byValue: new Map() }
      index.set(firstKey, entries)
    }
    const value = old[firstKey] ?? ''
    if (value === '*') {
      entries.wildcard.push(candidate)
    } else {
      const list = entries.byValue.get(value)
      if (list) list.push(candidate)
      else entries.byValue.set(value, [candidate])
    }
  })
  return index
}

/** iD's getDeprecatedTags for one entry: true when the tags have every `old` tag and the upgrade would not overwrite a value */
function matches(
  tags: Tags,
  { entry: { old, replace }, oldKeys, transferKeys }: Candidate,
): boolean {
  // the old keys first: this test is cheap, and the overwrite test below only reads the tags, so the order does not change the result
  const hasOldKeys = oldKeys.every((oldKey) => {
    const value = tags[oldKey]
    if (!value) return false
    const oldValue = old[oldKey]
    if (oldValue === '*' || oldValue === value) return true
    // a semicolon-delimited value matches when one of its values is the old one
    const values = value.split(';').filter(Boolean)
    if (values.length === 0) return false
    return values.length > 1 && values.includes(oldValue ?? '')
  })
  if (!hasOldKeys) return false
  if (!replace) return true

  // don't flag deprecated tags if the upgrade path would overwrite existing data (iD #7843)
  const overwrites = Object.keys(replace).some((replaceKey) => {
    if (!tags[replaceKey] || old[replaceKey]) return false
    const replaceValue = replace[replaceKey] ?? ''
    if (replaceValue === '*') return false
    // the values `$1`, `$2` of `replace` refer to the wildcard keys of `old`, in order
    if (
      replaceValue.startsWith('$1') &&
      tags[replaceKey] === tags[transferKeys[Number(replaceValue.substring(1)) - 1] ?? '']
    )
      return false
    if (replaceValue === tags[replaceKey]) return false
    return true
  })
  return !overwrites
}

/**
 * The entries of the list that these tags match, in the list's order. For each key of the tags, the entries that can
 * match are the wildcard ones and those whose first value is the tag's value, or one of its semicolon-separated
 * values; `matches` then checks each of them, so the result is the same as checking every entry.
 */
export function deprecatedTagsOf(tags: Tags, index: DeprecatedIndex): DeprecatedTag[] {
  if (Object.keys(tags).length === 0) return []
  const found: Candidate[] = []
  for (const key of Object.keys(tags)) {
    const entries = index.get(key)
    if (!entries) continue
    for (const candidate of entries.wildcard) if (matches(tags, candidate)) found.push(candidate)
    const value = tags[key]
    if (!value) continue
    for (const candidate of entries.byValue.get(value) ?? [])
      if (matches(tags, candidate)) found.push(candidate)
    // a semicolon-delimited value matches an entry whose value is one of its values (as `matches` reads it)
    const values = value.split(';').filter(Boolean)
    if (values.length < 2) continue
    for (const part of new Set(values))
      for (const candidate of entries.byValue.get(part) ?? [])
        if (matches(tags, candidate)) found.push(candidate)
  }
  found.sort((a, b) => a.position - b.position)
  return found.map((candidate) => candidate.entry)
}
