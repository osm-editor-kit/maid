import { OsmWay, actionChangeTags } from '@osm-editor-kit/maid-model'
import type { OsmEntity } from '@osm-editor-kit/maid-model'
import { locationOf } from '../geo.ts'
import type { Fix, Issue, LookupPreset, PresetLookup, Rule, RuleContext } from '../types.ts'

// Ported from iD's validations/outdated_tags.js (ISC, © iD contributors), at commit 0194f3926: the deprecated
// tags of the schema and their upgrade, a preset that is replaced by another, and the tags that a preset adds.
// Not ported: iD's name-suggestion-index brand upgrades (noncanonical_brand), which need the NSI data.
// The rule needs the presets (`context.presets`): until they are made it reports nothing, and the validator
// checks again what was changed when they are there.

type Tags = Record<string, string>

/** One change of a tag diff, as iD's utilTagDiff: `-` a removed value, `+` an added one, `~` a context tag that did not change */
export type TagDiff = { type: '+' | '-' | '~'; key: string; oldVal?: string; newVal?: string }

/** iD's utilTagDiff: what differs between two tag sets, in key order. A changed value is a removal and an addition. */
export function tagDiffOf(
  oldTags: Readonly<Tags>,
  newTags: Readonly<Tags>,
  contextKeys: readonly string[] = [],
): TagDiff[] {
  const diff: TagDiff[] = []
  const keys = [...new Set([...Object.keys(oldTags), ...Object.keys(newTags)])].sort()
  for (const key of keys) {
    const oldVal = oldTags[key]
    const newVal = newTags[key]
    if ((oldVal || oldVal === '') && (newVal === undefined || newVal !== oldVal))
      diff.push({ type: '-', key, oldVal })
    if ((newVal || newVal === '') && (oldVal === undefined || newVal !== oldVal))
      diff.push({ type: '+', key, newVal })
    if (contextKeys.includes(key) && newVal !== undefined && newVal === oldVal)
      diff.push({ type: '~', key, newVal })
  }
  return diff
}

/**
 * iD's actionUpgradeTags on a tag set: the `old` tags are removed (a `*` value is kept for a `$1` in `replace`, a
 * value inside a semicolon list is removed from the list), then `replace` is set (a `*` becomes `yes` unless the key
 * has a value other than `no`).
 */
export function upgradeTags(tags: Readonly<Tags>, old: Tags, replace?: Tags): Tags {
  const result: Tags = { ...tags }
  const transferred: string[] = []
  let semiIndex: number | undefined
  for (const oldKey of Object.keys(old)) {
    const current = result[oldKey]
    if (current === undefined) continue
    const oldValue = old[oldKey] ?? ''
    if (oldValue === '*') {
      transferred.push(current)
      delete result[oldKey]
    } else if (oldValue === current) {
      delete result[oldKey]
    } else {
      const values = current.split(';').filter(Boolean)
      const index = values.indexOf(oldValue)
      if (values.length === 1 || index === -1) {
        delete result[oldKey]
      } else {
        // a value of a list is replaced: the new value goes where the old one was
        if (replace?.[oldKey]) semiIndex = index
        values.splice(index, 1)
        result[oldKey] = values.join(';')
      }
    }
  }
  for (const replaceKey of Object.keys(replace ?? {})) {
    const replaceValue = replace?.[replaceKey] ?? ''
    if (replaceValue === '*') {
      const existing = result[replaceKey]
      if (existing && existing !== 'no') continue
      result[replaceKey] = 'yes'
    } else if (replaceValue.startsWith('$')) {
      const value = transferred[Number(replaceValue.substring(1)) - 1]
      if (value === undefined) delete result[replaceKey]
      else result[replaceKey] = value
    } else {
      const existing = result[replaceKey]
      if (existing && old[replaceKey] && semiIndex !== undefined) {
        // a value that is there already is not overwritten
        const values = existing.split(';').filter(Boolean)
        if (!values.includes(replaceValue)) {
          values.splice(semiIndex, 0, replaceValue)
          result[replaceKey] = values.join(';')
        }
      } else {
        result[replaceKey] = replaceValue
      }
    }
  }
  return result
}

/** iD's special case for a closed island (id-tagging-schema issue 1162), kept as iD keeps it */
const trafficCalmingIsland = {
  old: { traffic_calming: 'island' },
  replace: { 'area:highway': 'traffic_island' },
}

