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
  /**
   * The group the command belongs to. Consecutive items of one group form one joined segment; items
   * without a group form segments of their own when they are next to each other.
   */
  group?: string
  icon: ReactNode
  run: () => void
  /** Called with true while the pointer or the focus is on the command, to show what it would do */
  preview?: (on: boolean) => void
}

/** A run of consecutive items of one group: one joined segment of the bar */
type Segment = { group?: string; items: CommandItem[] }

/** The items split into runs of one group, in the same order */
function segmentsOf(items: CommandItem[]): Segment[] {
  const segments: Segment[] = []
  for (const item of items) {
    const last = segments.at(-1)
    if (last && last.group === item.group) last.items.push(item)
    else segments.push({ group: item.group, items: [item] })
  }
  return segments
}

/**
 * Icon-only commands, grouped. The consecutive items of one `group` are one joined segment: a
 * rounded box with its own ring outside, hairlines between the buttons, clipping the buttons' hover
 * background at its corners (a ring on each button would be cut off there). Segments have space between them and wrap onto the next row
 * as a whole when the sidebar is too narrow for the rest of the row. A segment wider than the bar
 * (many buttons in a very narrow panel) wraps inside itself: its outer corners stay rounded, but
 * the ends of its inner rows are square, because CSS alone cannot tell which button starts a row.
 * Each button shows its label and shortcut in a tooltip.
 */
export function CommandBar(props: { label: string; items: CommandItem[] }) {
  return (
    <div role="group" aria-label={props.label} className="flex flex-wrap gap-2">
      {segmentsOf(props.items).map((segment) => (
        <div
          key={segment.items[0]?.id}
          className="flex max-w-full flex-wrap divide-x divide-zinc-950/10 overflow-hidden rounded-md bg-white ring-1 ring-zinc-950/10 dark:divide-white/10 dark:bg-zinc-800 dark:ring-white/10"
        >
          {segment.items.map((item) => {
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
                    'flex size-8 shrink-0 cursor-pointer items-center justify-center text-zinc-950 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-300 dark:text-white dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-600 pointer-coarse:size-10',
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
      ))}
    </div>
  )
}
