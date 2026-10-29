import type { ReactNode } from 'react'
import { twJoin, twMerge } from 'tailwind-merge'
import { Tooltip } from './Tooltip.tsx'

/** Column of map buttons in the top right corner of the map area. */
export function MapControls(props: { children: ReactNode }) {
  return <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">{props.children}</div>
}

/** Vertical group of map buttons with a shared shadow, ring and hairlines between buttons. */
export function ControlGroup(props: {
  label: string
  children: ReactNode
  /** Extra classes, merged last (a long group that scrolls: `min-h-0 overflow-y-auto`) */
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={props.label}
      className={twMerge(
        'flex flex-col divide-y divide-zinc-950/10 overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-zinc-950/10 dark:divide-white/10 dark:bg-zinc-800 dark:shadow-none dark:ring-white/10',
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}

/** One button of a map control group, shown as an icon. */
export function ControlButton(props: {
  label: string
  icon: ReactNode
  disabled?: boolean
  pressed?: boolean
  onClick?: () => void
}) {
  const { label, icon, disabled, pressed, onClick } = props
  return (
    <Tooltip label={label} placement="left">
      <button
        type="button"
        aria-label={label}
        aria-pressed={pressed}
        disabled={disabled}
        onClick={onClick}
        className={twJoin(
          'flex size-9 cursor-pointer items-center justify-center text-zinc-950 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-default disabled:text-zinc-300 dark:text-white dark:disabled:text-zinc-600 touch:size-10',
          pressed
            ? 'bg-zinc-200 enabled:hover:bg-zinc-300 dark:bg-zinc-600 dark:enabled:hover:bg-zinc-500'
            : 'bg-white enabled:hover:bg-zinc-50 dark:bg-zinc-800 dark:enabled:hover:bg-zinc-700',
        )}
      >
        <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-5">
          {icon}
        </span>
      </button>
    </Tooltip>
  )
}
