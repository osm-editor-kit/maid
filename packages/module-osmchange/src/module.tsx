import { defineModule } from '@osm-editor-kit/maid-core'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { createLoadChangesItem, DOCK_VIEW } from './LoadChangesItem.tsx'
import { m } from './messages.ts'
import { createOsmChangeStore } from './osmchange-store.ts'
import { createOsmChangeOnMap } from './OsmChangeOnMap.tsx'
import { createReviewView } from './ReviewView.tsx'

/** The changeset tag that names the app the loaded osmChange file came from (its `generator`), next to `created_by` */
export const CREATED_BY_KEY = 'osmchange:created_by'

export type OsmChangeOptions = {
  /** The API root the editor reads its data from (`config.apiUrl`: the mock API in development and tests) */
  readonly apiUrl: string
}

/**
 * Loading an osmChange file (docs/research/osmchange-upload/README.md): "Load changes from a file…" in the account
 * menu (`account.item`), the review in the dock (`dock.view`), the changes on the map in OSMCha's colours
 * (`map.content`). What needs no decision is written on loading (one undo step), each decision when it is made; the person uploads with the normal save.
 */
export function osmChange(options: OsmChangeOptions) {
  return defineModule({
    id: 'osmchange',
    setup(api) {
      const store = createOsmChangeStore()
      // the account item gets the engine; the dock view needs it to move the map to a row's element
      const shared: { engine?: MaidEngine } = {}
      api.register('account.item', {
        id: 'osmchange',
        component: createLoadChangesItem(store, options.apiUrl, shared),
      })
      api.register('dock.view', {
        id: DOCK_VIEW,
        get label() {
          return m.osmchange_tab()
        },
        component: createReviewView(store, shared),
        // the tab is there from the moment a file is picked: while it loads, with its review, or with its error
        available: {
          get: () => {
            const { loading, error, session } = store.getState()
            return loading !== undefined || error !== undefined || session !== undefined
          },
          subscribe: (listener) => store.subscribe(listener),
        },
      })
      api.register('map.content', { id: 'osmchange', component: createOsmChangeOnMap(store) })
      // after an upload the review is done: its changes are on the server now (Tobias, 2026-10-23)
      api.on('changeset.uploaded', () => store.getState().actions.close())
      // the changeset says where the changes came from, while the editor still holds some of them (Tobias, 2026-10-23)
      const imported = () => {
        const { imported } = store.getState()
        if (!imported) return undefined
        const { created, modified, deleted } = api.editor.history.changes()
        const touched = [...created, ...modified, ...deleted].some((entity) =>
          imported.ids.has(entity.id),
        )
        return touched ? imported : undefined
      }
      api.register('changeset.tags', {
        id: 'osmchange',
        tags: (): Record<string, string> => {
          const generator = imported()?.generator
          return generator ? { [CREATED_BY_KEY]: generator } : {}
        },
        comment: () => {
          const file = imported()
          return file
            ? m.osmchange_changeset_comment({ from: file.generator ?? file.fileName })
            : undefined
        },
      })
      return () => store.getState().actions.close()
    },
  })
}
