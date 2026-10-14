// Helpers for the parking validation rules. Pure: tags in, issues and fixes out. Texts are read when a rule runs.
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Fix, Issue, Rule } from '@osm-editor-kit/maid-validation'
import { sideKey } from '../sides.ts'
import type { Side } from '../sides.ts'

export type Entity = Parameters<Rule['validate']>[0]
export type Graph = Parameters<Fix['actions']>[0]
export type Tags = Readonly<Record<string, string>>

/** The name for the issue text: the name of the feature with its highway or amenity tag */
export function featureName(tags: Tags): string {
  const kind = tags.highway
    ? `highway=${tags.highway}`
    : tags.amenity
      ? `amenity=${tags.amenity}`
      : 'feature'
  return tags.name ? `${tags.name} (${kind})` : kind
}

/** The key that holds the value of a side: its own key, else the `both` key (as `readSide` reads it) */
export function sourceKey(tags: Tags, side: Side, suffix?: string) {
  const own = sideKey(side, suffix)
  return tags[own] ? own : sideKey('both', suffix)
}

/** A `:conditional` key of a parking side, or of a parking area (`access:conditional` on `amenity=parking`) */
export function isParkingConditionalKey(key: string, tags: Tags) {
  return key.endsWith(':conditional') && (key.startsWith('parking:') || tags.amenity === 'parking')
}

/** One warning about one entity. `message` is the text in the page's language (the rule's message). */
export function issueFor(args: {
  rule: string
  entity: Entity
  /** Tells the issues of one entity apart: appended to its id */
  part?: string
  /** The tags the issue is about, as `key=value` pairs */
  tags: string
  message: string
  fixes: Fix[]
}): Issue {
  return {
    id: `${args.rule}:${args.entity.id}${args.part ?? ''}`,
    rule: args.rule,
    severity: 'warning',
    message: args.message,
    entityIds: [args.entity.id],
    fixes: args.fixes,
    data: { tags: args.tags },
  }
}

/** A fix that changes the tags of one entity, as one undo step. `label` and `annotation` are in the page's language. */
export function tagsFix(args: {
  entityId: string
  id: string
  label: string
  annotation: string
  change: (tags: Tags) => Record<string, string>
}): Fix {
  return {
    id: args.id,
    label: args.label,
    annotation: args.annotation,
    actions: (graph) => {
      const entity = graph.hasEntity(args.entityId)
      return entity ? [actionChangeTags(args.entityId, args.change(entity.tags))] : []
    },
  }
}
