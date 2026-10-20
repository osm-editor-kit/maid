import { defineModule } from '@osm-editor-kit/maid-core'
import { m } from '@osm-editor-kit/maid-i18n'
import { OsmRelation } from '@osm-editor-kit/maid-model'
import { lazyComponent, type InspectorSection } from '@osm-editor-kit/maid-ui'
import { memberRows, membersHeadline, membershipsOf } from './relations-logic.ts'
import { RelationsOnMap } from './relations-map.tsx'
import { currentOpenRelationId } from './relations-open-store.ts'
import { relationOperations } from './relations-operations.ts'

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
        title: m.relations_section_members(),
        // not while the relation is open beside the inspector: the column lists its members
        when: (entity) => entity.type === 'relation' && currentOpenRelationId() !== entity.id,
        disclosure: 'open',
        detail: (entity, editor) => {
          const relation = editor.history.staging.graph.hasEntity(entity.id)
          if (!(relation instanceof OsmRelation)) return undefined
          return membersHeadline(memberRows(editor.history.staging.graph, relation))
        },
        tone: 'relation',
        component: MembersSection,
      }
      const memberships: InspectorSection = {
        id: 'relation-memberships',
        title: m.relations_section_relations(),
        // most features are in no relation: folded, with the number in the headline
        disclosure: 'closed',
        detail: (entity, editor) => membershipsOf(editor.history.staging.graph, entity.id).length,
        tone: 'relation',
        component: RelationsSection,
      }
      api.register('inspector.section', members)
      api.register('inspector.section', memberships)
      api.register('map.content', { id: 'relations-map', component: RelationsOnMap })
      // the edit menu's "Add to relation…" and "Remove from relation" (for the selection, see relations-operations.ts)
      for (const operation of relationOperations(api.editor))
        api.register('edit.operation', operation)
    },
  })
}
