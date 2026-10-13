import type { KeyboardEvent, ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'
import { Tooltip } from './Tooltip.tsx'

/** The joined look of a group of buttons: one hairline between them, rounded at the ends. */
const JOINED =
  'isolate inline-flex rounded-md shadow-xs dark:shadow-none [&>*]:rounded-none [&>*+*]:-ml-px [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md'

/** A row of icon buttons joined into one control, like the Plus icon-only button group. */
export function ToolGroup(props: { label: string; children: ReactNode }) {
  // The buttons overlap by one pixel so their inset rings make a single hairline.
  return (
    <div role="group" aria-label={props.label} className={JOINED}>
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

export type SegmentedOption<T extends string> = {
  value: T
  /** The text of the button. With `icon`, the name of the button: its label and its tooltip. */
  label: string
  /** An icon-only button shows this instead of the label text */
  icon?: ReactNode
}

const SEGMENT =
  'relative inline-flex items-center inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10'

/**
 * A row of buttons joined into one, of which one is chosen: a radio group. The chosen button is
 * `selected` (no hover, a click changes nothing). The arrow keys move between the buttons and
 * choose; with `arrowKeys` off, the arrow keys do nothing and every button is a tab stop.
 */
export function SegmentedControl<T extends string>(props: {
  /** The name of the group for screen readers */
  label: string
  options: readonly SegmentedOption<T>[]
  value: T
  onSelect: (value: T) => void
  /** The size of the text of the text buttons. Default `sm`. */
  textSize?: 'xs' | 'sm'
  /** Default on. Off: no arrow keys, and no roving tab stop. */
  arrowKeys?: boolean
  /** Default on: the focus ring sits 2px outside the button. Off: it sits on the button's edge. */
  outlineOffset?: boolean
  /** Extra classes for the group, e.g. `w-fit` */
  className?: string
}) {
  const {
    label,
    options,
    value,
    onSelect,
    textSize = 'sm',
    arrowKeys = true,
    outlineOffset = true,
    className,
  } = props

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const step = event.key === 'ArrowRight' ? 1 : -1
    const current = options.findIndex((option) => option.value === value)
    const index = (current + step + options.length) % options.length
    const next = options[index]
    if (next === undefined) return
    onSelect(next.value)
    const target = event.currentTarget.parentElement?.children[index]
    if (target instanceof HTMLElement) target.focus()
  }

  return (
    <div role="radiogroup" aria-label={label} className={twJoin(JOINED, className)}>
      {options.map((option) => {
        const checked = option.value === value
        const hasIcon = option.icon !== undefined
        const button = (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={hasIcon ? option.label : undefined}
            tabIndex={arrowKeys ? (checked ? 0 : -1) : undefined}
            onClick={() => onSelect(option.value)}
            onKeyDown={arrowKeys ? onKeyDown : undefined}
            className={twJoin(
              SEGMENT,
              outlineOffset && 'focus-visible:outline-offset-2',
              hasIcon
                ? 'size-7 shrink-0 justify-center'
                : `h-8 px-3 font-medium ${textSize === 'xs' ? 'text-xs' : 'text-sm'}`,
              toolButtonTone(checked ? 'selected' : 'idle'),
            )}
          >
            {hasIcon ? option.icon : option.label}
          </button>
        )
        // an icon alone needs its name: the editor's own tooltip, not the browser's slow one
        return hasIcon ? (
          <Tooltip key={option.value} label={option.label}>
            {button}
          </Tooltip>
        ) : (
          button
        )
      })}
    </div>
  )
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
