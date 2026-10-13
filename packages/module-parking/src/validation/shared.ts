// Helpers for the parking validation rules. Pure: tags in, issues and fixes out.
import { actionChangeTags } from '@osm-editor-kit/maid-model'
import type { Fix, Issue, Rule } from '@osm-editor-kit/maid-validation'
import { isGerman } from '../language.ts'
import { sideKey } from '../sides.ts'
import type { Side } from '../sides.ts'
import { FIXES_DE, MESSAGES_DE } from './messages-de.ts'

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

/**
 * One warning about one entity. `message` is the English text; where the page is German the text of MESSAGES_DE for
 * the rule is shown instead.
 */
export function issueFor(args: {
  rule: string
  entity: Entity
  /** Tells the issues of one entity apart: appended to its id */
  part?: string
  feature: string
  /** The tags the issue is about, as `key=value` pairs */
  tags: string
  message: string
  fixes: Fix[]
}): Issue {
  const german = isGerman() ? MESSAGES_DE[args.rule] : undefined
  return {
    id: `${args.rule}:${args.entity.id}${args.part ?? ''}`,
    rule: args.rule,
    severity: 'warning',
    message: german ? german({ feature: args.feature, tags: args.tags }) : args.message,
    entityIds: [args.entity.id],
    fixes: args.fixes,
    data: { tags: args.tags },
  }
}

/**
 * A fix that changes the tags of one entity, as one undo step. `label` and `annotation` are English; where the page
 * is German the texts of FIXES_DE for the fix id are used, with `subject` (the key the fix is about).
 */
export function tagsFix(args: {
  entityId: string
  id: string
  label: string
  annotation: string
  subject: string
  change: (tags: Tags) => Record<string, string>
}): Fix {
  const german = isGerman() ? FIXES_DE[args.id]?.(args.subject) : undefined
  return {
    id: args.id,
    label: german?.label ?? args.label,
    annotation: german?.annotation ?? args.annotation,
    actions: (graph) => {
      const entity = graph.hasEntity(args.entityId)
      return entity ? [actionChangeTags(args.entityId, args.change(entity.tags))] : []
    },
  }
}
