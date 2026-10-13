/**
 * The issues of several selected features: the ones that involve any of them, in iD's order. Pure: the
 * validator passes its issues in, so this is the rule alone (iD's `validator.getSharedEntityIssues`,
 * core/validator.js 349-380).
 */
import type { Issue } from './types.ts'

/**
 * iD's explicit order of the issue types: missing data first, then identity, then geometry, then
 * connectivity. The rules here have the same names as iD's types. A rule not in the list comes after
 * these, sorted by name.
 */
const ORDER = [
  'missing_tag',
  'missing_role',
  'outdated_tags',
  'mismatched_geometry',
  'crossing_ways',
  'almost_junction',
  'disconnected_way',
  'impossible_oneway',
]

/** Plain code-unit order, as iD compares its ids and types with `<` */
function before(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The order of iD's `getSharedEntityIssues`: a listed rule comes before one not listed, listed rules
 * in their order, unlisted rules by name; issues of one rule by id.
 */
export function compareSharedIssues(a: Issue, b: Issue): number {
  if (a.rule === b.rule) return before(a.id, b.id)
  const indexA = ORDER.indexOf(a.rule)
  const indexB = ORDER.indexOf(b.rule)
  if (indexA !== -1 && indexB !== -1) return indexA - indexB
  if (indexA === -1 && indexB === -1) return before(a.rule, b.rule)
  return indexA !== -1 ? -1 : 1
}

/**
 * The issues that involve at least one of the features, in iD's order. An issue that involves two
 * selected features is listed once. An issue that involves none of them is left out.
 * @param   issues - All issues the validator has
 * @param   ids    - The selected features
 * @return  The shared issues, sorted by `compareSharedIssues`
 */
export function sharedIssues(issues: readonly Issue[], ids: Iterable<string>): Issue[] {
  const selected = new Set(ids)
  return issues
    .filter((issue) => issue.entityIds.some((id) => selected.has(id)))
    .sort(compareSharedIssues)
}
