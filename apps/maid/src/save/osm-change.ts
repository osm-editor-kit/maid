import {
  OsmEntity,
  OsmNode,
  OsmRelation,
  OsmWay,
  type ChangesSummary,
} from '@osm-editor-kit/maid-model'
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
export function summaryOf(change: OsmChange): string {
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
 * The changeset's tags. `created_by` and `comment` as every editor sets them; hashtags are taken
 * from the comment as iD does (`#mapathon` → `hashtags=#mapathon`).
 */
export function changesetTags(comment: string, version: string): Record<string, string> {
  const text = comment.trim()
  const tags: Record<string, string> = { created_by: `Maid ${version}`, comment: text }
  const hashtags = [...new Set(text.match(/#[^\s#;,.!?]{2,}/g) ?? [])]
  if (hashtags.length > 0) tags.hashtags = hashtags.join(';')
  return tags
}
