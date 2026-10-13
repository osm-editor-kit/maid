// The schema's deprecated tags, ported from iD's modules/osm/deprecated.ts (ISC, © iD contributors), at commit
// 0194f3926: getDeprecatedTags, with the entries indexed by key so that a tag set is looked up, not searched.
import { asRecord, asTags } from './raw.ts'
import type { DeprecatedTag, Tags } from './types.ts'

/** The entries of the list, each with its place in the list, by their first `old` key (every match has that key) */
export type DeprecatedIndex = ReadonlyMap<
  string,
  readonly { position: number; entry: DeprecatedTag }[]
>

/** The list of the schema, read without trusting its shape: an entry that is not an object with `old` is left out */
export function deprecatedIndexOf(raw: unknown): DeprecatedIndex {
  const index = new Map<string, { position: number; entry: DeprecatedTag }[]>()
  if (!Array.isArray(raw)) return index
  raw.forEach((item, position) => {
    const record = asRecord(item)
    const old = asTags(record?.old)
    // an entry without `old` would match every feature: iD's data has none, so it is left out here
    const [firstKey] = Object.keys(old)
    if (firstKey === undefined) return
    const replace = asRecord(record?.replace) ? asTags(record?.replace) : undefined
    const entry: DeprecatedTag = replace ? { old, replace } : { old }
    const list = index.get(firstKey)
    if (list) list.push({ position, entry })
    else index.set(firstKey, [{ position, entry }])
  })
  return index
}

/** iD's getDeprecatedTags for one entry: true when the tags have every `old` tag and the upgrade would not overwrite a value */
function matches(tags: Tags, deprecated: DeprecatedTag): boolean {
  const { old, replace } = deprecated
  const oldKeys = Object.keys(old)
  // the wildcard keys of `old`, in order: the values `$1`, `$2` of `replace` refer to them
  const transferKeys = oldKeys.filter((key) => old[key] === '*')

  if (replace) {
    // don't flag deprecated tags if the upgrade path would overwrite existing data (iD #7843)
    const overwrites = Object.keys(replace).some((replaceKey) => {
      if (!tags[replaceKey] || old[replaceKey]) return false
      const replaceValue = replace[replaceKey] ?? ''
      if (replaceValue === '*') return false
      if (
        replaceValue.startsWith('$1') &&
        tags[replaceKey] === tags[transferKeys[Number(replaceValue.substring(1)) - 1] ?? '']
      )
        return false
      if (replaceValue === tags[replaceKey]) return false
      return true
    })
    if (overwrites) return false
  }

  return oldKeys.every((oldKey) => {
    const value = tags[oldKey]
    if (!value) return false
    const oldValue = old[oldKey]
    if (oldValue === '*' || oldValue === value) return true
    // a semicolon-delimited value matches when one of its values is the old one
    const values = value.split(';').filter(Boolean)
    if (values.length === 0) return false
    return values.length > 1 && values.includes(oldValue ?? '')
  })
}

/** The entries of the list that these tags match, in the list's order */
export function deprecatedTagsOf(tags: Tags, index: DeprecatedIndex): DeprecatedTag[] {
  if (Object.keys(tags).length === 0) return []
  const found: { position: number; entry: DeprecatedTag }[] = []
  for (const key of Object.keys(tags))
    for (const candidate of index.get(key) ?? [])
      if (matches(tags, candidate.entry)) found.push(candidate)
  found.sort((a, b) => a.position - b.position)
  return found.map((candidate) => candidate.entry)
}
