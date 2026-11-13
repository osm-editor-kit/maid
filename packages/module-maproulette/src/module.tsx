import { defineModule, moduleStorage } from '@osm-editor-kit/maid-core'
import { createController, editorFetch } from './controller.ts'
import { createDockView } from './DockView.tsx'
import { CLICK_LAYERS, createMapRouletteOnMap } from './MapRouletteOnMap.tsx'
import { m } from './messages.ts'
import { createBadge, createPanel } from './Panel.tsx'
import { RouletteIcon } from './RouletteIcon.tsx'
import { changesetContribution, createSaveBlock } from './SaveBlock.tsx'
import { DOCK_VIEW, type Shared } from './shared.ts'
import { createMapRouletteStore } from './store.ts'
import { createTaskSection } from './TaskSection.tsx'
import { MAPROULETTE_PARAM, parseAsMapRouletteLink } from './url.ts'

/** MapRoulette's API */
export const MAPROULETTE_API = 'https://maproulette.org/api/v2'
/** The mock's MapRoulette (tools/mock-osm-api/maproulette.ts), for the mock's data and every automated run */
export const MOCK_MAPROULETTE_API = 'http://localhost:8090/maproulette/api/v2'
/** MapRoulette's website, for links to a challenge and a task */
export const MAPROULETTE_SITE = 'https://maproulette.org'

/**
 * MapRoulette challenges in Maid, after Tobias's MapRoulette fork of iD (tordans/iD#4):
 *
 * - the top bar button "MapRoulette": the open challenge with its description and the next task, or a challenge to
 *   open (its number or a MapRoulette link) and the challenges with tasks in the view; the login below;
 * - the tasks of the view on the map from zoom 12: their ways as teal lines under the OSM data, a pin per task;
 * - a task above the feature it names in the inspector, and in the dock tab "MapRoulette" with the tasks of the view:
 *   the instructions (Markdown with the task's values, MapRoulette's form fields), the tag fix as a diff, the status;
 * - a status is sent with the next upload (the default; a tag fix always) or right away; the save form lists the tasks
 *   it reports, the changeset gets the challenges' comment and `closed:maproulette*`, and after the upload each task is
 *   set with a comment that links the changeset (`changeset.uploaded`).
 *
 * `apiUrl` is MapRoulette's API, or the mock's (MOCK_MAPROULETTE_API) on the mock's data. Setup sends no request.
 */
export function maproulette(options: { apiUrl: string; siteUrl?: string }) {
  return defineModule({
    id: 'maproulette',
    setup(api) {
      const store = createMapRouletteStore()
      const controller = createController({
        store,
        apiUrl: options.apiUrl,
        storage: moduleStorage(),
        fetch: editorFetch(api.editor),
      })
      const shared: Shared = {
        editor: api.editor,
        store,
        controller,
        siteUrl: options.siteUrl ?? MAPROULETTE_SITE,
      }
      const param = api.urlParam({
        name: MAPROULETTE_PARAM,
        parser: parseAsMapRouletteLink,
        options: { history: 'replace' },
      })

      api.register('topbar.panel', {
        id: 'maproulette',
        get label() {
          return m.mr_button()
        },
        icon: <RouletteIcon />,
        component: createPanel(shared),
        badge: createBadge(shared),
      })
      api.register('dock.view', {
        id: DOCK_VIEW,
        get label() {
          return m.mr_tab()
        },
        tone: 'maproulette',
        component: createDockView(shared),
        // the tab is there while a challenge or a task is open, or a task waits for the upload
        available: {
          get: () => {
            const state = store.getState()
            return (
              state.challengeId !== null ||
              state.currentTaskId !== null ||
              state.earmarks.length > 0
            )
          },
          subscribe: (listener) => store.subscribe(listener),
        },
      })
      api.register('inspector.section', {
        id: 'maproulette',
        get title() {
          return m.mr_section()
        },
        placement: 'top',
        frame: 'none',
        when: (entity) => (store.getState().byEntity[entity.id]?.length ?? 0) > 0,
        component: createTaskSection(shared),
      })
      api.register('map.content', {
        id: 'maproulette',
        component: createMapRouletteOnMap(shared, param),
        clickLayers: CLICK_LAYERS,
      })
      api.register('changeset.tags', {
        id: 'maproulette',
        ...changesetContribution(shared),
        component: createSaveBlock(shared),
      })
      // after the upload: each task of it gets its status on MapRoulette, with a link to the changeset
      api.on('changeset.uploaded', (changesets, upload) => {
        const [first] = changesets
        if (first === undefined) return
        void controller.afterUpload({
          changesetId: first,
          changesetUrl: upload.changesetUrl(first),
          comment: upload.comment,
          ...(upload.user ? { user: upload.user } : {}),
        })
      })
      return () => controller.dispose()
    },
  })
}
