import type { ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'
import { Tooltip } from './Tooltip.tsx'

export type CommandItem = {
  id: string
  label: string
  shortcut?: string
  /**
   * Why the command cannot run now. When set, the button is greyed out and does nothing, and this
   * text is the description in its tooltip.
   */
  reason?: string
  /** What the command does, when its label does not say it: the tooltip's text unless `reason` is set */
  description?: string
  icon: ReactNode
  run: () => void
  /** Called with true while the pointer or the focus is on the command, to show what it would do */
  preview?: (on: boolean) => void
}

/**
 * Icon-only commands in one group joined by hairlines. The hairline is each button's own ring,
 * overlapped by one pixel, so a row that is not full has no filler at its end. The group is rounded at its start and end. The buttons wrap onto further
 * rows when the panel is narrow. Each button shows its label and shortcut in a tooltip.
 */
export function CommandBar(props: { label: string; items: CommandItem[] }) {
  return (
    <div
      role="group"
      aria-label={props.label}
      className="flex flex-wrap pt-px pl-px [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md"
    >
      {props.items.map((item) => {
        const blocked = Boolean(item.reason)
        return (
          <Tooltip
            key={item.id}
            label={item.label}
            shortcut={item.shortcut}
            description={item.reason ?? item.description}
            placement="top"
          >
            <button
              type="button"
              aria-label={item.label}
              disabled={blocked}
              onClick={() => item.run()}
              onPointerEnter={() => item.preview?.(true)}
              onPointerLeave={() => item.preview?.(false)}
              onFocus={() => item.preview?.(true)}
              onBlur={() => item.preview?.(false)}
              className={twJoin(
                '-mt-px -ml-px flex size-8 shrink-0 cursor-pointer items-center justify-center bg-white text-zinc-950 inset-ring-1 inset-ring-zinc-950/10 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-300 dark:bg-zinc-800 dark:text-white dark:inset-ring-white/10 dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-600 pointer-coarse:size-10',
              )}
            >
              <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-5">
                {item.icon}
              </span>
            </button>
          </Tooltip>
        )
      })}
    </div>
  )
}
