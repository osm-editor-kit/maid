import type { UrlParamHandle } from '@osm-editor-kit/maid-core'
import { useUrlParam } from '@osm-editor-kit/maid-core/react'
import {
  createProgressStore,
  httpTransport,
  type ListEntry,
  type ProgressStore,
} from '@osm-editor-kit/maid-osm-prefs'
import type { MapContentProps } from '@osm-editor-kit/maid-renderer'
import { isApplied } from '@osm-editor-kit/maid-tasks'
import { Dialog, openDockView, usePrefsEndpoint } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState } from 'react'
import { cleanupOffers } from './cleanup.ts'
import { DOCK_VIEW } from './LoadTasksItem.tsx'
import { m } from './messages.ts'
import { openTaskText, type OpenDeps, restoreLastList } from './open.ts'
import type { Shared } from './shared.ts'
import { useTasks, type TasksStore } from './store.ts'
import { createSync, type Sync } from './sync.ts'
import { fileNameOfUrl } from './url.ts'

const BUTTON =
  'cursor-pointer rounded-lg border border-zinc-950/10 px-2.5 py-1 text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:border-white/15 dark:hover:bg-white/5'

type Offer = { entry: ListEntry; title: string; failed?: boolean }

/**
 * The part of the module that lives as long as the map: it opens the list of the last visit, fetches the file of the
 * `tasks` URL parameter (after mount, through `editor.fetch`), keeps the statuses on the OSM account while someone is
 * logged in, and shows the two dialogs (a conflict, and old lists to clean up). It draws nothing else.
 */
