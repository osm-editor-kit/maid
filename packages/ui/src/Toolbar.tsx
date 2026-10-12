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
  onClick?: () => void
}) {
  const { label, shortcut, description, icon, text, disabled, pressed, onClick } = props
  const name = shortcut ? `${label} (${shortcut})` : label
  return (
    <Tooltip label={label} shortcut={shortcut} description={description} placement="bottom">
      <button
        type="button"
        aria-label={name}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={twJoin(
          'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-300 dark:inset-ring-white/10 dark:disabled:text-zinc-600',
          text ? 'h-9 px-3' : 'size-9',
          pressed
            ? 'bg-zinc-200 text-zinc-950 enabled:hover:bg-zinc-300 dark:bg-zinc-600 dark:text-white dark:enabled:hover:bg-zinc-500'
            : 'bg-white text-zinc-950 enabled:hover:bg-zinc-50 dark:bg-zinc-800 dark:text-white dark:enabled:hover:bg-zinc-700',
        )}
      >
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-5">
          {icon}
        </span>
        {text ? <span>{text}</span> : null}
      </button>
    </Tooltip>
  )
}
