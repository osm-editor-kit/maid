import {
  arrow,
  autoUpdate,
  flip,
  FloatingFocusManager,
  FloatingPortal,
  offset,
  shift,
  size,
  useClick,
  useDismiss,
  useFloating,
  useInteractions,
  useRole,
  type Placement,
} from '@floating-ui/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cloneElement, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { twMerge } from 'tailwind-merge'
import { UI_SPRING } from './motion.tsx'
import { TooltipGroupContext } from './Tooltip.tsx'

/** The arrow is a square turned by 45°, half of it behind the panel's edge */
const ARROW_SIZE = 16
const ARROW_TIP = Math.ceil((ARROW_SIZE * Math.SQRT2) / 2)

/** Per side of the trigger the panel is on: the edge the arrow sits on, and its two outer borders */
const ARROW_SIDE = {
  bottom: { edge: 'top', borders: 'border-t border-l' },
  top: { edge: 'bottom', borders: 'border-r border-b' },
  right: { edge: 'left', borders: 'border-b border-l' },
  left: { edge: 'right', borders: 'border-t border-r' },
} as const

/**
 * A large panel that opens from one button and points at it with an arrow, in the look of
 * Tailwind Plus's flyout menus: rounded, with a soft shadow. For choices that need more room than
 * a menu, such as the feature type or the filters. A click on the button toggles it; a click
 * outside or Escape closes it. Uncontrolled unless `open` is given.
 *
 * The flyout clones its one `trigger` child and gives it the floating reference and the click
 * handlers, so the trigger keeps its own look.
 */
export function Flyout(props: {
  /** Names the panel for screen readers */
  label: string
  trigger: ReactElement
  children: ReactNode
  placement?: Placement
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Classes for the panel, mainly its width (`w-96`, `w-[44rem]`) */
  className?: string
  /** Moves the keyboard focus into the panel when it opens. Off for panels that focus a field themselves. */
  focus?: boolean
}) {
  const { label, trigger, children, placement = 'bottom', className, focus = true } = props
  const [ownOpen, setOwnOpen] = useState(false)
  const open = props.open ?? ownOpen
  const setOpen = (next: boolean) => {
    setOwnOpen(next)
    props.onOpenChange?.(next)
  }
  const arrowRef = useRef<HTMLSpanElement>(null)
  const reducedMotion = useReducedMotion()

  // `transform: false` keeps position on top/left so Motion can own transform
  const {
    refs,
    floatingStyles,
    context,
    isPositioned,
    placement: placed,
    middlewareData,
  } = useFloating({
    open,
    onOpenChange: setOpen,
    placement,
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [
      offset(ARROW_TIP + 4),
      flip({ padding: 8 }),
      shift({ padding: 8 }),
      // never larger than the window: the panel's content scrolls instead
      size({
        padding: 8,
        apply({ availableWidth, availableHeight, elements }) {
          elements.floating.style.maxWidth = `${availableWidth}px`
          elements.floating.style.maxHeight = `${availableHeight}px`
        },
      }),
      // oxlint-disable-next-line react/refs -- floating-ui reads the ref after render, not during it
      arrow({ element: arrowRef, padding: 20 }),
    ],
  })
  const click = useClick(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'dialog' })
  const { getReferenceProps, getFloatingProps } = useInteractions([click, dismiss, role])

  const side = placed.split('-')[0] as keyof typeof ARROW_SIDE
  const arrowSide = ARROW_SIDE[side]
  const from =
    side === 'bottom'
      ? { y: -6 }
      : side === 'top'
        ? { y: 6 }
        : side === 'left'
          ? { x: 6 }
          : { x: -6 }
  const hidden = { opacity: 0, scale: 0.98, ...from }

  return (
    <>
      {cloneElement(
        trigger,
        getReferenceProps({
          ...(trigger.props as object),
          ref: refs.setReference,
          'aria-expanded': open,
        }),
      )}
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <FloatingFocusManager context={context} modal={false} initialFocus={focus ? 0 : -1}>
              <motion.div
                aria-label={label}
                initial={reducedMotion ? false : hidden}
                animate={isPositioned ? { opacity: 1, scale: 1, x: 0, y: 0 } : hidden}
                exit={reducedMotion ? { opacity: 0 } : hidden}
                transition={reducedMotion ? { duration: 0 } : UI_SPRING}
                className={twMerge(
                  'z-40 flex w-96 flex-col rounded-2xl border border-zinc-950/10 bg-white text-sm text-zinc-950 shadow-xl dark:border-white/15 dark:bg-zinc-800 dark:text-white dark:shadow-2xl dark:shadow-black/60',
                  className,
                )}
                {...getFloatingProps({ ref: refs.setFloating, style: floatingStyles })}
              >
                {/* The panel's own colour and border, so the arrow reads as part of it. Tailwind
                    Plus's flyouts have no arrow; this is the usual turned square. */}
                <span
                  ref={arrowRef}
                  aria-hidden="true"
                  className={twMerge(
                    'absolute rotate-45 rounded-[3px] border-zinc-950/10 bg-white dark:border-white/15 dark:bg-zinc-800',
                    arrowSide.borders,
                  )}
                  style={{
                    width: ARROW_SIZE,
                    height: ARROW_SIZE,
                    left: middlewareData.arrow?.x,
                    top: middlewareData.arrow?.y,
                    [arrowSide.edge]: -ARROW_SIZE / 2,
                  }}
                />
                <div className="relative min-h-0 flex-1 overflow-y-auto rounded-2xl">
                  {/* a tooltip inside the panel is its own, not the group of the button that opened it */}
                  <TooltipGroupContext.Provider value={null}>
                    {children}
                  </TooltipGroupContext.Provider>
                </div>
              </motion.div>
            </FloatingFocusManager>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}
