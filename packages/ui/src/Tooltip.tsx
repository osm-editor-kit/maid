import {
  autoUpdate,
  flip,
  FloatingPortal,
  offset,
  safePolygon,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { cloneElement, useState, type ReactElement } from 'react'
import { twJoin } from 'tailwind-merge'
import { UI_SPRING } from './motion.tsx'

type Placement = 'top' | 'bottom' | 'left' | 'right'

/** The props of the wrapped element that the tooltip reads. */
type TriggerProps = { disabled?: boolean }

/**
 * A label, shortcut and description that appears next to one element on hover or focus.
 *
 * The tooltip clones its one child and gives it the floating reference and the interaction
 * props. A disabled child gets no mouse events in browsers, so it is wrapped in a `span` that
 * takes the events instead. The child's pointer events are switched off so the span is the hit
 * target, and its corner radius is inherited so that a `ToolGroup` still joins its corners.
 */
export function Tooltip(props: {
  label: string
  shortcut?: string
  description?: string
  placement?: Placement
  children: ReactElement<TriggerProps>
}) {
  const { label, shortcut, description, children } = props
  const preferredPlacement = props.placement ?? 'top'
  const [open, setOpen] = useState(false)
  const reducedMotion = useReducedMotion()

  // `transform: false` keeps position on top/left so Motion can own transform (scale/offset).
  const { refs, floatingStyles, context, placement, isPositioned } = useFloating({
    open,
    onOpenChange: setOpen,
    placement: preferredPlacement,
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  // safePolygon keeps the tooltip open while the pointer crosses the gap to the bubble
  // (needed for a multi-line description the user may want to read).
  const hover = useHover(context, {
    move: false,
    delay: { open: 50, close: 0 },
    handleClose: safePolygon(),
  })
  // React `onFocus` uses focusin, so focusing a wrapped button still opens the tooltip.
  const focus = useFocus(context)
  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'tooltip' })
  const { getReferenceProps, getFloatingProps } = useInteractions([hover, focus, dismiss, role])

  const side = placement.split('-')[0]
  const enterOffset =
    side === 'bottom'
      ? { y: -4 }
      : side === 'left'
        ? { x: 4 }
        : side === 'right'
          ? { x: -4 }
          : { y: 4 }

  const disabled = children.props.disabled === true
  const trigger = disabled ? (
    <span
      ref={refs.setReference}
      {...getReferenceProps()}
      className="inline-flex [&>*]:pointer-events-none [&>*]:rounded-[inherit]"
    >
      {children}
    </span>
  ) : (
    // oxlint-disable-next-line react/refs -- refs.setReference is floating-ui's callback ref, not a .current value read during render
    cloneElement(children, getReferenceProps({ ...children.props, ref: refs.setReference }))
  )

  return (
    <>
      {trigger}
      <FloatingPortal>
        <AnimatePresence>
          {open && (
            <motion.div
              // Mount while open so Floating UI can measure; animate only after
              // `isPositioned` so Motion does not play from (0, 0).
              initial={reducedMotion ? false : { opacity: 0, scale: 0.96, ...enterOffset }}
              animate={
                isPositioned
                  ? { opacity: 1, scale: 1, x: 0, y: 0 }
                  : { opacity: 0, scale: 0.96, ...enterOffset }
              }
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, ...enterOffset }}
              transition={reducedMotion ? { duration: 0 } : UI_SPRING}
              className="z-50 w-max max-w-82 rounded-md bg-zinc-900/90 px-2 py-1.5 text-xs text-white shadow-md select-none dark:bg-zinc-100/95 dark:text-zinc-950"
              // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
              {...getFloatingProps({ ref: refs.setFloating, style: floatingStyles })}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium">{label}</span>
                {shortcut ? (
                  <kbd
                    className={twJoin(
                      'rounded px-1 font-sans text-[11px] leading-4 font-medium',
                      'bg-white/15 text-zinc-200 dark:bg-zinc-950/10 dark:text-zinc-700',
                    )}
                  >
                    {shortcut}
                  </kbd>
                ) : null}
              </div>
              {description ? (
                <p className="mt-0.5 whitespace-pre-line text-zinc-300 dark:text-zinc-600">
                  {description}
                </p>
              ) : null}
            </motion.div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}
