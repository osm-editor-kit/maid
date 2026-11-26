import { defineModule, moduleStorage } from '@osm-editor-kit/maid-core'
import { notify } from '@osm-editor-kit/maid-ui'
import { DOCK_VIEW } from './dock-view.ts'
import { tasksOfEntity } from './list.ts'
import { createFileCache, writeMirror } from './local.ts'
import { m } from './messages.ts'
import type { OpenDeps } from './open.ts'
import { overviewStore, refreshKept } from './overview.ts'
import type { Shared } from './shared.ts'
import { createTasksStore } from './store.ts'
import { createTasksController } from './TasksController.tsx'
import { createTaskSection } from './TaskSection.tsx'
import { createTasksOnMap } from './TasksOnMap.tsx'
import { createTasksView } from './TasksView.tsx'
import { parseAsTasksUrl, TASKS_PARAM } from './url.ts'

/**
 * Private task lists (packages/tasks/FORMAT.md): loaded in the dock tab "Task lists (n)", always there, or with
 * `tasks=<address>` in the link,
 * the dock tab "Tasks" with the list and, beside it, the current task and its options; a hint in the inspector; the geometries on the
 * map. The statuses stay in this browser only (local.ts).
 *
 * Setup sends no request: a file is fetched after the map is up, by the controller (`map.content`).
 */
export function tasks() {
  return defineModule({
    id: 'tasks',
    setup(api) {
      const store = createTasksStore()
      const shared: Shared = {}
      const deps: OpenDeps = {
        store,
        storage: moduleStorage(),
        cache: createFileCache(),
        // a regenerated list kept the statuses of its earlier version: say how many, it is not obvious
        onCarried: ({ count }) => notify.info(m.tasks_carried({ count })),
      }
      const tasksParam = api.urlParam({
        name: TASKS_PARAM,
        parser: parseAsTasksUrl,
        options: { history: 'replace' },
      })

      // the lists of this browser, for the tab's count and the overview; read again when another list opens
      void refreshKept(deps)
      const offKept = store.subscribe((state, previous) => {
        if (state.list?.listKey !== previous.list?.listKey) void refreshKept(deps)
      })
      api.register('dock.view', {
        id: DOCK_VIEW,
        // the count of the kept lists: "Aufgabenlisten (3)"
        get label() {
          return m.tasks_tab_count({ count: overviewStore.getState().kept.length })
        },
        tone: 'tasks',
        component: createTasksView(store, shared, deps),
        // always there: it holds the overview of the lists and the loading of a file (Tobias, 2026-11-26)
        available: {
          get: () => true,
          subscribe: (listener) => {
            const offs = [store.subscribe(listener), overviewStore.subscribe(listener)]
            return () => offs.forEach((off) => off())
          },
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
        if (!list || (state.list === previous.list && state.statuses === previous.statuses)) return
        const mine = ++sequence
        void writeMirror(
          deps.storage,
          list.listKey,
          list.orderHash,
          { statuses: state.statuses },
          () => mine === sequence,
        )
      })
      return () => {
        offKept()
        unsubscribe()
        store.getState().actions.close()
      }
    },
  })
}
