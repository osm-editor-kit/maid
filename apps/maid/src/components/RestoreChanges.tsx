import type { Geometry } from '@osm-editor-kit/maid-presets'
import { editor } from '../editor'
import type { RestoreSummary } from '../journal'
import type { ChangeElement } from '../save/osm-change'
import { PresetIcon } from './PresetIcon'
import { ChangeRows, rowsOf } from './SaveButton'

/** Up to this many steps the list of steps starts open; a longer history starts collapsed */
const STEPS_OPEN = 8

/** The preset icon of a feature, from the first preset that matches its tags. The generic presets have none. */
function iconOf(element: ChangeElement) {
  const presets = editor.presets
  const geometries: Geometry[] =
    element.type === 'node'
      ? ['vertex', 'point']
      : element.type === 'way'
        ? ['area', 'line']
        : ['relation']
  for (const geometry of geometries) {
    const preset = presets?.match(element.tags, geometry)
    if (preset?.icon && Object.keys(preset.tags).length > 0) return preset.icon
  }
  return undefined
}

/**
 * What the stored edits would restore: the features they leave changed, grouped and listed as the
 * save flyout lists an upload, and under them the steps of the undo history.
 */
export function RestoreChanges({ summary }: { summary: RestoreSummary }) {
  const rows = rowsOf(summary.change)
  return (
    <div className="mt-2 flex flex-col gap-2 text-xs">
      {rows.length > 0 ? (
        <ChangeRows
          rows={rows}
          limit={Infinity}
          className="max-h-56 overflow-y-auto rounded-lg bg-zinc-50 px-3 py-2 dark:bg-white/5"
          icon={(element) => (
            <PresetIcon
              icon={iconOf(element)}
              className="size-4 shrink-0 fill-zinc-600 dark:fill-zinc-300"
            />
          )}
        />
      ) : (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-zinc-500 dark:bg-white/5 dark:text-zinc-400">
          No feature is left changed at the point the history was saved at.
        </p>
      )}
      <details open={summary.steps.length <= STEPS_OPEN}>
        <summary className="cursor-pointer font-medium text-zinc-700 dark:text-zinc-200">
          Steps ({summary.steps.length})
        </summary>
        <ol className="mt-1 max-h-40 list-decimal overflow-y-auto rounded-lg bg-zinc-50 py-2 pr-3 pl-7 dark:bg-white/5">
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
      </details>
    </div>
  )
}