/** A short hash of a text, for the id of an issue (iD uses its utilHashcode for the same) */
function hashOf(text: string) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function upgradeFix(entityId: string, diff: readonly TagDiff[]): Fix {
  return {
    id: 'upgrade_tags',
    label: 'Upgrade the tags',
    annotation: 'Upgraded the tags',
    // as iD's doUpgrade: the diff is applied to the tags as they are now, so an undo step is one change of the tags
    actions: (graph) => {
      const entity = graph.hasEntity(entityId)
      if (!entity) return []
      const tags: Tags = { ...entity.tags }
      for (const change of diff) {
        if (change.type === '-') delete tags[change.key]
        else if (change.type === '+') tags[change.key] = change.newVal ?? ''
      }
      return [actionChangeTags(entityId, tags)]
    },
  }
}

function labelOf(entity: OsmEntity) {
  return entity.tags.name || 'This feature'
}

/** The tags of one entity, as iD's oldTagIssues: a replaced preset, the deprecated tags, then the tags its preset adds */
function outdatedIn(entity: OsmEntity, context: RuleContext, presets: PresetLookup): Issue[] {
  if (!entity.hasInterestingTags()) return []
  const { graph } = context
  const geometry = entity.geometry(graph)
  let preset: LookupPreset = presets.match(entity.tags, geometry, locationOf(entity, graph))
  const oldTags: Tags = { ...entity.tags }
  let tags: Tags = { ...entity.tags }

  // Upgrade preset, if a replacement is available
  if (preset.replacement !== undefined) {
    const replacement = presets.preset(preset.replacement)
    if (replacement) {
      tags = presets.applyPreset(tags, replacement, geometry, preset, { skipFieldDefaults: true })
      preset = replacement
    }
  }

  // Upgrade deprecated tags, one entry after the other, as iD does
  const deprecated = presets.deprecatedTags(tags)
  if (
    entity instanceof OsmWay &&
    entity.isClosed() &&
    tags.traffic_calming === 'island' &&
    !tags.highway
  )
    deprecated.push(trafficCalmingIsland)
  for (const entry of deprecated) tags = upgradeTags(tags, entry.old, entry.replace)

  // Add the tags of the preset that are missing, as iD's addTags does
  const newTags: Tags = { ...tags }
  if (preset.addTags !== preset.tags) {
    for (const [key, value] of Object.entries(preset.addTags)) {
      if (newTags[key]) continue
      if (value === '*') newTags[key] = 'yes'
      else if (value) newTags[key] = value
    }
  }

  // A key that an upgrade replaces, and that keeps its value, is shown as context of the change
  const contextKeys = Object.keys(oldTags)
    .filter((key) => deprecated.some((entry) => entry.replace?.[key] !== undefined))
    .filter((key) => newTags[key] === oldTags[key])
  const diff = tagDiffOf(oldTags, newTags, contextKeys)
  if (!diff.some((change) => change.type !== '~')) return []

  // only additions: the tags are incomplete; a removal: the tags are outdated
  const incomplete = !diff.some((change) => change.type === '-')
  const subtype = incomplete ? 'incomplete_tags' : 'deprecated_tags'
  const label = labelOf(entity)
  return [
    {
      id: `outdated_tags:${entity.id}:${subtype}:${hashOf(JSON.stringify(diff))}`,
      rule: 'outdated_tags',
      severity: 'warning',
      message: incomplete ? `${label} is missing tags` : `${label} has outdated tags`,
      entityIds: [entity.id],
      fixes: [upgradeFix(entity.id, diff)],
      data: { subtype, tagDiff: diff },
    },
  ]
}

/**
 * The tags that are outdated: a deprecated key or value of the schema's list (replaced by its new tags), a preset that
 * is replaced by another, and the tags that the matched preset adds and the feature lacks. A warning, with the fix
 * "Upgrade the tags". Its data: `subtype` (`deprecated_tags` or `incomplete_tags`) and `tagDiff`.
 */
export const outdatedTags: Rule = {
  id: 'outdated_tags',
  label: 'Outdated tags',
  validate(entity, context) {
    const presets = context.presets
    if (!presets) return []
    return outdatedIn(entity, context, presets)
  },
}
