import type { CarryDirection, CarryMode } from './carry.ts'
import { m } from './messages.ts'
import type { PlanResult } from './plan.ts'
import type { CarrySettings } from './way-table-store.ts'

export type WayTableBarProps = {
  readonly kind: 'carry' | 'set-all'
  readonly rowKey: string
  /** The plan of the batch now; undefined when the reference has no value for the key */
  readonly plan: PlanResult | undefined
  readonly limit: number
  readonly settings: CarrySettings
  readonly onSettings: (patch: Partial<CarrySettings>) => void
  readonly onApply: (plan: PlanResult, annotation: string) => void
  readonly onCancel: () => void
}

const BUTTON =
  'rounded-md border px-2 py-1 text-xs font-medium focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-40'
const PLAIN = `${BUTTON} border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100`
const PRESSED = `${BUTTON} border-blue-600 bg-blue-600 text-white dark:border-blue-500 dark:bg-blue-600`

const DIRECTIONS: readonly CarryDirection[] = ['backward', 'both', 'forward']
const MODES: readonly CarryMode[] = ['fill-empty', 'overwrite']

function directionLabel(direction: CarryDirection): string {
  if (direction === 'backward') return m.way_table_carry_backward()
  if (direction === 'forward') return m.way_table_carry_forward()
  return m.way_table_carry_both()
}

function modeLabel(mode: CarryMode): string {
  return mode === 'fill-empty' ? m.way_table_carry_mode_fill() : m.way_table_carry_mode_overwrite()
}

/**
 * The confirmation of a batch: set on all, or a carry with its direction, count and mode. It shows the plan as it is
 * now (the preview is the outlines on the cells), and one Apply writes it as one undo step. Escape cancels.
 */
export function WayTableBar(props: WayTableBarProps) {
  const { kind, rowKey, plan, limit, settings, onSettings, onApply, onCancel } = props
  const changes = plan?.ok ? plan.changes.length : 0
  const skipped = plan?.ok ? plan.skipped : []
  const directionSkips = skipped.filter((item) => item.reason === 'direction-dependent').length
  const otherSkips = skipped.length - directionSkips
  const applicable = plan?.ok === true && changes > 0
  const annotation =
    kind === 'carry'
      ? m.way_table_carry_annotation({ key: rowKey, count: changes })
      : m.way_table_set_all_annotation({ key: rowKey, count: changes })

  let summary: string
  if (plan === undefined) summary = m.way_table_no_value()
  else if (!plan.ok) summary = m.way_table_refused({ count: plan.ids.length })
  else if (changes === 0) summary = m.way_table_nothing_to_change()
  else summary = m.way_table_would_change({ count: changes })

  return (
    <div
      role="group"
      aria-label={kind === 'carry' ? m.way_table_carry() : m.way_table_set_all({ count: changes })}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onCancel()
        }
      }}
      className="flex flex-wrap items-center gap-2 rounded-md border border-amber-400 bg-amber-50 px-2 py-1.5 text-xs text-zinc-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-zinc-100"
    >
      <span className="font-mono">{rowKey}</span>
      {kind === 'carry' ? (
        <>
          <div className="flex gap-1" role="group" aria-label={m.way_table_carry()}>
            {DIRECTIONS.map((direction) => (
              <button
                key={direction}
                type="button"
                aria-pressed={settings.direction === direction}
                className={settings.direction === direction ? PRESSED : PLAIN}
                onClick={() => onSettings({ direction })}
              >
                {directionLabel(direction)}
              </button>
            ))}
          </div>
          <select
            aria-label={m.way_table_carry_count({ count: settings.count })}
            value={settings.count}
            onChange={(event) => onSettings({ count: Number(event.target.value) })}
            className="rounded-md border border-zinc-300 bg-white px-1 py-0.5 text-xs dark:border-zinc-600 dark:bg-zinc-800"
          >
            {Array.from({ length: limit }, (_, index) => index + 1).map((count) => (
              <option key={count} value={count}>
                {m.way_table_carry_count({ count })}
              </option>
            ))}
          </select>
          <div className="flex gap-1" role="group">
            {MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={settings.mode === mode}
                className={settings.mode === mode ? PRESSED : PLAIN}
                onClick={() => onSettings({ mode })}
              >
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <span className="text-zinc-700 dark:text-zinc-300">{summary}</span>
      {directionSkips > 0 ? (
        <span>{m.way_table_skipped_direction({ count: directionSkips })}</span>
      ) : null}
      {otherSkips > 0 ? <span>{m.way_table_skipped_other({ count: otherSkips })}</span> : null}
      <span className="ml-auto flex gap-1">
        <button
          type="button"
          disabled={!applicable}
          className={`${PRESSED} disabled:bg-blue-600`}
          onClick={() => {
            if (plan) onApply(plan, annotation)
          }}
        >
          {m.way_table_apply()}
        </button>
        <button type="button" className={PLAIN} onClick={onCancel}>
          {m.way_table_cancel()}
        </button>
      </span>
    </div>
  )
}
