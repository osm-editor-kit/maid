import type { MaidEngine } from '@osm-editor-kit/maid-renderer'
import { describeMatch, type Lens } from '@osm-editor-kit/maid-style'
import { MapDisplayChoice, notify, PLAIN_INPUT } from '@osm-editor-kit/maid-ui'
import { toolButtonTone } from '@osm-editor-kit/maid-ui'
import { useId, useRef, useState, type ChangeEvent } from 'react'
import { defaultLook } from './default-look.ts'
import { LegendSwatch } from './LegendSwatch.tsx'
import { MAX_FILE_BYTES, parseLensFile, serialiseLenses } from './lens-file.ts'
import {
  activeLens,
  allLenses,
  useActiveLensId,
  useBuiltInLenses,
  useImportedLenses,
  useLensActions,
} from './lens-store.ts'
import { m } from './messages.ts'

/** What the legend says of everything the rules do not match, read when it is shown */
function restText(rest: 'dim' | 'normal' | 'hide') {
  if (rest === 'normal') return m.lenses_rest_normal()
  if (rest === 'hide') return m.lenses_rest_hide()
  return m.lenses_rest_dim()
}

/** A refused file: what is wrong with it. An import that worked is a toast instead. */
type Notice = { lines: string[] }

/** Saves text as a file the browser downloads. The object URL is released after the download starts. */
function download(name: string, lenses: Lens[]) {
  const url = URL.createObjectURL(new Blob([serialiseLenses(lenses)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const BUTTON =
  'h-7 cursor-pointer rounded-md bg-white px-2 text-xs font-medium inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-50 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-400 dark:bg-zinc-800 dark:inset-ring-white/10 dark:hover:bg-zinc-700 dark:disabled:text-zinc-500'

/**
 * The map style flyout: what the map shows of the data (the display: normal, wireframe, changes in colour), the lenses
 * to choose from, the legend of the chosen one, import and export. The display is the engine's, as the keys set it.
 */
export function LensPanel({ engine }: { engine: MaidEngine }) {
  const activeId = useActiveLensId()
  const builtIn = useBuiltInLenses()
  const imported = useImportedLenses()
  const { setActive, importLenses, removeLens } = useLensActions()
  const [notice, setNotice] = useState<Notice | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const noticeId = useId()

  const active = activeLens({ shownId: activeId, builtIn, imported })
  const look = defaultLook()
  // a chosen legend: the active lens's, or without a lens the app's own look's
  const chosenLegend = active ? active.legend : look.legend
  const isOwn = active !== null && imported.some((lens) => lens.id === active.id)
  const reserved = builtIn.map((lens) => lens.id)

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // so that the same file can be chosen again
    input.value = ''
    if (!file) return
    if (file.size > MAX_FILE_BYTES) {
      setNotice({ lines: [m.lenses_file_too_large({ kb: MAX_FILE_BYTES / 1024 })] })
      return
    }
    const result = parseLensFile(await file.text(), reserved)
    if (!result.ok) {
      setNotice({ lines: result.errors })
      return
    }
    importLenses(result.lenses)
    const names = result.lenses.map((lens) => lens.name).join(', ')
    setNotice(null)
    // an event with its result: a toast (Toast.tsx)
    notify.done(m.lenses_imported({ count: result.lenses.length, names }))
  }

  return (
    <div className="flex flex-col gap-4 p-3 text-sm">
      <MapDisplayChoice engine={engine} />
      {/* a heading as the display choice above has one: without it the lenses read as more display modes */}
      <section aria-label={m.lenses_map_style()} className="flex flex-col gap-1.5">
        <h3 className="text-xs font-medium text-zinc-500 uppercase dark:text-zinc-400">
          {m.lenses_map_style()}
        </h3>
        <div role="radiogroup" aria-label={m.lenses_map_style()} className="flex flex-col gap-1">
          <button
            type="button"
            role="radio"
            aria-checked={active === null}
            onClick={() => setActive(null)}
            className={`rounded-md px-2 py-1.5 text-left ${toolButtonTone(active === null ? 'selected' : 'idle')}`}
          >
            <span className="block font-medium">{m.lenses_maid_standard()}</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              {look.description ?? m.lenses_maid_standard_description()}
            </span>
          </button>
          {allLenses({ builtIn, imported }).map((lens) => {
            const checked = active?.id === lens.id
            const own = imported.some((item) => item.id === lens.id)
            return (
              <div key={lens.id} className="flex items-stretch gap-1">
                <button
                  type="button"
                  role="radio"
                  aria-checked={checked}
                  onClick={() => setActive(lens.id)}
                  className={`min-w-0 flex-1 rounded-md px-2 py-1.5 text-left ${toolButtonTone(checked ? 'selected' : 'idle')}`}
                >
                  <span className="block font-medium">{lens.name}</span>
                  {lens.description && (
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                      {lens.description}
                    </span>
                  )}
                </button>
                {own && (
                  <button
                    type="button"
                    aria-label={m.lenses_remove_named({ name: lens.name })}
                    onClick={() => removeLens(lens.id)}
                    className={`${BUTTON} self-center`}
                  >
                    {m.lenses_remove()}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {chosenLegend ? (
        <section aria-label={m.lenses_legend()} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium text-zinc-500 uppercase dark:text-zinc-400">
            {m.lenses_legend()}
          </h3>
          <ul className="flex flex-col gap-1">
            {chosenLegend.entries.map((entry, i) => (
              <li key={i} className="flex items-center gap-2 text-xs">
                <LegendSwatch entry={entry} />
                <span className="min-w-0">{entry.label}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            {chosenLegend.note ?? m.lenses_legend_note_default()}
          </p>
        </section>
      ) : (
        active && (
          <section aria-label={m.lenses_legend()} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-zinc-500 uppercase dark:text-zinc-400">
              {m.lenses_legend()}
            </h3>
            <ul className="flex flex-col gap-1">
              {active.rules.map((rule, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-5 shrink-0 rounded-sm bg-zinc-300 dark:bg-zinc-600"
                    style={rule.color ? { backgroundColor: rule.color } : undefined}
                  />
                  <span className="min-w-0">{rule.label ?? describeMatch(rule.match)}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {restText(active.rest ?? 'dim')}
            </p>
          </section>
        )
      )}

      <section
        aria-label={m.lenses_files()}
        className="flex flex-col gap-2 border-t border-zinc-950/5 pt-3 dark:border-white/5"
      >
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={BUTTON}
            aria-describedby={notice ? noticeId : undefined}
            onClick={() => fileInput.current?.click()}
          >
            {m.lenses_import()}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={!isOwn}
            onClick={() => active && download(`${active.id}.lens.json`, [active])}
          >
            {m.lenses_export_active()}
          </button>
          <button
            type="button"
            className={BUTTON}
            disabled={imported.length === 0}
            onClick={() => download('maid-lenses.json', imported)}
          >
            {m.lenses_export_all()}
          </button>
        </div>
        <input
          {...PLAIN_INPUT}
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          aria-label={m.lenses_file_to_import()}
          className="hidden"
          onChange={onFile}
        />
        {notice && (
          <div id={noticeId} role="status" className="text-xs text-red-600 dark:text-red-400">
            {notice.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