export function createTasksController(
  store: TasksStore,
  deps: OpenDeps,
  shared: Shared,
  tasksParam: UrlParamHandle<string>,
) {
  /** Once per session: the cleanup is offered after the first listing of the account */
  let cleanupDone = false

  return function TasksController({ editor, engine }: MapContentProps) {
    const [tasksUrl, setTasksUrl] = useUrlParam(tasksParam)
    const endpoint = usePrefsEndpoint()
    const list = useTasks(store, (state) => state.list)
    const conflict = useTasks(store, (state) => state.conflict)
    const conflictOpen = useTasks(store, (state) => state.conflictOpen)
    const [offers, setOffers] = useState<Offer[]>([])
    const initialUrl = useRef(tasksUrl)
    const syncRef = useRef<Sync | undefined>(undefined)
    const progressRef = useRef<ProgressStore | undefined>(undefined)

    useEffect(() => {
      shared.engine = engine
      return () => {
        shared.engine = undefined
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
          const entity = graph.hasEntity(change.entityId)
          if (change.kind === 'create') return entity !== undefined
          return entity !== undefined && isApplied(entity.tags, change.option)
        })
      }
      return editor.history.on('historyjump', follow)
    }, [editor])

    // the account: reconcile once per list and login, then save after each change
    useEffect(() => {
      if (!list) return
      const { actions } = store.getState()
      if (!endpoint) {
        actions.setSync('local')
        return
      }
      const transport = httpTransport({
        apiUrl: endpoint.apiUrl,
        authHeader: endpoint.authHeader,
        fetch: (url, init) =>
          editor.fetch(url, init ? { ...init, signal: init.signal ?? undefined } : undefined),
      })
      const progress = createProgressStore({ transport })
      const sync = createSync({ store, transport, progress, server: endpoint.server })
      syncRef.current = sync
      progressRef.current = progress
      shared.retry = () => void sync.retry()
      const unsubscribe = store.subscribe((state, previous) => {
        if (state.statuses !== previous.statuses && state.localRevision > state.ackedRevision) {
          sync.schedule()
        }
      })
      let alive = true
      void (async () => {
        try {
          const listed = await progress.listAll()
          if (!alive) return
          if (!cleanupDone) {
            cleanupDone = true
            const stale = cleanupOffers(listed.lists, list.listKey, Date.now() / 1000)
            const rows: Offer[] = []
            for (const entry of stale) {
              const cached = await deps.cache.load(entry.listKey)
              rows.push({
                entry,
                title: cached?.title ?? m.tasks_cleanup_unknown({ key: entry.listKey }),
              })
            }
            if (alive && rows.length > 0) setOffers(rows)
          }
          await sync.start(listed)
        } catch (error) {
          if (!alive) return
          const status = (error as { status?: number }).status
          actions.setSync(
            status === 401 || status === 403 ? 'forbidden' : 'failed',
            endpoint.server,
          )
        }
      })()
      return () => {
        alive = false
        unsubscribe()
        sync.dispose()
        syncRef.current = undefined
        progressRef.current = undefined
        shared.retry = undefined
      }
    }, [list, endpoint, editor])

    const change = async (offer: Offer, what: 'delete' | 'keep') => {
      const progress = progressRef.current
      if (!progress) return
      try {
        if (what === 'delete') await progress.remove(offer.entry.listKey)
        else {
          // saving again gives the list a new date
          const loaded = await progress.load(offer.entry.listKey)
          if (loaded) {
            await progress.save(offer.entry.listKey, loaded.statuses, { orderHash: loaded.meta.h })
          }
        }
        setOffers((rows) => rows.filter((row) => row !== offer))
      } catch {
        setOffers((rows) => rows.map((row) => (row === offer ? { ...row, failed: true } : row)))
      }
    }

    return (
      <>
        {conflictOpen && conflict && (
          <Dialog
            open
            onClose={() => store.getState().actions.setConflictOpen(false)}
            title={m.tasks_conflict_title()}
            footer={
              <>
                <button
                  type="button"
                  data-testid="tasks-conflict-remote"
                  className={BUTTON}
                  onClick={() => void syncRef.current?.resolveConflict('remote')}
                >
                  {m.tasks_conflict_remote()}
                </button>
                <button
                  type="button"
                  data-testid="tasks-conflict-local"
                  className={BUTTON}
                  onClick={() => void syncRef.current?.resolveConflict('local')}
                >
                  {m.tasks_conflict_local()}
                </button>
              </>
            }
          >
            <p data-testid="tasks-conflict-dialog">{m.tasks_conflict_text()}</p>
          </Dialog>
        )}
        {offers.length > 0 && (
          <Dialog
            open
            onClose={() => setOffers([])}
            title={m.tasks_cleanup_title()}
            footer={
              <button
                type="button"
                data-testid="tasks-cleanup-later"
                className={BUTTON}
                onClick={() => setOffers([])}
              >
                {m.tasks_cleanup_later()}
              </button>
            }
          >
            <div data-testid="tasks-cleanup-dialog" className="flex flex-col gap-3">
              <p>{m.tasks_cleanup_text()}</p>
              <ul className="flex flex-col gap-2">
                {offers.map((offer) => (
                  <li
                    key={offer.entry.listKey}
                    data-testid={`tasks-cleanup-row-${offer.entry.listKey}`}
                    className="flex flex-col gap-1.5"
                  >
                    <span>
                      {m.tasks_cleanup_row({
                        title: offer.title,
                        count: offer.entry.meta.c,
                        date: new Date(offer.entry.meta.u * 1000).toLocaleDateString(),
                      })}
                    </span>
                    {offer.failed && (
                      <span role="alert" className="text-red-700 dark:text-red-300">
                        {m.tasks_cleanup_failed()}
                      </span>
                    )}
                    <span className="flex gap-2">
                      <button
                        type="button"
                        data-testid={`tasks-cleanup-delete-${offer.entry.listKey}`}
                        className={BUTTON}
                        onClick={() => void change(offer, 'delete')}
                      >
                        {m.tasks_cleanup_delete()}
                      </button>
                      <button
                        type="button"
                        data-testid={`tasks-cleanup-keep-${offer.entry.listKey}`}
                        className={BUTTON}
                        onClick={() => void change(offer, 'keep')}
                      >
                        {m.tasks_cleanup_keep()}
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </Dialog>
        )}
      </>
    )
  }
}
