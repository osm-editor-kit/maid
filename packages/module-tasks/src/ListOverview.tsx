import { ClipboardDocumentListIcon } from '@heroicons/react/20/solid'
import { TASKS_TEXT } from '@osm-editor-kit/maid-ui'
import { useRef, useState } from 'react'
import { m } from './messages.ts'
import { forgetList, openCachedList, openTaskText, type OpenDeps } from './open.ts'
import { refreshKept, setBrowsing, useOverview } from './overview.ts'
import { useTasks } from './store.ts'

const BUTTON =
  'cursor-pointer rounded-lg border border-zinc-950/10 px-2.5 py-1 text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:border-white/15 dark:hover:bg-white/5'

/**
 * The task lists of this browser, in the dock: load a file (a new list, or a new version of a kept one, which keeps
 * its statuses by task id), open a kept list, delete one (a second click confirms). Shown when no list is open, and
 * with "<" beside an open list's title (Tobias, 2026-11-26: the lists left the account menu).
 */
export function ListOverview({ deps }: { deps: OpenDeps }) {
  const input = useRef<HTMLInputElement>(null)
  const kept = useOverview((state) => state.kept)
  const openKey = useTasks(deps.store, (state) => state.list?.listKey)
  const [asking, setAsking] = useState<string | null>(null)
  const done = () => {
    setBrowsing(false)
    void refreshKept(deps)
  }
  const pick = (file: File | undefined) => {
    if (!file) return
    const request = deps.store.getState().actions.start(file.name)
    void file
      .text()
      .then((text) => openTaskText(deps, text, file.name, { request }))
      .then(done, (error: unknown) => {
        deps.store.getState().actions.fail({
          fileName: file.name,
          errors: [{ path: '$', message: error instanceof Error ? error.message : String(error) }],
        })
      })
  }
  const open = (listKey: string) => {
    // the open list only comes back: opening it again would drop this session's applied tasks
    if (listKey === openKey) return setBrowsing(false)
    void openCachedList(deps, listKey).then(done)
  }
  const forget = (listKey: string) => {
    if (asking !== listKey) return setAsking(listKey)
    setAsking(null)
    if (listKey === openKey) deps.store.getState().actions.close()
    void forgetList(deps, listKey).then(() => refreshKept(deps))
  }
  return (
    <div data-testid="tasks-overview" className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <ClipboardDocumentListIcon aria-hidden="true" className={`size-4 ${TASKS_TEXT}`} />
          {m.tasks_overview_title()}
        </h2>
        <span className="flex items-center gap-2">
          {openKey && (
            <button type="button" onClick={() => setBrowsing(false)} className={BUTTON}>
              {m.tasks_overview_back()}
            </button>
          )}
          <button
            type="button"
            data-testid="tasks-load"
            title={m.tasks_menu_hint()}
            onClick={() => input.current?.click()}
            className={`${BUTTON} border-transparent bg-blue-600 text-white hover:bg-blue-700`}
          >
            {m.tasks_menu()}
          </button>
        </span>
        <input
          ref={input}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          hidden
          aria-label={m.tasks_menu()}
          data-testid="tasks-file"
          onChange={(event) => {
            const file = event.target.files?.[0]
            // the same file again must fire a change too
            event.target.value = ''
            pick(file)
          }}
        />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{m.tasks_overview_hint()}</p>
      {kept.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">{m.tasks_overview_none()}</p>
      ) : (
        <ul className="flex flex-col gap-1" data-testid="tasks-recent">
          {kept.map((file) => (
            <li key={file.listKey} className="flex items-center gap-2">
              <button
                type="button"
                data-testid={`tasks-recent-${file.listKey}`}
                onClick={() => open(file.listKey)}
                className="flex min-w-0 flex-1 cursor-pointer flex-col rounded-lg px-2 py-1 text-left hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
              >
                <span className="truncate font-medium">
                  {file.title}
                  {file.listKey === openKey && (
                    <span className={`ml-1.5 text-xs font-normal ${TASKS_TEXT}`}>
                      {m.tasks_recent_open()}
                    </span>
                  )}
                </span>
                <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                  {file.fileName} · {new Date(file.savedAt).toLocaleDateString()}
                </span>
              </button>
              <button
                type="button"
                data-testid={`tasks-recent-delete-${file.listKey}`}
                title={m.tasks_recent_delete_hint()}
                onClick={() => forget(file.listKey)}
                className={`shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs focus-visible:outline-2 focus-visible:outline-blue-500 ${
                  asking === file.listKey
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
                }`}
              >
                {asking === file.listKey
                  ? m.tasks_recent_delete_confirm()
                  : m.tasks_recent_delete()}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
