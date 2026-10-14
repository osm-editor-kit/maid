// Relation members, ported from iD: osmMatchTags (modules/osm/tags.ts, from PR 12988), utilGetValidRelationRoles
// and the schema reading of presetPreset.relationSchema (modules/util/relation_schema.ts and presets/preset.ts,
// PRs 12768 and 12991). The lookup of the roles of a relation, with the labels, is in presets.ts (relationRoles).
import { asGeometries, asNumber, asRecord, asString, asTags } from './raw.ts'
import type { RawRecord } from './raw.ts'
import type { Geometry, RelationMemberRule, RelationRoles, RelationSchema, Tags } from './types.ts'

/**
 * iD's osmMatchTags: true when `tags` match one of the patterns. A pattern matches when each of its keys matches:
 * `*` matches any value, a value matches itself, and a value of `a;b` matches `a` or `b`. An empty value counts
 * as no value, so the empty pattern matches anything and no pattern matches an empty list.
 */
export function matchTagPatterns(patterns: readonly Tags[], tags: Tags): boolean {
  return patterns.some((pattern) =>
    Object.keys(pattern).every((key) => {
      const expected = pattern[key] ?? ''
      // own keys only: `tags.constructor` is a function, not a tag
      const actual = Object.hasOwn(tags, key) ? tags[key] : undefined
      if (!actual) return false
      if (expected === '*') return true
      if (expected === actual) return true
      return actual.includes(';') && actual.split(';').filter(Boolean).includes(expected)
    }),
  )
}

/**
 * iD's utilGetValidRelationRoles: the roles whose member rule lets a member with this geometry and these tags take
 * the role. An undefined geometry or tags skips that filter. The roles keep their order.
 */
export function validRelationRoles(
  roles: RelationRoles,
  geometry: Geometry | undefined,
  tags: Tags | undefined,
): RelationRoles {
  const filtered: RelationRoles = {}
  for (const [role, definition] of Object.entries(roles)) {
    const { member } = definition
    if (
      geometry !== undefined &&
      member.geometry !== undefined &&
      !member.geometry.includes(geometry)
    )
      continue
    if (
      tags !== undefined &&
      member.matchTags !== undefined &&
      !matchTagPatterns(member.matchTags, tags)
    )
      continue
    filtered[role] = definition
  }
  return filtered
}

/** The `matchTags` of a member rule: the objects of the array that are objects, each as its string tags. */
function tagPatternsOf(value: unknown): Tags[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.flatMap((item) => {
    const record = asRecord(item)
    return record ? [asTags(record)] : []
  })
}

/** The members of a schema's `relation` entry: an entry without a string `role` is left out. */
function membersOf(value: unknown): RelationMemberRule[] {
  if (!Array.isArray(value)) return []
  const members: RelationMemberRule[] = []
  for (const item of value) {
    const record = asRecord(item)
    const role = asString(record?.role)
    if (record === undefined || role === undefined) continue
    const member: RelationMemberRule = { role }
    if (Array.isArray(record.geometry)) member.geometry = asGeometries(record.geometry)
    const matchTags = tagPatternsOf(record.matchTags)
    if (matchTags !== undefined) member.matchTags = matchTags
    const min = asNumber(record.min)
    if (min !== undefined) member.min = min
    const max = asNumber(record.max)
    if (max !== undefined) member.max = max
    members.push(member)
  }
  return members
}

/**
 * The `relation` entry of a raw preset, read without trusting its shape, or undefined when the preset has none.
 * Absent `members` read as no members.
 */
export function relationSchemaOf(raw: RawRecord): RelationSchema | undefined {
  const relation = asRecord(raw.relation)
  if (relation === undefined) return undefined
  const schema: RelationSchema = { members: membersOf(relation.members) }
  const reference = asString(relation.reference)
  if (reference !== undefined) schema.reference = reference
  if (typeof relation.allowDuplicateMembers === 'boolean') {
    schema.allowDuplicateMembers = relation.allowDuplicateMembers
  }
  const labels = asRecord(relation.role_labels)
  if (labels !== undefined) schema.role_labels = asTags(labels)
  return schema
}
