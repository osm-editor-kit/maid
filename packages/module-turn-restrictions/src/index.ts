import { defineModule } from '@osm-editor-kit/maid-core'
import { m } from '@osm-editor-kit/maid-i18n'
import { lazyComponent } from '@osm-editor-kit/maid-ui'
import type { Rule } from '@osm-editor-kit/maid-validation'
import { createElement } from 'react'
import { isJunction } from './is-junction.ts'
import { turnRestrictionIncomplete } from './restriction-rule.ts'
import type {
  TurnRestrictionsDefaults,
  TurnRestrictionsSectionProps,
} from './TurnRestrictionsSection.tsx'

export type TurnRestrictionsOptions = Partial<TurnRestrictionsDefaults>

/**
 * The turn restrictions editor (iD's "Turn Restrictions" field): `inspector.section` "Turn restrictions" on a junction
 * (a vertex of three or more highways). A disclosure like Tags, Element and Relations, open at first: a junction has
 * little else in the sidebar. The section's chunk loads when it is first shown, so the start path does not get it.
 * The validation rule (`turnRestrictionRules`) is not registered here: the app's config lists it, as with
 * the parking module (see the report of the module's build).
 */
export function turnRestrictions(options: TurnRestrictionsOptions = {}) {
  const defaults: TurnRestrictionsDefaults = {
    maxDistance: options.maxDistance ?? 30,
    maxViaWays: options.maxViaWays ?? 0,
  }
  return defineModule({
    id: 'turn-restrictions',
    setup(api) {
      const Section = lazyComponent(() =>
        import('./TurnRestrictionsSection.tsx').then((part) => ({
          default: (props: Omit<TurnRestrictionsSectionProps, 'defaults'>) =>
            createElement(part.TurnRestrictionsSection, { ...props, defaults }),
        })),
      )
      const graph = () => api.editor.history.staging.graph
      api.register('inspector.section', {
        id: 'turn-restrictions',
        title: m.turn_restrictions_title(),
        // a junction of three or more highways, and a single selected node (iD: a field of the vertex)
        when: (entity) => entity.type === 'node' && isJunction(graph(), entity.id),
        disclosure: 'open',
        tone: 'relation',
        component: Section,
      })
    },
  })
}

export const turnRestrictionRules: Rule[] = [turnRestrictionIncomplete]
export { TURN_RESTRICTION_RULE_ID, turnRestrictionIncomplete } from './restriction-rule.ts'
export {
  cycleTurn,
  turnKindOf,
  turnStateOf,
  type CycleResult,
  type RemovedTurn,
  type TurnKind,
  type TurnState,
} from './turns.ts'
export { isJunction } from './is-junction.ts'
export {
  junctionSketch,
  junctionTurns,
  type JunctionSketch,
  type JunctionTurn,
} from './junction.ts'
