import { ClipboardDocumentListIcon } from '@heroicons/react/20/solid'
import { openDockView } from '@osm-editor-kit/maid-ui'
import type { AccountMenuItem } from '@osm-editor-kit/maid-ui'
import { useRef } from 'react'
import { m } from './messages.ts'
import { openTaskText, type OpenDeps } from './open.ts'

export const DOCK_VIEW = 'tasks'

/** "Load task list…" in the account menu: a file picker, then the list in the dock */
export function createLoadTasksItem(deps: OpenDeps): AccountMenuItem['component'] {
  return function LoadTasksItem({ close }) {
    const input = useRef<HTMLInputElement>(null)
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
          className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
        >
          <ClipboardDocumentListIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-zinc-500"
          />
          <span>
            <span className="block font-medium">{m.tasks_menu()}</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {m.tasks_menu_hint()}
            </span>
          </span>
        </button>
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
