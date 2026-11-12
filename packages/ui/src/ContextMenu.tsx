import { device } from '@osm-editor-kit/maid-i18n'
import { motion, useReducedMotion } from 'motion/react'
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'
import { DETAILS_MAX_WIDTH, DetailsBox, type MenuDetails } from './DetailsBox.tsx'
import { ROW_BASE, ROW_CURRENT, ROW_FOCUS } from './inspector/listbox.ts'
import { UI_SPRING } from './motion.tsx'
import { TAP } from './Toolbar.tsx'
import type { TooltipHint } from './tooltip-group.ts'
import { Tooltip } from './Tooltip.tsx'

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
  /** Modifier keys and what they do: the row's tooltip when it can be chosen, one line each */
  hints?: readonly TooltipHint[]
  run: () => void
  /** Called with true while the pointer or the focus is on the item, to show what it would do */
  preview?: (on: boolean) => void
  /** Items with the same section are listed under one heading, which is drawn above the first of them */
  section?: string
  /** Choosing it runs `run` and leaves the menu open, for a choice that changes what the menu is about */
  keepOpen?: boolean
  /** The current one of a choice: shown in bold, and it has the focus when the menu opens */
  current?: boolean
  /**
   * More than the label and the reason say, as a small table (what blocks a Merge, the tags Copy tags copies): shown in
   * a box beside the menu while the pointer is on the row, a disabled one too. Asked only then. Not on a touch device,
   * which has no hover.
   */
  details?: () => MenuDetails | undefined
  /**
   * A second level: the item opens a flyout beside it with these items (on hover, a click or the right arrow key), and
   * its own `run` is not called. Used for an operation with several targets (which sidewalk gets the tags).
   */
  submenu?: MenuItem[]
}

/** The gap between the menu and the box of a row's details, and how long the box stays when the pointer leaves */
const DETAILS_GAP = 8
const DETAILS_LINGER = 120

/** The menu is 208 px wide (w-52); it keeps 4 px to the edges of the window */
const MENU_WIDTH = 208
const MARGIN = 4
/** The widest a flyout (`MenuItem.submenu`) gets: its labels say more than a command's */
const FLYOUT_WIDTH = 320
/**
 * The height of the rows as they are drawn: a row 28 px (h-7), 44 px on a touch device (`touch:h-11`, a finger's
 * size: the menu opens on a long press and holds Delete), 56 px on a touch device for a disabled row with its reason
 * under the label (`touch:h-14`: a 20 px label and up to two 16 px lines of reason), a heading 26 px (text-xs with 6 px
 * above and 4 px below), a divider 9 px (1 px with 4 px around it), and the panel's padding 8 px. The menu's height is
 * worked out from the items, so that the place is known before it is drawn.
 */
const ROW = 28
const TOUCH_ROW = 44
const TOUCH_REASON_ROW = 56
const HEADING = 26
const DIVIDER = 9
const PADDING = 8
/** The marker of a stack: a chip 24 px high (h-6) with the 4 px gap of the block, 28 px in all */
const MARKER_BLOCK = 28

/** The height of one row as it is drawn; `touch` is the device's input (`device().input === 'touch'`) */
function rowHeight(item: MenuItem, touch: boolean) {
  if (!touch) return ROW
  return item.reason !== undefined ? TOUCH_REASON_ROW : TOUCH_ROW
}

function menuHeight(items: readonly MenuItem[]) {
  const touch = device().input === 'touch'
  let height = PADDING
  items.forEach((item, i) => {
    const previous = items[i - 1]
    if (item.section && item.section !== previous?.section) height += HEADING
    if (!item.section && previous?.section) height += DIVIDER
    height += rowHeight(item, touch)
  })
  return height
}

/**
 * Where the block of a menu goes for a point of the window: its top edge at the point when the
 * menu fits below it, else its bottom edge at the point (it flips up), and inside the window in
 * both cases. A marker is part of the block: above the menu when the menu is below the point,
 * under it when the menu is flipped, so it moves, flips and stays visible with the menu.
 */
function placeMenu(
  at: { x: number; y: number },
  height: number,
  marker: number,
  view: { width: number; height: number },
) {
  const below = at.y + height + MARGIN <= view.height
  const wanted = below ? at.y - marker : at.y - height
  const block = height + marker
  const top = Math.max(MARGIN, Math.min(wanted, view.height - block - MARGIN))
  const left = Math.max(MARGIN, Math.min(at.x, view.width - MENU_WIDTH - MARGIN))
  return { left, top, flipped: !below }
}

/**
 * A menu at a place on the screen, as a right click opens it. Arrow keys move, Enter or a click
 * chooses, Escape or a click elsewhere closes. It stays inside the window, and a menu that does
 * not fit below its place flips up. `marker` is a chip that goes with the menu (a stack's count):
 * it is one element with the menu, so it is placed, flipped and faded with it.
 */
