import { XMarkIcon } from '@heroicons/react/20/solid'
import {
  AnimatePresence,
  motion,
  useDragControls,
  useReducedMotion,
  type PanInfo,
} from 'motion/react'
import { useEffect, useSyncExternalStore, type FocusEvent, type ReactNode } from 'react'
import { UI_SPRING } from './motion.tsx'

/** A drag down this far, in pixels, or this fast in pixels per second, closes the sheet. */
const DISMISS_OFFSET = 120
const DISMISS_VELOCITY = 500

/** Whether a drag that ended with this offset and velocity (down is positive) closes the sheet. */
export function shouldDismiss(offsetY: number, velocityY: number) {
  return offsetY > DISMISS_OFFSET || velocityY > DISMISS_VELOCITY
}

/**
 * How much of the window's bottom the on-screen keyboard covers, in CSS px: iOS shrinks only the visual viewport, so a
 * sheet fixed to the bottom of the layout would sit behind the keyboard. 0 without a keyboard.
 */
export function coveredBottom(innerHeight: number, viewportHeight: number, viewportTop: number) {
  return Math.max(0, Math.round(innerHeight - viewportHeight - viewportTop))
}

function subscribeViewport(notify: () => void) {
  const viewport = window.visualViewport
  viewport?.addEventListener('resize', notify)
  viewport?.addEventListener('scroll', notify)
  return () => {
    viewport?.removeEventListener('resize', notify)
    viewport?.removeEventListener('scroll', notify)
  }
}

/** The visual viewport as `covered,height`: one string, so the snapshot stays the same value until it changes */
function viewportKey() {
  const viewport = window.visualViewport
  if (!viewport) return '0,0'
  return `${coveredBottom(window.innerHeight, viewport.height, viewport.offsetTop)},${Math.round(viewport.height)}`
}

/** A field that gets the focus is scrolled into view once the keyboard has opened (it animates in) */
function revealFocused(event: FocusEvent<HTMLElement>) {
  const target = event.target
  if (!target.matches('input, textarea, select, [contenteditable="true"]')) return
  window.setTimeout(() => target.scrollIntoView({ block: 'nearest' }), 300)
}

/**
 * A panel that slides up from the bottom of the window, for phones. It is not modal: there is no
 * backdrop, so the map stays in view and usable above it. It closes by its close button, by a
 * drag down from the grab row, or by Escape. The grab row is the only drag target, so the
 * content scrolls as usual. While the on-screen keyboard is open the sheet sits above it, and a field that gets the
 * focus is scrolled into view.
 */
export function BottomSheet(props: {
  id: string
  label: string
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
}) {
  const { id, label, open, onOpenChange, children } = props
  const dragControls = useDragControls()
  const reducedMotion = useReducedMotion()
  const [covered = 0, viewportHeight = 0] = useSyncExternalStore(
    subscribeViewport,
    viewportKey,
    () => '0,0',
  )
    .split(',')
    .map(Number)

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="sheet"
          id={id}
          role="dialog"
          aria-label={label}
          // above the keyboard while one is open, and no taller than the part of the window it leaves
          style={
            covered > 0
              ? { bottom: covered, maxHeight: Math.round(viewportHeight * 0.7) }
              : undefined
          }
          className="fixed inset-x-0 bottom-0 z-40 flex max-h-[70dvh] flex-col overflow-hidden rounded-t-xl bg-white pb-[env(safe-area-inset-bottom)] text-zinc-950 shadow-xl ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:text-white dark:ring-white/10"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={reducedMotion ? { duration: 0 } : UI_SPRING}
          drag="y"
          dragControls={dragControls}
          dragListener={false}
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0, bottom: 0.6 }}
          onDragEnd={(_event: unknown, info: PanInfo) => {
            if (shouldDismiss(info.offset.y, info.velocity.y)) onOpenChange(false)
          }}
        >
          <div
            className="grid shrink-0 touch-none grid-cols-[2.5rem_1fr_2.5rem] items-center py-1 select-none"
            onPointerDown={(event) => dragControls.start(event)}
          >
            <span aria-hidden="true" />
            <span
              aria-hidden="true"
              className="h-1.5 w-11 justify-self-center rounded-full bg-zinc-300 dark:bg-zinc-600"
            />
            <button
              type="button"
              aria-label={`Close ${label}`}
              onClick={() => onOpenChange(false)}
              onPointerDown={(event) => event.stopPropagation()}
              className="flex size-10 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white"
            >
              <XMarkIcon aria-hidden="true" className="size-5" />
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
            onFocus={revealFocused}
          >
            {children}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
