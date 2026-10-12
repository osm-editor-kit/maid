import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Graph } from '@osm-editor-kit/maid-model'
import { locationOf } from '../geo.ts'
import type { Fix, Issue, Rule } from '../types.ts'

/**
 * Tags that exclude each other, from iD's `osmMutuallyExclusiveTagPairs` (the OSM wiki's list of
 * property P44). The first tag of a pair says the second one is not there.
 */
const mutuallyExclusivePairs: readonly (readonly [string, string])[] = [
  ['noname', 'name'],
  ['noref', 'ref'],
  ['nohousenumber', 'addr:housenumber'],
  ['noaddress', 'addr:housenumber'],
  ['noaddress', 'addr:housename'],
  ['noaddress', 'addr:unit'],
  ['addr:nostreet', 'addr:street'],
]

type Conflict = { first: string; second: string; sameValue: boolean }

/** `noname=no` is a double negation: positive and not conflicting, so it is ignored */
function isNegatedNo(key: string, tags: Readonly<Record<string, string>>): boolean {
  return /^(addr:)?no[a-z]/.test(key) && tags[key] === 'no'
}

/** The conflicts of one entity's tags, in iD's order: the pairs first, then `not:` tags */
function conflictsOf(tags: Readonly<Record<string, string>>): Conflict[] {
  const conflicts: Conflict[] = mutuallyExclusivePairs
    .filter(([first, second]) => first in tags && second in tags)
    .filter(([first, second]) => !isNegatedNo(first, tags) && !isNegatedNo(second, tags))
    .map(([first, second]) => ({ first, second, sameValue: false }))

  // `not:name=Lous` on `name=Lous` says the name is not the name: the same value is a conflict too.
  // `not:` may list several values, separated by `;`.
  for (const key of Object.keys(tags)) {
    const value = tags[key]
    if (value === undefined) continue
    const negativeKey = `not:${key}`
    if (negativeKey in tags && (tags[negativeKey] ?? '').split(';').includes(value)) {
      conflicts.push({ first: negativeKey, second: key, sameValue: true })
    }
    // name:xx is also compared with not:name
    if (/^name:[a-z]+/.test(key) && 'not:name' in tags) {
      if ((tags['not:name'] ?? '').split(';').includes(value)) {
        conflicts.push({ first: 'not:name', second: key, sameValue: true })
      }
    }
  }
  return conflicts
}

/** Removes one tag from the entity, as one undo step */
function removeTagFix(entityId: string, key: string): Fix {
  return {
    id: `remove_tag:${key}`,
    label: `Remove ${key}`,
    annotation: `Removed ${key}`,
    actions(graph: Graph) {
      const entity = graph.hasEntity(entityId)
      if (!entity) return []
      const tags: Record<string, string> = { ...entity.tags }
      delete tags[key]
      return [actionChangeTags(entityId, tags)]
    },
  }
}

/** Features whose tags contradict each other, e.g. `name` and `noname` */
export const mutuallyExclusiveTags: Rule = {
  id: 'mutually_exclusive_tags',
  label: 'Mutually exclusive tags',
  validate(entity, { graph }): Issue[] {
    const conflicts = conflictsOf(entity.tags)
    const loc = locationOf(entity, graph)
    return conflicts.map((conflict): Issue => {
      const { first, second, sameValue } = conflict
      const message = sameValue
        ? `${first} repeats the value of ${second}, so the feature says it is not called that`
        : `Has both ${first} and ${second}, which exclude each other`
      return {
        id: `mutually_exclusive_tags:${entity.id}:${first}:${second}`,
        rule: 'mutually_exclusive_tags',
        severity: 'warning',
        message,
        entityIds: [entity.id],
        ...(loc ? { loc } : {}),
        fixes: [removeTagFix(entity.id, first), removeTagFix(entity.id, second)],
        data: { tags: [first, second], sameValue },
      }
    })
  },
}
