import type { Editor } from '@osm-editor-kit/maid-core'
import type { Geometry } from '@osm-editor-kit/maid-presets'
import type { RestoreSummary } from '../journal'
import type { ChangeElement } from '../save/osm-change'
import { useShell } from '../shell-context'
import { PresetIcon } from './PresetIcon'
import { ChangeRows, rowsOf } from './SaveButton'

/** The preset icon of a feature, from the first preset that matches its tags. The generic presets have none. */
function iconOf(presets: Editor['presets'], element: ChangeElement) {
  const geometries: Geometry[] =
    element.type === 'node'
      ? ['vertex', 'point']
      : element.type === 'way'
        ? ['area', 'line']
        : ['relation']
  for (const geometry of geometries) {
    // a node has its place; a way lists its node ids only, so its location is not known here
    const loc = element.type === 'node' ? ([element.lon, element.lat] as const) : undefined
    const preset = presets?.match(element.tags, geometry, loc)
    if (preset?.icon && Object.keys(preset.tags).length > 0) return preset.icon
  }
  return undefined
}

/**
 * What the stored edits would restore, always listed: the steps of the undo history (undone ones
 * dimmed), then the features they leave changed, grouped and listed as the save flyout lists an upload.
 */
export function RestoreChanges({ summary }: { summary: RestoreSummary }) {
  const { editor } = useShell()
  const rows = rowsOf(summary.change)
  return (
    <div className="mt-3 flex flex-col gap-3 text-xs">
      <section>
        <h3 className="font-medium text-zinc-500 dark:text-zinc-400">Edits</h3>
        <ol className="mt-1 max-h-40 list-decimal overflow-y-auto rounded-lg bg-zinc-50 py-2 pr-3 pl-7 text-zinc-700 dark:bg-white/5 dark:text-zinc-200">
          {summary.steps.map((step) => (
            <li
              key={step.index}
              className={step.undone ? 'text-zinc-400 dark:text-zinc-500' : undefined}
            >
              {step.annotation}
              {step.undone && ' (undone)'}
            </li>
          ))}
        </ol>
      </section>
      <section>
        <h3 className="font-medium text-zinc-500 dark:text-zinc-400">Features</h3>
        {rows.length > 0 ? (
          <div className="mt-1">
            <ChangeRows
              rows={rows}
              limit={Infinity}
              className="max-h-56 overflow-y-auto rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/5"
              icon={(element) => (
                <PresetIcon
                  icon={iconOf(editor.presets, element)}
                  className="size-4 shrink-0 fill-zinc-600 dark:fill-zinc-300"
                />
              )}
            />
          </div>
        ) : (
          <p className="mt-1 rounded-lg bg-zinc-50 px-3 py-2 text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
            No feature is left changed at the point the history was saved at.
          </p>
        )}
      </section>
    </div>
  )
}