export function ContextMenu(props: {
  /** Where the pointer was, in window pixels */
  at: { x: number; y: number }
  label: string
  items: MenuItem[]
  /** Drawn above the menu, or under it when the menu is flipped up; it is not a menu row */
  marker?: ReactNode
  onClose: () => void
}) {
  const { at, label, items, marker, onClose } = props
  const frame = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const reducedMotion = useReducedMotion()
  // the row whose details are shown, with its top edge in the frame's pixels
  const [shown, setShown] = useState<{
    id: string
    top: number
    details: MenuDetails
  } | null>(null)
  const linger = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => () => clearTimeout(linger.current), [])
  const showDetails = (item: MenuItem, row: HTMLElement) => {
    clearTimeout(linger.current)
    // without a table the box still says the reason: a disabled row with details lets the pointer through, so its
    // title shows no tooltip
    const details =
      item.details?.() ??
      (item.reason !== undefined ? { title: item.reason, columns: [], rows: [] } : undefined)
    const top = row.getBoundingClientRect().top - (frame.current?.getBoundingClientRect().top ?? 0)
    setShown(details ? { id: item.id, top, details } : null)
  }
  // a moment's grace, so that the pointer can cross the gap to the box (a long table scrolls there)
  const hideDetails = () => {
    clearTimeout(linger.current)
    linger.current = setTimeout(() => setShown(null), DETAILS_LINGER)
  }
  // the box stays inside the window: a box that would run off the bottom moves up
  useLayoutEffect(() => {
    const element = box.current
    if (!element || !shown) return
    element.style.top = `${shown.top}px`
    const overflow = element.getBoundingClientRect().bottom - (window.innerHeight - MARGIN)
    if (overflow > 0) element.style.top = `${shown.top - overflow}px`
  }, [shown])
  // the open flyout: the item it belongs to and where its row is on the screen
  const [flyout, setFlyout] = useState<{ id: string; row: DOMRect; focus: boolean } | null>(null)
  const flyoutItem = flyout ? items.find((item) => item.id === flyout.id) : undefined
  const openFlyout = (item: MenuItem, row: HTMLElement, focus: boolean) =>
    setFlyout({ id: item.id, row: row.getBoundingClientRect(), focus })

  // Closing gives the focus back to what had it before the menu opened (a keyboard user stays
  // where they were), unless the focus has moved on elsewhere meanwhile or the opener is gone.
  useEffect(() => {
    const element = frame.current
    const opener = document.activeElement
    return () => {
      const active = document.activeElement
      const lost = !active || active === document.body || element?.contains(active)
      if (lost && opener instanceof HTMLElement && opener !== document.body && opener.isConnected)
        opener.focus({ preventScroll: true })
    }
  }, [])
  // Opening moves the focus into the menu. It is not moved on every render: the menu re-renders
  // with every change of the editor, and that would undo the arrow keys. A press outside closes
  // it. Both are about the document, not about rendering, so they are effects.
  // The highlight follows the current one of a choice: when another item becomes the current one
  // while the menu is open (a key that steps through the choice), the focus moves to it, so the
  // highlighted row and the bold row are always the same.
  const currentIndex = items.findIndex((item) => item.current)
  useEffect(() => {
    const current = menu.current?.querySelector<HTMLButtonElement>(
      'button[aria-current="true"]:enabled',
    )
    // without a scroll: the menu is fixed and placed inside the window, and a focus that scrolls moves the whole
    // page on iOS, which stays shifted (page-pin.ts)
    ;(current ?? menu.current?.querySelector<HTMLButtonElement>('button:enabled'))?.focus({
      preventScroll: true,
    })
  }, [currentIndex])
  useEffect(() => {
    const element = frame.current
    const onPress = (event: PointerEvent) => {
      // the marker is part of the menu: a press on it does not close the menu
      if (event.target instanceof Node && !element?.contains(event.target)) onClose()
    }
    document.addEventListener('pointerdown', onPress, true)
    return () => document.removeEventListener('pointerdown', onPress, true)
  }, [onClose])

  const onKeyDown = (event: KeyboardEvent) => {
    // the right arrow opens the flyout of the focused item and moves the focus into it
    const focused = document.activeElement
    const withFlyout =
      focused instanceof HTMLElement && menu.current?.contains(focused)
        ? items.find((item) => item.submenu && item.id === focused.dataset.item)
        : undefined
    if (event.key === 'ArrowRight' && withFlyout && focused instanceof HTMLElement) {
      openFlyout(withFlyout, focused, true)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:enabled') ?? [])]
    const current = buttons.findIndex((button) => button === document.activeElement)
    const focus = (index: number) =>
      buttons[(index + buttons.length) % buttons.length]?.focus({
        preventScroll: true,
      })
    switch (event.key) {
      case 'Escape':
        onClose()
        break
      case 'ArrowDown':
        focus(current + 1)
        break
      case 'ArrowUp':
        focus(current - 1)
        break
      case 'Home':
        focus(0)
        break
      case 'End':
        focus(-1)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }

  const { left, top, flipped } = placeMenu(at, menuHeight(items), marker ? MARKER_BLOCK : 0, {
    width: window.innerWidth,
    height: window.innerHeight,
  })

  // A touch device has no hover to show a reason, so a disabled row with one says it under its label
  const touch = device().input === 'touch'
  // the details go right of the menu where they fit, else left of it
  const detailsRight =
    left + MENU_WIDTH + DETAILS_GAP + DETAILS_MAX_WIDTH + MARGIN <= window.innerWidth

  const panel = (
    <div
      ref={menu}
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="w-full rounded-lg bg-white p-1 text-sm shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
    >
      {items.map((item, i) => {
        const previous = items[i - 1]
        // a row with details shows them on hover; a disabled one lets the pointer through to its wrapper, as a
        // disabled button gets no pointer events in every browser, and the box says its reason (the title stays for
        // screen readers and the checks)
        const withDetails = item.details !== undefined && !touch
        const row = (
          <button
            type="button"
            role="menuitem"
            data-item={item.id}
            aria-current={item.current ? 'true' : undefined}
            aria-haspopup={item.submenu ? 'menu' : undefined}
            aria-expanded={item.submenu ? flyout?.id === item.id : undefined}
            disabled={item.reason !== undefined}
            title={item.reason}
            onClick={(event) => {
              if (item.submenu) {
                openFlyout(item, event.currentTarget, event.detail === 0)
                return
              }
              if (!item.keepOpen) onClose()
              item.run()
            }}
            onPointerEnter={(event) => {
              // another row closes the open flyout; a row with one opens it
              if (item.submenu) openFlyout(item, event.currentTarget, false)
              else if (flyout) setFlyout(null)
              item.preview?.(true)
            }}
            onPointerLeave={() => item.preview?.(false)}
            onFocus={(event) => {
              item.preview?.(true)
              if (withDetails) showDetails(item, event.currentTarget)
            }}
            onBlur={() => {
              item.preview?.(false)
              if (withDetails) hideDetails()
            }}
            className={`flex h-7 ${withDetails ? 'disabled:pointer-events-none' : ''} w-full cursor-pointer items-center gap-2 px-2 text-left disabled:cursor-default disabled:text-zinc-400 dark:disabled:text-zinc-500 ${touch && item.reason !== undefined ? 'touch:h-14' : 'touch:h-11'} ${TAP} ${ROW_BASE} ${ROW_FOCUS} ${
              item.current
                ? ROW_CURRENT
                : 'enabled:hover:bg-zinc-950/5 enabled:active:bg-zinc-950/10 dark:enabled:hover:bg-white/10 dark:enabled:active:bg-white/15'
            }`}
          >
            <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span>
            <span className={`min-w-0 flex-1 ${item.current ? 'font-semibold' : ''}`}>
              <span className="block truncate">{item.label}</span>
              {touch && item.reason !== undefined && (
                <span className="line-clamp-2 text-xs leading-4 font-normal text-zinc-500 dark:text-zinc-400">
                  {item.reason}
                </span>
              )}
            </span>
            {item.submenu && (
              <span aria-hidden="true" className="shrink-0 text-zinc-500 dark:text-zinc-400">
                ›
              </span>
            )}
            {item.shortcut && !item.submenu && (
              <kbd className="shrink-0 font-sans text-xs text-zinc-500 dark:text-zinc-400 nokeys:hidden">
                {item.shortcut}
              </kbd>
            )}
          </button>
        )
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
            {withDetails ? (
              <div
                data-details-row={item.id}
                onPointerEnter={(event) => showDetails(item, event.currentTarget)}
                onPointerLeave={hideDetails}
              >
                {row}
              </div>
            ) : item.hints && item.hints.length > 0 && item.reason === undefined ? (
              // the keys the command's mode reads, in the tooltip the command bar shows for it
              <Tooltip label={item.label} hints={item.hints} placement="right">
                {row}
              </Tooltip>
            ) : (
              row
            )}
          </Fragment>
        )
      })}
    </div>
  )

  return (
    <motion.div
      ref={frame}
      onContextMenu={(event: MouseEvent) => event.preventDefault()}
      // the menu and its marker enter together, with the spring of the other UI chrome
      initial={reducedMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={reducedMotion ? { duration: 0 } : UI_SPRING}
      style={{ left, top }}
      className="fixed z-50 flex w-52 flex-col gap-1"
    >
      {shown && (
        <div
          ref={box}
          data-menu-details={shown.id}
          onPointerEnter={() => clearTimeout(linger.current)}
          onPointerLeave={hideDetails}
          style={{ top: shown.top }}
          className={`absolute ${detailsRight ? 'left-full ml-2' : 'right-full mr-2'}`}
        >
          <DetailsBox details={shown.details} />
        </div>
      )}
      {flipped ? (
        <>
          {panel}
          {marker && <div className="self-start">{marker}</div>}
        </>
      ) : (
        <>
          {marker && <div className="self-start">{marker}</div>}
          {panel}
        </>
      )}
      {flyout && flyoutItem?.submenu && (
        <Flyout
          key={flyout.id}
          parent={flyoutItem}
          row={flyout.row}
          focus={flyout.focus}
          onBack={() => {
            setFlyout(null)
            menu.current
              ?.querySelector<HTMLButtonElement>(`button[data-item="${CSS.escape(flyout.id)}"]`)
              ?.focus({ preventScroll: true })
          }}
          onClose={onClose}
        />
      )}
    </motion.div>
  )
}

/**
 * The second level of a context menu: the items of `parent.submenu` in a panel beside its row, to the right, or to the
 * left when the window has no room there. Up and down move, Enter or a click chooses (and closes the whole menu), the
 * left arrow or Escape goes back to the row. Inside the menu's frame, so a press in it does not close the menu.
 */
function Flyout(props: {
  parent: MenuItem
  row: DOMRect
  focus: boolean
  onBack: () => void
  onClose: () => void
}) {
  const { parent, row, focus, onBack, onClose } = props
  const panel = useRef<HTMLDivElement>(null)
  const items = parent.submenu ?? []
  const touch = device().input === 'touch'
  useEffect(() => {
    if (focus)
      panel.current
        ?.querySelector<HTMLButtonElement>('button:enabled')
        ?.focus({ preventScroll: true })
  }, [focus])
  const height = menuHeight(items)
  // as wide as its longest label, up to FLYOUT_WIDTH: placed for that width, so it never runs out of the window
  const right = row.right + MARGIN
  const left =
    right + FLYOUT_WIDTH + MARGIN <= window.innerWidth
      ? right
      : row.left - FLYOUT_WIDTH - MARGIN >= MARGIN
        ? row.left - FLYOUT_WIDTH - MARGIN
        : Math.max(MARGIN, window.innerWidth - FLYOUT_WIDTH - MARGIN)
  const top = Math.max(MARGIN, Math.min(row.top - 4, window.innerHeight - height - MARGIN))
  const onKeyDown = (event: KeyboardEvent) => {
    const buttons = [
      ...(panel.current?.querySelectorAll<HTMLButtonElement>('button:enabled') ?? []),
    ]
    const current = buttons.findIndex((button) => button === document.activeElement)
    const move = (index: number) =>
      buttons[(index + buttons.length) % buttons.length]?.focus({ preventScroll: true })
    switch (event.key) {
      case 'ArrowLeft':
      case 'Escape':
        onBack()
        break
      case 'ArrowDown':
        move(current + 1)
        break
      case 'ArrowUp':
        move(current - 1)
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
  }
  return (
    <div
      ref={panel}
      role="menu"
      aria-label={parent.label}
      onKeyDown={onKeyDown}
      style={{ left, top, maxWidth: FLYOUT_WIDTH }}
      className="fixed z-50 w-max min-w-52 rounded-lg bg-white p-1 text-sm shadow-lg ring-1 ring-zinc-950/10 dark:bg-zinc-800 dark:ring-white/10"
    >
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          data-item={item.id}
          disabled={item.reason !== undefined}
          title={item.reason}
          onClick={() => {
            item.preview?.(false)
            onClose()
            item.run()
          }}
          onPointerEnter={() => item.preview?.(true)}
          onPointerLeave={() => item.preview?.(false)}
          onFocus={() => item.preview?.(true)}
          onBlur={() => item.preview?.(false)}
          className={`flex h-7 w-full cursor-pointer items-center gap-2 px-2 text-left disabled:cursor-default disabled:text-zinc-400 dark:disabled:text-zinc-500 ${touch && item.reason !== undefined ? 'touch:h-14' : 'touch:h-11'} ${TAP} ${ROW_BASE} ${ROW_FOCUS} enabled:hover:bg-zinc-950/5 enabled:active:bg-zinc-950/10 dark:enabled:hover:bg-white/10 dark:enabled:active:bg-white/15`}
        >
          <span className="flex size-5 shrink-0 items-center justify-center">{item.icon}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate">{item.label}</span>
            {touch && item.reason !== undefined && (
              <span className="line-clamp-2 text-xs leading-4 font-normal text-zinc-500 dark:text-zinc-400">
                {item.reason}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
