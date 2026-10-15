import {
  OsmEntity,
  OsmNode,
  OsmRelation,
  OsmWay,
  type ChangesSummary,
} from '@osm-editor-kit/maid-model'
import { cleanTagValue, draftHashtags, TAG_VALUE_MAX, type Draft } from './changeset-draft.ts'
import { cleanTags, discardTags, type DiscardList } from './clean-tags.ts'

/**
 * One element of an upload, in the shape the `osm-api` package sends as osmChange. A new element
 * has a negative id; the server answers with the real one.
 */
export type ChangeElement = {
  id: number
  version: number
  tags: Record<string, string>
} & (
  | { type: 'node'; lat: number; lon: number }
  | { type: 'way'; nodes: number[] }
  | {
      type: 'relation'
      members: { type: 'node' | 'way' | 'relation'; ref: number; role: string }[]
    }
)

export type OsmChange = {
  create: ChangeElement[]
  modify: ChangeElement[]
  delete: ChangeElement[]
}

/** `n123` → 123, and `w-4` (made here) → -4 */
const numberOf = (id: string) => Number.parseInt(OsmEntity.toOSM(id), 10)

const RANK = { node: 0, way: 1, relation: 2 }

function element(entity: OsmEntity): ChangeElement | undefined {
  const base = { id: numberOf(entity.id), version: entity.version ?? 0, tags: { ...entity.tags } }
  if (entity instanceof OsmNode) {
    // a node without a place cannot exist on the server; the model only has them half-loaded
    if (!entity.loc) return undefined
    return { ...base, type: 'node', lon: entity.loc[0], lat: entity.loc[1] }
  }
  if (entity instanceof OsmWay) return { ...base, type: 'way', nodes: entity.nodes.map(numberOf) }
  if (entity instanceof OsmRelation) {
    return {
      ...base,
      type: 'relation',
      members: entity.members.map((member) => ({
        type: member.type,
        ref: numberOf(member.id),
        role: member.role,
      })),
    }
  }
  return undefined
}

function elements(entities: OsmEntity[], order: 1 | -1): ChangeElement[] {
  return entities
    .map(element)
    .filter((e) => e !== undefined)
    .sort((a, b) => order * (RANK[a.type] - RANK[b.type]) || a.id - b.id)
}

/**
 * The tags of a created or modified element as they are uploaded: cleaned as iD does, then the
 * discard list. This is a copy; the editor's entity keeps what the person typed.
 */
function uploaded(e: ChangeElement, discarded: DiscardList): ChangeElement {
  return { ...e, tags: discardTags(cleanTags(e.tags), discarded) }
}

/**
 * What the history changed, as an upload. Nodes come before the ways and relations that use
 * them; deletions go the other way round, so nothing is deleted while it is still used.
 *
 * Created and changed elements have their tags cleaned and discarded (clean-tags.ts). Deleted
 * elements are sent as they are: iD sends them whole too, and a delete needs only the id and
 * version. `discarded` is iD's discard list (id-tagging-schema's `discarded.json`). Maid's save
 * does not pass one yet: that file is in packages/presets' dependencies and apps/maid cannot
 * import it without a new dependency or a re-export from packages/presets. Until then only
 * empty values are dropped.
 */
export function toOsmChange(changes: ChangesSummary, discarded: DiscardList = {}): OsmChange {
  return {
    create: elements(changes.created, 1).map((e) => uploaded(e, discarded)),
    modify: elements(changes.modified, 1).map((e) => uploaded(e, discarded)),
    delete: elements(changes.deleted, -1),
  }
}

/** "3 created, 1 changed, 2 deleted", without the parts that are zero */
export function summaryOf(change: OsmChange) {
  const parts = [
    [change.create.length, 'created'],
    [change.modify.length, 'changed'],
    [change.delete.length, 'deleted'],
  ] as const
  return parts
    .filter(([count]) => count > 0)
    .map(([count, word]) => `${count} ${word}`)
    .join(', ')
}

/**
 * The value of `imagery_used`: the names, each once, `;`-separated, as iD's `cleanTagValue` gives
 * it (trimmed, NFC, cut to 255 characters). Empty when there are no names.
 */
export function imageryUsedValue(names: readonly string[]) {
  const unique = [...new Set(names.map((name) => name.trim()).filter((name) => name !== ''))]
  const joined = unique.join(';').trim().normalize('NFC')
  return Array.from(joined).slice(0, TAG_VALUE_MAX).join('')
}

/**
 * The changeset's `created_by`: the app's name and version, as `Maid 0.1.0` or `Maid Parking 0.1.0`.
 * `name` is the app's brand name and `version` its package version. Throws when either is empty or
 * the value is longer than OSM's 255 characters, so nothing is uploaded under a wrong name.
 */
export function createdByValue(name: string, version: string) {
  const value = `${name.trim()} ${version.trim()}`
  if (name.trim() === '' || version.trim() === '') {
    throw new Error(`created_by needs an app name and a version, got "${name}" and "${version}"`)
  }
  if (Array.from(value).length > TAG_VALUE_MAX) {
    throw new Error(`created_by is longer than ${TAG_VALUE_MAX} characters: "${value}"`)
  }
  return value
}

/**
 * The changeset's tags, as iD writes them from the draft (changeset-draft.ts): `comment` cleaned, `hashtags` from the
 * comment and the hashtags the draft keeps, and `source` when there is one. `created_by` (from `createdByValue`) is
 * set by every editor. `imagery_used` lists the imagery on the map (`imagery` in the order given, background first)
 * as iD writes it; it is left out when there is none, where iD writes `None`.
 */
export function changesetTags(draft: Draft, createdBy: string, imagery: readonly string[] = []) {
  const tags: Record<string, string> = {
    created_by: createdBy,
    comment: cleanTagValue(draft.comment),
  }
  const hashtags = draftHashtags(draft)
  if (hashtags !== undefined) tags.hashtags = hashtags
  const source = cleanTagValue(draft.source ?? '')
  if (source !== '') tags.source = source
  const imageryUsed = imageryUsedValue(imagery)
  if (imageryUsed !== '') tags.imagery_used = imageryUsed
  return tags
}
