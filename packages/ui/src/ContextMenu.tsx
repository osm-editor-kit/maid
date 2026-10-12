import { Fragment, useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

/** One entry of a context menu */
export type MenuItem = {
  id: string
  label: string
  /** Drawn before the label in a fixed slot, so that the labels line up; a row without one keeps the slot empty */
  icon?: ReactNode
  /** Shown at the right, e.g. "M" */
  shortcut?: string
  /** Why it cannot be chosen now; then it is greyed out and says so in its tooltip */
  reason?: string
  run: () => void
  /** Called with true while the pointer or the focus is on the item, to show what it would do */
  preview?: (on: boolean) => void
  /** Items with the same section are listed under one heading, which is drawn above the first of them */
  section?: string
  /** Choosing it runs `run` and leaves the menu open, for a choice that changes what the menu is about */
  keepOpen?: boolean
  /** The current one of a choice: shown in bold, and it has the focus when the menu opens */
  current?: boolean
}

/**
 * A menu at a place on the screen, as a right click opens it. Arrow keys move, Enter or a click
 * chooses, Escape or a click elsewhere closes. It stays inside the window.
 */
export function ContextMenu(props: {
  /** Where the pointer was, in window pixels */
  at: { x: number; y: number }
  label: string
  items: MenuItem[]
  onClose: () => void
}) {
  const { at, label, items, onClose } = props
  const menu = useRef<HTMLDivElement>(null)

  // Opening moves the focus into the menu, once: the menu re-renders with every change of the
  // editor, and a focus moved again on each of those would undo the arrow keys. A press outside
  // closes it. Both are about the document, not about rendering, so they are effects.
  useEffect(() => {
    const current = menu.current?.querySelector<HTMLButtonElement>(
      'button[aria-current="true"]:enabled',
    )
    ;(current ?? menu.current?.querySelector<HTMLButtonElement>('button:enabled'))?.focus()
  }, [])
  useEffect(() => {
    const element = menu.current
    const onPress = (event: PointerEvent) => {
      if (event.target instanceof Node && !element?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', onPress, true)
    return () => document.removeEventListener('pointerdown', onPress, true)
  }, [onClose])

  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:enabled') ?? [])]
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const focus = (index: number) => buttons[(index + buttons.length) % buttons.length]?.focus()
    if (event.key === 'Escape') onClose()
    else if (event.key === 'ArrowDown') focus(current + 1)
    else if (event.key === 'ArrowUp') focus(current - 1)
    else if (event.key === 'Home') focus(0)
    else if (event.key === 'End') focus(-1)
    else return
    event.preventDefault()
    event.stopPropagation()
  }

  // a heading row is 22 px and a divider 9 px; 28 px per row plus padding, and 212 px of width:
  // enough to keep the menu inside the window without measuring it
  const headings = items.filter((item, i) => item.section && item.section !== items[i - 1]?.section)
  const dividers = items.filter((item, i) => !item.section && items[i - 1]?.section).length
  const height = items.length * 28 + 8 + headings.length * 22 + dividers * 9
  const left = Math.max(4, Math.min(at.x, window.innerWidth - 212))
  const top = Math.max(4, Math.min(at.y, window.innerHeight - height - 4))

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left, top }}
      className="fixed z-50 w-52 rounded-lg bg-white p-1 text-sm shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
    >
      {items.map((item, i) => {
        const previous = items[i - 1]
        return (
          <Fragment key={item.id}>
            {item.section && item.section !== previous?.section && (
              <div
                role="presentation"
                className="truncate px-2 pt-1.5 pb-1 text-xs text-zinc-500 dark:text-zinc-400"
              >
                {item.section}
              </div>
            )}
            {!item.section && previous?.section && (
              <div role="separator" className="my-1 h-px bg-zinc-950/10 dark:bg-white/10" />
            )}
            <button
              type="button"
              role="menuitem"
              aria-current={item.current ? 'true' : undefined}
              disabled={item.reason !== undefined}
              title={item.reason}
              onClick={() => {
                if (!item.keepOpen) onClose()
                item.run()
              }}
              onPointerEnter={() => item.preview?.(true)}
              onPointerLeave={() => item.preview?.(false)}
              onFocus={() => item.preview?.(true)}
              onBlur={() => item.preview?.(false)}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded-md px-2 text-left focus:bg-zinc-950/5 focus:outline-none enabled:hover:bg-zinc-950/5 disabled:cursor-default disabled:text-zinc-400 dark:focus:bg-white/10 dark:enabled:hover:bg-white/10 dark:disabled:text-zinc-500"
            >
              <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span>
              <span className={`min-w-0 flex-1 truncate ${item.current ? 'font-semibold' : ''}`}>
                {item.label}
              </span>
              {item.shortcut && (
                <kbd className="shrink-0 font-sans text-xs text-zinc-500 dark:text-zinc-400">
                  {item.shortcut}
                </kbd>
              )}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}
