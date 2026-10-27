/**
 * The tag diff of one option against the tags of a feature: what picking the option would change, and whether it is
 * already done. Pure functions: no network, nothing is mutated.
 */
import type { TaskOption } from './schema.ts'

/** How one key changes: added, changed, removed, or already as the option wants it */
export type TagChangeKind = 'add' | 'change' | 'remove' | 'same'

/** The change of one key. `from` is the value now (absent when the key is not set), `to` the value the option sets. */
export type TagChange = { key: string; kind: TagChangeKind; from?: string; to?: string }

/** The value of a key that the tags hold, or undefined. Own keys only, so `constructor` is not a tag. */
function valueOf(tags: Readonly<Record<string, string>>, key: string) {
  return Object.hasOwn(tags, key) ? tags[key] : undefined
}

/**
 * The changes an option makes to the tags, one per key the option names, sorted by key. A key in `set` is `add`
 * when the feature lacks it, `same` when it has that value, else `change`. A key in `remove` is `remove` when the
 * feature has it, else `same`. A key in both (not allowed by the format) counts as `set`.
 */
export function diffOption(
  current: Readonly<Record<string, string>>,
  option: Pick<TaskOption, 'set' | 'remove'>,
): TagChange[] {
  const set = option.set ?? {}
  const remove = option.remove ?? []
  const keys = new Set([...Object.keys(set), ...remove])
  return [...keys].toSorted().map((key): TagChange => {
    const from = valueOf(current, key)
    if (Object.hasOwn(set, key)) {
      const to = set[key]
      if (from === undefined) return { key, kind: 'add', to }
      if (from === to) return { key, kind: 'same', from, to }
      return { key, kind: 'change', from, to }
    }
    if (from === undefined) return { key, kind: 'same' }
    return { key, kind: 'remove', from }
  })
}

/**
 * The tags after picking the option: the removed keys are gone, the set keys hold their new values, every other key
 * stays. Returns a new object; `current` is not changed.
 */
export function applyOption(
  current: Readonly<Record<string, string>>,
  option: Pick<TaskOption, 'set' | 'remove'>,
): Record<string, string> {
  const tags = new Map(Object.entries(current))
  for (const key of option.remove ?? []) tags.delete(key)
  for (const [key, value] of Object.entries(option.set ?? {})) tags.set(key, value)
  return Object.fromEntries(tags)
}

/** True when picking the option would change nothing: every key is `same`, and the removed keys are absent */
export function isApplied(
  current: Readonly<Record<string, string>>,
  option: Pick<TaskOption, 'set' | 'remove'>,
) {
  return diffOption(current, option).every((change) => change.kind === 'same')
}
