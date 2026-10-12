import type { ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'
import { Tooltip } from './Tooltip.tsx'

/** A row of icon buttons joined into one control, like the Plus icon-only button group. */
export function ToolGroup(props: { label: string; children: ReactNode }) {
  // The buttons overlap by one pixel so their inset rings make a single hairline.
  return (
    <div
      role="group"
      aria-label={props.label}
      className="isolate inline-flex rounded-md shadow-xs dark:shadow-none [&>*]:rounded-none [&>*+*]:-ml-px [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md"
    >
      {props.children}
    </div>
  )
}

/**
 * The colours of a button in a toolbar or a button group:
 * - `idle`: can be clicked
 * - `pressed`: on, and a click turns it off again (a mode, an open flyout)
 * - `selected`: the chosen one of a set (theme, filter state). A click would change nothing, so
 *   it has no hover and no pointer cursor.
 */
export function toolButtonTone(state: 'idle' | 'pressed' | 'selected') {
  if (state === 'selected')
    return 'cursor-default bg-zinc-200 text-zinc-950 dark:bg-zinc-600 dark:text-white'
  if (state === 'pressed')
    return 'cursor-pointer bg-zinc-200 text-zinc-950 enabled:hover:bg-zinc-300 dark:bg-zinc-600 dark:text-white dark:enabled:hover:bg-zinc-500'
  return 'cursor-pointer bg-white text-zinc-950 enabled:hover:bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:enabled:hover:bg-zinc-700'
}

/** The look of a `ToolButton`, for a button that cannot be one (the trigger of a flyout) */
export function toolButtonClass(hasText: boolean, state: boolean | 'selected' = false) {
  return twJoin(
    'relative inline-flex shrink-0 items-center justify-center gap-2 rounded-md text-sm font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-300 dark:inset-ring-white/10 dark:disabled:text-zinc-600',
    hasText ? 'h-9 px-3 max-sm:px-2.5 pointer-coarse:h-10' : 'size-9 pointer-coarse:size-10',
    toolButtonTone(state === 'selected' ? 'selected' : state ? 'pressed' : 'idle'),
  )
}

/** An icon button for the top bar and toolbars, with an optional text label and a pressed state. */
export function ToolButton(props: {
  label: string
  shortcut?: string
  /** Shown under the label in the tooltip. */
  description?: string
  icon: ReactNode
  text?: string
  disabled?: boolean
  pressed?: boolean
  /** The chosen one of a set of choices: shown as pressed, without hover, since a click changes nothing */
  selected?: boolean
  onClick?: () => void
}) {
  const { label, shortcut, description, icon, text, disabled, pressed, selected, onClick } = props
  const name = shortcut ? `${label} (${shortcut})` : label
  return (
    <Tooltip label={label} shortcut={shortcut} description={description} placement="bottom">
      <button
        type="button"
        aria-label={name}
        aria-pressed={selected ?? pressed}
        disabled={disabled}
        onClick={onClick}
        className={toolButtonClass(Boolean(text), selected ? 'selected' : pressed)}
      >
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-5">
          {icon}
        </span>
        {text ? <span className="max-sm:sr-only">{text}</span> : null}
      </button>
    </Tooltip>
  )
}
