import { ClipboardDocumentListIcon } from '@heroicons/react/20/solid'
import { openDockView, TASKS_MENU_ITEM, TASKS_TEXT } from '@osm-editor-kit/maid-ui'
import type { AccountMenuItem } from '@osm-editor-kit/maid-ui'
import { useEffect, useRef, useState } from 'react'
import type { CachedFile } from './local.ts'
import { m } from './messages.ts'
import { forgetList, openCachedList, openTaskText, type OpenDeps } from './open.ts'
import { useTasks } from './store.ts'

export const DOCK_VIEW = 'tasks'

/**
 * "Load task list…" in the account menu: a file picker, then the list in the dock. Under it the lists this browser kept,
 * newest first, to open again without the file (Tobias, 2026-11-26).
 */
export function createLoadTasksItem(deps: OpenDeps): AccountMenuItem['component'] {
  return function LoadTasksItem({ close }) {
    const input = useRef<HTMLInputElement>(null)
    const openKey = useTasks(deps.store, (state) => state.list?.listKey)
    const [kept, setKept] = useState<Omit<CachedFile, 'text'>[]>([])
    // read when the menu opens: IndexedDB, no request
    useEffect(() => {
      let alive = true
      void deps.cache.list().then((files) => {
        if (alive) setKept(files)
      })
      return () => {
        alive = false
      }
    }, [])
    // a second click deletes: the first only asks (the progress of this browser goes with it)
    const [asking, setAsking] = useState<string | null>(null)
    const forget = (listKey: string) => {
      if (asking !== listKey) {
        setAsking(listKey)
        return
      }
      setAsking(null)
      void forgetList(deps, listKey).then(() =>
        setKept((files) => files.filter((file) => file.listKey !== listKey)),
      )
    }
    const reopen = (listKey: string) => {
      close()
      openDockView(DOCK_VIEW)
      void openCachedList(deps, listKey)
    }
    const pick = (file: File | undefined) => {
      if (!file) return
      close()
      const request = deps.store.getState().actions.start(file.name)
      openDockView(DOCK_VIEW)
      void file
        .text()
        .then((text) => openTaskText(deps, text, file.name, { request }))
        .catch((error: unknown) => {
          deps.store.getState().actions.fail({
            fileName: file.name,
            errors: [
              { path: '$', message: error instanceof Error ? error.message : String(error) },
            ],
          })
        })
    }
    return (
      <>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className={`flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm focus-visible:outline-2 focus-visible:outline-blue-500 ${TASKS_MENU_ITEM}`}
        >
          <ClipboardDocumentListIcon
            aria-hidden="true"
            className={`mt-0.5 size-4 shrink-0 ${TASKS_TEXT}`}
          />
          <span>
            <span className={`block font-medium ${TASKS_TEXT}`}>{m.tasks_menu()}</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {m.tasks_menu_hint()}
            </span>
          </span>
        </button>
        {kept.length > 0 && (
          <div className="mt-1 flex flex-col gap-0.5 pl-6" data-testid="tasks-recent">
            <span className="px-2 text-xs text-zinc-500 dark:text-zinc-400">
              {m.tasks_recent()}
            </span>
            {kept.map((file) => (
              <div key={file.listKey} className="flex items-center gap-1">
                <button
                  type="button"
                  data-testid={`tasks-recent-${file.listKey}`}
                  onClick={() => reopen(file.listKey)}
                  className="flex min-w-0 flex-1 cursor-pointer flex-col rounded-lg px-2 py-1 text-left text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
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
                {file.listKey !== openKey && (
                  <button
                    type="button"
                    data-testid={`tasks-recent-delete-${file.listKey}`}
                    onClick={() => forget(file.listKey)}
                    title={m.tasks_recent_delete_hint()}
                    className={`shrink-0 cursor-pointer rounded-md px-1.5 py-1 text-xs focus-visible:outline-2 focus-visible:outline-blue-500 ${
                      asking === file.listKey
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white'
                    }`}
                  >
                    {asking === file.listKey
                      ? m.tasks_recent_delete_confirm()
                      : m.tasks_recent_delete()}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
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
      </>
    )
  }
}
