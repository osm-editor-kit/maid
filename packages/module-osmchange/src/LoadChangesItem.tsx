import { DocumentArrowUpIcon } from '@heroicons/react/20/solid'
import type { Editor } from '@osm-editor-kit/maid-core'
import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { openDockView } from '@osm-editor-kit/maid-ui'
import { useRef } from 'react'
import { editorDeps, focusMap, importFile } from './editor-io.ts'
import { m } from './messages.ts'
import type { OsmChangeStore } from './osmchange-store.ts'

export const DOCK_VIEW = 'osmchange'

/** "Load changes from a file…" in the account menu: a file picker, then the review in the dock */
export function createLoadChangesItem(
  store: OsmChangeStore,
  apiUrl: string,
  shared: { engine?: MaidEngine },
) {
  return function LoadChangesItem({
    editor,
    engine,
    close,
  }: {
    editor: Editor
    engine: MaidEngine
    close: () => void
  }) {
    const input = useRef<HTMLInputElement>(null)
    const pick = (file: File | undefined) => {
      if (!file) return
      shared.engine = engine
      close()
      openDockView(DOCK_VIEW)
      void importFile(store, file, editorDeps(editor, engine, apiUrl), editor).then((session) => {
        if (session) focusMap(editor, engine, session)
      })
    }
    return (
      <>
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="flex w-full cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:hover:bg-white/5"
        >
          <DocumentArrowUpIcon
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-zinc-500"
          />
          <span>
            <span className="block font-medium">{m.osmchange_menu()}</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {m.osmchange_menu_hint()}
            </span>
          </span>
        </button>
        <input
          ref={input}
          type="file"
          accept=".osc,.xml,application/xml,text/xml"
          hidden
          aria-label={m.osmchange_menu()}
          data-osmchange-file=""
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
