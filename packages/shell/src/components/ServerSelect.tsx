import { m } from '@osm-editor-kit/maid-i18n'
import { useSettingsActions, type Server } from '@osm-editor-kit/maid-ui'
import type { DataSource } from '../config'
import { useEngine, useShell } from '../shell-context'

/**
 * The data server as a native select in the account flyout, under the language. The choice is stored and
 * the page reloads on it, because the config is read once at start. The reloaded address names the same
 * server in `api`: a parameter in the address would win over the stored choice, so the two must agree.
 * With unsaved edits the select is disabled, with a hint: the edits belong to the server they were made on.
 * Locally the mock (the fixtures) is an option too (`config.serverOptions`); it is not stored, as a local build
 * starts on the mock unless the address names a server.
 */
export function ServerSelect() {
  const { config, editor } = useShell()
  const { setServer } = useSettingsActions()
  const hasEdits = useEngine(() => editor.history.hasChanges())
  const current: DataSource = config.source
  const label: Record<DataSource, string> = {
    mock: m.topbar_server_mock(),
    osm: m.topbar_server_osm(),
    dev: m.topbar_server_dev(),
  }
  return (
    <div className="border-t border-zinc-950/5 px-4 py-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{m.topbar_server()}</span>
        <select
          aria-label={m.topbar_server()}
          value={current}
          disabled={hasEdits}
          onChange={(event) => {
            const next = config.serverOptions.find((option) => option === event.target.value)
            if (!next) return
            if (next !== 'mock') setServer(next satisfies Server)
            const url = new URL(location.href)
            url.searchParams.set('api', next)
            location.assign(url.href)
          }}
          className="max-w-48 cursor-pointer rounded-md bg-white py-1 pr-7 pl-2 text-sm text-zinc-950 ring-1 ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:opacity-50 dark:bg-zinc-800 dark:text-white dark:ring-white/15"
        >
          {config.serverOptions.map((option) => (
            <option key={option} value={option}>
              {label[option]}
            </option>
          ))}
        </select>
      </div>
      {hasEdits && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {m.topbar_server_edits_hint()}
        </p>
      )}
    </div>
  )
}
