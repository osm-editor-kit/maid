import { ChevronDownIcon } from '@heroicons/react/16/solid'
import { useState, type ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'
import { Flyout } from './Flyout.tsx'
import { ROW_BASE, ROW_FOCUS } from './inspector/listbox.ts'
import type { TooltipHint } from './tooltip-group.ts'
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
  /** Modifier keys and what they do, under the label in the tooltip */
  hints?: readonly TooltipHint[]
  /**
   * The group the command belongs to. Consecutive items of one group form one joined segment; items
   * without a group form segments of their own when they are next to each other.
   */
  group?: string
  icon: ReactNode
  run: () => void
  /** Called with true while the pointer or the focus is on the command, to show what it would do */
  preview?: (on: boolean) => void
  /**
   * The choices behind the command (the edit menu's second level): the button is then a dropdown, the icon with a
   * chevron as the favourites star of the top bar, and a click lists them. `run` of the command itself is not used.
   */
  submenu?: CommandItem[]
}

const BUTTON = twJoin(
  'flex h-8 shrink-0 cursor-pointer items-center justify-center text-zinc-950 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-300 dark:text-white dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-600 touch:h-10',
)

/**
 * A command with choices: its icon and a chevron in one button, which opens the list of choices below it. A choice
 * runs and closes the list; one that cannot run is grey with its reason under it. The button is grey when none can.
 */
function CommandDropdown({ item }: { item: CommandItem }) {
  const [open, setOpen] = useState(false)
  const choices = item.submenu ?? []
  const blocked = Boolean(item.reason)
  return (
    <Flyout
      label={item.label}
      open={open}
      onOpenChange={setOpen}
      placement="bottom-start"
      className="w-auto max-w-80 min-w-56"
      trigger={
        <button
          type="button"
          aria-label={item.label}
          aria-haspopup="menu"
          aria-expanded={open}
          title={item.reason ? `${item.label}: ${item.reason}` : item.label}
          disabled={blocked}
          data-command={item.id}
          className={twJoin(BUTTON, 'gap-0.5 px-1.5', open && 'bg-zinc-100 dark:bg-zinc-700')}
        >
          <span aria-hidden="true" className="inline-flex shrink-0 [&>svg]:size-5">
            {item.icon}
          </span>
          <ChevronDownIcon aria-hidden="true" className="size-4" />
        </button>
      }
    >
      <div role="menu" aria-label={item.label} className="flex w-full flex-col p-1">
        <div className="px-2 pt-1 pb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {item.label}
        </div>
        {choices.map((choice) => (
          <button
            key={choice.id}
            type="button"
            role="menuitem"
            data-item={choice.id}
            disabled={choice.reason !== undefined}
            onClick={() => {
              choice.preview?.(false)
              setOpen(false)
              choice.run()
            }}
            onPointerEnter={() => choice.preview?.(true)}
            onPointerLeave={() => choice.preview?.(false)}
            onFocus={() => choice.preview?.(true)}
            onBlur={() => choice.preview?.(false)}
            className={`flex w-full cursor-pointer items-start gap-2 px-2 py-1.5 text-left text-sm text-zinc-950 disabled:cursor-default disabled:text-zinc-400 dark:text-white dark:disabled:text-zinc-500 ${ROW_BASE} ${ROW_FOCUS} enabled:hover:bg-zinc-950/5 dark:enabled:hover:bg-white/10`}
          >
            <span
              aria-hidden="true"
              className="inline-flex size-5 shrink-0 items-center justify-center [&>svg]:size-4"
            >
              {choice.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{choice.label}</span>
              {choice.reason !== undefined && (
                <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                  {choice.reason}
                </span>
              )}
            </span>
          </button>
        ))}
      </div>
    </Flyout>
  )
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
            if (item.submenu) return <CommandDropdown key={item.id} item={item} />
            const blocked = Boolean(item.reason)
            return (
              <Tooltip
                key={item.id}
                label={item.label}
                shortcut={item.shortcut}
                description={item.reason ?? item.description}
                hints={item.reason ? undefined : item.hints}
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
                    'flex size-8 shrink-0 cursor-pointer items-center justify-center text-zinc-950 focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 enabled:hover:bg-zinc-50 disabled:cursor-default disabled:text-zinc-300 dark:text-white dark:enabled:hover:bg-zinc-700 dark:disabled:text-zinc-600 touch:size-10',
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
