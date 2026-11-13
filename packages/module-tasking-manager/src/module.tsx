import { defineModule } from '@osm-editor-kit/maid-core'
import { getLocale } from '@osm-editor-kit/maid-i18n'
import { openDockView } from '@osm-editor-kit/maid-ui'
import { loadProject, TmError } from './api.ts'
import { m } from './messages.ts'
import { DOCK_VIEW, type Shared } from './shared.ts'
import { createTmStore, openProject } from './store.ts'
import { createTmOnMap } from './TmOnMap.tsx'
import { createTmView } from './TmView.tsx'
import { parseAsTmLink, TM_PARAM, type TmLink } from './url.ts'

/** The API of HOT's Tasking Manager */
export const TASKING_MANAGER_API = 'https://tasking-manager-production-api.hotosm.org/api/v2'
/** The mock's Tasking Manager (tools/mock-osm-api/tasking-manager.ts), for the mock's data and every automated run */
export const MOCK_TASKING_MANAGER_API = 'http://localhost:8090/tasking-manager/api/v2'
/** HOT's Tasking Manager website, for the links to a project */
export const TASKING_MANAGER_SITE = 'https://tasks.hotosm.org'

/** What a failed request means for a person */
function errorText(error: unknown, projectId: number) {
  const id = String(projectId)
  if (error instanceof TmError) {
    if (error.kind === 'not-found') return m.tm_error_not_found({ id })
    if (error.kind === 'private') return m.tm_error_private({ id })
    if (error.kind === 'network') return m.tm_error_network()
    return m.tm_error_other({
      reason: error.status === undefined ? error.kind : String(error.status),
    })
  }
  return m.tm_error_other({ reason: error instanceof Error ? error.message : String(error) })
}

/**
 * HOT's Tasking Manager, read only (docs/research/tasking-manager.md): the link `tm=<project>/<task>` opens a project
 * at one of its tasks. The map shows the project's area and its tasks by status, with the task of the link outlined in
 * red; the dock tab "Tasking Manager" shows the task's status, its instructions and the project's, and links to the TM,
 * where the task is locked and marked as mapped (that needs the TM's own login). The save form starts with the
 * project's changeset comment, with its hashtags.
 *
 * `apiUrl` is the TM's API, or the mock's (MOCK_TASKING_MANAGER_API) on the mock's data. Setup sends no request.
 */
export function taskingManager(options: { apiUrl: string; siteUrl?: string }) {
  return defineModule({
    id: 'tasking-manager',
    setup(api) {
      const store = createTmStore()
      const shared: Shared = { store, siteUrl: options.siteUrl ?? TASKING_MANAGER_SITE }
      const param = api.urlParam({
        name: TM_PARAM,
        parser: parseAsTmLink,
        options: { history: 'replace' },
      })
      let disposed = false
      let request = 0

      const open = (link: TmLink) => {
        const mine = ++request
        store.setState({
          projectId: link.projectId,
          taskId: link.taskId,
          loaded: { state: 'loading' },
        })
        openDockView(DOCK_VIEW)
        loadProject(api.editor.fetch, options.apiUrl, link.projectId, getLocale()).then(
          ({ project, tasks }) => {
            if (disposed || mine !== request) return
            store.setState({ loaded: { state: 'ready', project, tasks } })
          },
          (error: unknown) => {
            if (disposed || mine !== request) return
            store.setState({
              loaded: { state: 'failed', reason: errorText(error, link.projectId) },
            })
          },
        )
      }

      api.register('dock.view', {
        id: DOCK_VIEW,
        get label() {
          return m.tm_tab()
        },
        component: createTmView(shared),
        available: {
          get: () => store.getState().projectId !== null,
          subscribe: (listener) => store.subscribe(listener),
        },
      })
      api.register('map.content', {
        id: 'tasking-manager',
        component: createTmOnMap(shared, param, open),
      })
      // the project's changeset comment (with its #hotosm-project-… hashtag) starts the save form
      api.register('changeset.tags', {
        id: 'tasking-manager',
        comment: () => openProject(store.getState())?.changesetComment.trim() || undefined,
      })
      return () => {
        disposed = true
      }
    },
  })
}
