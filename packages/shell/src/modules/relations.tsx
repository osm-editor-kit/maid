import { defineModule } from '@osm-editor-kit/maid-core'
import { OsmRelation } from '@osm-editor-kit/maid-model'
import { lazyComponent, type InspectorSection } from '@osm-editor-kit/maid-ui'
import { memberRows, membersHeadline, membershipsOf } from './relations-logic.ts'
import { RelationsOnMap } from './relations-map.tsx'

// The two sections are drawn inside the inspector, which is itself a chunk of its own. Their code (the member
// list, the role inputs, "Add to a relation") is another: loaded in idle time after the first view (lazyComponent).
const MembersSection = lazyComponent(() =>
  import('./relations-sections.tsx').then((sections) => ({ default: sections.MembersSection })),
)
const RelationsSection = lazyComponent(() =>
  import('./relations-sections.tsx').then((sections) => ({ default: sections.RelationsSection })),
)

/** Adds "Members" (for relations) and "Relations" (for every element) to the inspector. */
export function relations() {
  return defineModule({
    id: 'relations',
    setup(api) {
      const members: InspectorSection = {
        id: 'relation-members',
        title: 'Members',
        when: (entity) => entity.type === 'relation',
        disclosure: 'open',
        detail: (entity, editor) => {
          const relation = editor.history.staging.graph.hasEntity(entity.id)
          if (!(relation instanceof OsmRelation)) return undefined
          return membersHeadline(memberRows(editor.history.staging.graph, relation))
        },
        component: MembersSection,
      }
      const memberships: InspectorSection = {
        id: 'relation-memberships',
        title: 'Relations',
        // most features are in no relation: folded, with the number in the headline
        disclosure: 'closed',
        detail: (entity, editor) => membershipsOf(editor.history.staging.graph, entity.id).length,
        component: RelationsSection,
      }
      api.register('inspector.section', members)
      api.register('inspector.section', memberships)
      api.register('map.content', { id: 'relations-map', component: RelationsOnMap })
    },
  })
}
