// TILDA bike infrastructure: an inspector section on every highway that shows how TILDA (tilda-geo.de) classifies the
// way and each side, asks what makes an incomplete category exact, plans the tags for another category ("Change to"),
// and lists the attributes a dataset needs. The UX of the TILDA box of the iD Radnetz Berlin fork; the logic is
// @tilda-geo/bicycle-infrastructure (TILDA's processing) and @tilda-geo/bicycle-infrastructure-tagging (planner,
// required attributes, texts). No network request: everything runs on the tags of the loaded data.
import { defineModule } from '@osm-editor-kit/maid-core'
import type { InspectorSectionProps } from '@osm-editor-kit/maid-ui'
import type { RequirementsProfile } from '@tilda-geo/bicycle-infrastructure-tagging'
import { radnetzBerlin } from '@tilda-geo/bicycle-infrastructure-tagging/profiles/radnetz-berlin'
import { createElement } from 'react'
import { m } from './messages.ts'
import { TildaSection } from './TildaSection.tsx'

export type TildaOptions = {
  /**
   * Which attributes the checklist asks for: the dataset's profile. Default: Radnetz Berlin. `tilda-geo` (from
   * `@tilda-geo/bicycle-infrastructure-tagging/profiles/tilda-geo`) asks only for what TILDA itself reads.
   */
  profile?: RequirementsProfile
}

/** The TILDA section of a highway. Switched on by the app's config. */
export function tilda(options: TildaOptions = {}) {
  const profile = options.profile ?? radnetzBerlin
  return defineModule({
    id: 'tilda',
    setup(api) {
      api.register('inspector.section', {
        id: 'tilda',
        title: m.tilda_title(),
        when: (entity) => entity.type === 'way' && entity.tags.highway !== undefined,
        disclosure: 'open',
        component: (props: InspectorSectionProps) =>
          createElement(TildaSection, { ...props, profile }),
      })
    },
  })
}

export {
  attributeDone,
  bothSidesKey,
  bothSidesUpdate,
  buildCards,
  mergeSides,
  openCount,
  type SideCard,
} from './cards.ts'
export { footwayNextTo, runsAlong, sideOf } from './footway.ts'
