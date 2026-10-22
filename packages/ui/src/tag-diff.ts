/**
 * The rows of a tag diff, pure (no React): one row per key, sorted by key, as the "Upgrade the tags" diff of iD's
 * outdated-tags issue lists them. `added`: only in `after`; `removed`: only in `before`; `changed`: in both with
 * other values; `unchanged`: in both with the same value.
 */
export type TagDiffRow =
  | { readonly kind: 'added'; readonly key: string; readonly value: string }
  | { readonly kind: 'removed'; readonly key: string; readonly value: string }
  | {
      readonly kind: 'changed'
      readonly key: string
      readonly before: string
      readonly after: string
    }
  | { readonly kind: 'unchanged'; readonly key: string; readonly value: string }

export function tagDiffRows(
  before: Readonly<Record<string, string>>,
  after: Readonly<Record<string, string>>,
): TagDiffRow[] {
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
  return keys.map((key): TagDiffRow => {
    const inBefore = Object.hasOwn(before, key)
    const inAfter = Object.hasOwn(after, key)
    if (inBefore && !inAfter) return { kind: 'removed', key, value: before[key]! }
    if (!inBefore && inAfter) return { kind: 'added', key, value: after[key]! }
    if (before[key] === after[key]) return { kind: 'unchanged', key, value: after[key]! }
    return { kind: 'changed', key, before: before[key]!, after: after[key]! }
  })
}
