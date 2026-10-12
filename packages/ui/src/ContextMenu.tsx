import { useEffect, useRef, type KeyboardEvent } from 'react'

/** One entry of a context menu */
export type MenuItem = {
  id: string
  label: string
  /** Shown at the right, e.g. "M" */
  shortcut?: string
  /** Why it cannot be chosen now; then it is greyed out and says so in its tooltip */
  reason?: string
  run: () => void
  /** Called with true while the pointer or the focus is on the item, to show what it would do */
  preview?: (on: boolean) => void
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

  // Opening moves the focus into the menu and a press outside closes it. Both are about the
  // document, not about rendering, so they are an effect.
  useEffect(() => {
    const element = menu.current
    element?.querySelector<HTMLButtonElement>('button:enabled')?.focus()
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

  // 28 px per row plus padding: enough to keep the menu inside the window without measuring it
  const height = items.length * 28 + 8
  const left = Math.max(4, Math.min(at.x, window.innerWidth - 204))
  const top = Math.max(4, Math.min(at.y, window.innerHeight - height - 4))

  return (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(event) => event.preventDefault()}
      style={{ left, top }}
      className="fixed z-50 w-50 rounded-lg bg-white p-1 text-sm shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          disabled={item.reason !== undefined}
          title={item.reason}
          onClick={() => {
            onClose()
            item.run()
          }}
          onPointerEnter={() => item.preview?.(true)}
          onPointerLeave={() => item.preview?.(false)}
          onFocus={() => item.preview?.(true)}
          onBlur={() => item.preview?.(false)}
          className="flex h-7 w-full cursor-pointer items-center justify-between gap-4 rounded-md px-2 text-left focus:bg-zinc-950/5 focus:outline-none enabled:hover:bg-zinc-950/5 disabled:cursor-default disabled:text-zinc-400 dark:focus:bg-white/10 dark:enabled:hover:bg-white/10 dark:disabled:text-zinc-500"
        >
          <span className="truncate">{item.label}</span>
          {item.shortcut && (
            <kbd className="shrink-0 font-sans text-xs text-zinc-500 dark:text-zinc-400">
              {item.shortcut}
            </kbd>
          )}
        </button>
      ))}
    </div>
  )
}
