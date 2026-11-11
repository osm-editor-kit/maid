import { defineModule, moduleStorage } from '@osm-editor-kit/maid-core'
import { tasksOfEntity } from './list.ts'
import { createLoadTasksItem, DOCK_VIEW } from './LoadTasksItem.tsx'
import { createFileCache, writeMirror } from './local.ts'
import { m } from './messages.ts'
import type { OpenDeps } from './open.ts'
import type { Shared } from './shared.ts'
import { createTasksStore } from './store.ts'
import { createTasksController } from './TasksController.tsx'
import { createTaskSection } from './TaskSection.tsx'
import { createTasksOnMap } from './TasksOnMap.tsx'
import { createTasksView } from './TasksView.tsx'
import { parseAsTasksUrl, TASKS_PARAM } from './url.ts'

/**
 * Private task lists (packages/tasks/FORMAT.md): "Load task list…" in the account menu or `tasks=<address>` in the link,
 * the dock tab "Tasks" with the rows and the progress, the task and its options in the inspector, the geometries on the
 * map. The statuses stay in this browser and, while someone is logged in, in their OSM preferences (packages/osm-prefs).
 *
 * Setup sends no request: a file is fetched after the map is up, by the controller (`map.content`), and the account is
 * asked only while a list is open.
 */
export function tasks() {
  return defineModule({
    id: 'tasks',
    setup(api) {
      const store = createTasksStore()
      const shared: Shared = {}
      const deps: OpenDeps = { store, storage: moduleStorage(), cache: createFileCache() }
      const tasksParam = api.urlParam({
        name: TASKS_PARAM,
        parser: parseAsTasksUrl,
        options: { history: 'replace' },
      })

      api.register('account.item', { id: 'tasks', component: createLoadTasksItem(deps) })
      api.register('dock.view', {
        id: DOCK_VIEW,
        get label() {
          return m.tasks_tab()
        },
        tone: 'tasks',
        component: createTasksView(store, shared),
        // the tab is there from the moment a file is picked: while it loads, with its list, or with its error
        available: {
          get: () => {
            const { loading, error, list } = store.getState()
            return loading !== undefined || error !== undefined || list !== undefined
          },
          subscribe: (listener) => store.subscribe(listener),
        },
      })
      api.register('inspector.section', {
        id: 'tasks',
        get title() {
          return m.tasks_section()
        },
        placement: 'top',
        // each task draws its own folding heading, as "Fields" (TaskSection)
        frame: 'none',
        when: (entity) => {
          const refs = store.getState().list?.refs
          return refs !== undefined && tasksOfEntity(refs, entity.id).length > 0
        },
        component: createTaskSection(store),
      })
      api.register('map.content', { id: 'tasks', component: createTasksOnMap(store) })
      api.register('map.content', {
        id: 'tasks-controller',
        component: createTasksController(store, deps, shared, tasksParam),
      })

      // the statuses of this browser: written after each change, the newest write wins
      let sequence = 0
      const unsubscribe = store.subscribe((state, previous) => {
        const { list } = state
        if (
          !list ||
          (state.list === previous.list &&
            state.statuses === previous.statuses &&
            state.localRevision === previous.localRevision &&
            state.ackedRevision === previous.ackedRevision &&
            state.ackedGeneration === previous.ackedGeneration)
        )
          return
        const mine = ++sequence
        void writeMirror(
          deps.storage,
          list.listKey,
          list.orderHash,
          {
            statuses: state.statuses,
            localRevision: state.localRevision,
            ackedRevision: state.ackedRevision,
            ackedGeneration: state.ackedGeneration,
          },
          () => mine === sequence,
        )
      })
      return () => {
        unsubscribe()
        store.getState().actions.close()
      }
    },
  })
}
