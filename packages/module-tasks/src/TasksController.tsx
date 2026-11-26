import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { isApplied } from '@osm-editor-kit/maid-tasks'
import { openDockView } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef } from 'react'
import { DOCK_VIEW } from './dock-view.ts'
import { m } from './messages.ts'
import { openTaskText, type OpenDeps, restoreLastList } from './open.ts'
import { type Shared, setSharedEngine } from './shared.ts'
import { useTasks, type TasksStore } from './store.ts'
import { fileNameOfUrl } from './url.ts'

/**
 * The part of the module that lives as long as the map: it opens the list of the last visit, fetches the file of the
 * `tasks` URL parameter (after mount, through `editor.fetch`) and lets a task Apply set to done follow undo and redo.
 * It draws nothing.
 */
export function createTasksController(
  store: TasksStore,
  deps: OpenDeps,
  shared: Shared,
  tasksParam: UrlParamHandle<string>,
) {
  return function TasksController({ editor, engine }: MapContentProps) {
    const [tasksUrl, setTasksUrl] = useUrlParam(tasksParam)
    const list = useTasks(store, (state) => state.list)
    const initialUrl = useRef(tasksUrl)

    useEffect(() => {
      setSharedEngine(shared, engine)
      return () => {
        setSharedEngine(shared, undefined)
      }
    }, [engine])

    // the list of the last visit, unless a link names a file
    useEffect(() => {
      if (initialUrl.current !== null || store.getState().list) return
      void restoreLastList(deps)
    }, [])

    // the file of the `tasks` parameter
    useEffect(() => {
      if (tasksUrl === null || store.getState().list?.sourceUrl === tasksUrl) return
      const controller = new AbortController()
      const name = fileNameOfUrl(tasksUrl)
      const { actions } = store.getState()
      const request = actions.start(name)
      openDockView(DOCK_VIEW)
      void (async () => {
        try {
          const response = await editor.fetch(tasksUrl, { signal: controller.signal })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const text = await response.text()
          if (controller.signal.aborted) return
          await openTaskText(deps, text, name, { sourceUrl: tasksUrl, request })
        } catch (error) {
          if (controller.signal.aborted || store.getState().request !== request) return
          const reason = error instanceof Error ? error.message : String(error)
          actions.fail({
            fileName: name,
            errors: [{ path: '$', message: m.tasks_fetch_failed({ reason }) }],
          })
        }
      })()
      return () => controller.abort()
    }, [tasksUrl, editor])

    // a list from a file or the cache replaces the one of the link: the link no longer names what is open
    useEffect(() => {
      if (list && tasksUrl !== null && list.sourceUrl !== tasksUrl) void setTasksUrl(null)
    }, [list, tasksUrl, setTasksUrl])

    // undo and redo: a task Apply set to done follows its edit
    useEffect(() => {
      const follow = () => {
        const graph = editor.history.staging.graph
        store.getState().actions.followApplied(({ change }) => {
          if (change.kind === 'delete') return change.entityIds.every((id) => !graph.hasEntity(id))
          if (change.kind === 'create') return graph.hasEntity(change.entityId) !== undefined
          if (change.kind === 'none') return true
          if (change.kind === 'edit') {
            const at = editor.history.history.indexOf(change.edit as never)
            return at >= 0 && at <= editor.history.index
          }
          return change.entityIds.every((id) => {
            const entity = graph.hasEntity(id)
            return entity !== undefined && isApplied(entity.tags, change.option)
          })
        })
      }
      return editor.history.on('historyjump', follow)
    }, [editor])

    return null
  }
}
