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
import { AnimatePresence, motion, useReducedMotion, type Transition } from 'motion/react'
import {
  cloneElement,
  createContext,
  useContext,
  useEffect,
  useId,
  useReducer,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react'
import { twJoin } from 'tailwind-merge'
import { UI_SPRING } from './motion.tsx'
import { formatModifiers, formatShortcut, isApplePlatform } from './shortcut-label.ts'
import {
  INITIAL_TIP,
  reduceTip,
  tipDelay,
  type TipContent,
  type TipEvent,
  type TipPlacement,
  type TooltipHint,
} from './tooltip-group.ts'

type Placement = TipPlacement

/** The props of the wrapped element that the tooltip reads. */
type TriggerProps = { disabled?: boolean }

export type TooltipProps = {
  label: string
  shortcut?: string
  description?: string
  /** Modifier keys and what they do, one row each under the label, each key in a `kbd` */
  hints?: readonly TooltipHint[]
  placement?: Placement
  /**
   * The control is disabled. A disabled control gets no pointer events in some browsers, so the
   * tooltip reads them from a wrapper. Read from the child's `disabled` when not given.
   */
  disabled?: boolean
  children: ReactElement<TriggerProps>
}

const BUBBLE =
  'z-50 w-max max-w-82 rounded-md bg-zinc-900/90 px-2 py-1.5 text-xs text-white shadow-md select-none dark:bg-zinc-100/95 dark:text-zinc-950'

/**
 * The wrapper of a disabled control: it takes the pointer, and the control takes the wrapper's corners. Those are a
 * button's (`rounded-md`) on their own; in a joined group the group's rules set them, as for its other buttons.
 */
const DISABLED_WRAP = 'inline-flex rounded-md [&>*]:pointer-events-none [&>*]:rounded-[inherit]'

/** The group's box: short, and no overshoot, as the top bar's own changes */
const GROUP_TRANSITION: Transition = { duration: 0.12, ease: 'easeOut' }

/**
 * A label, shortcut and description that appears next to one element on hover or focus.
 *
 * Inside a `TooltipGroup` (the top bar, a row of tools) it is the group's box that shows, and it
 * moves from one button to the next. Outside a group it is its own box, opened by its own hover.
 *
 * The tooltip clones its one child and gives it the events. A child that is not a DOM element
 * (a `Flyout`) or a disabled one is wrapped in a `span` that takes the events instead. The child's
 * pointer events are switched off so the span is the hit target, and its corner radius is inherited
 * so that a `ToolGroup` still joins its corners.
 */
export function Tooltip(props: TooltipProps) {
  const group = useContext(TooltipGroupContext)
  if (group) return <GroupedTooltip {...props} group={group} />
  return <StandaloneTooltip {...props} />
}

/** Whether the tooltip takes the events on a wrapper, not on the child itself */
function needsWrap(children: ReactElement<TriggerProps>, disabled: boolean) {
  return disabled || typeof children.type !== 'string'
}

/**
 * True when the control (or the button inside the wrapper) has its panel open (`aria-expanded`, set by Flyout): then its
 * tooltip does not show, so the two never cover each other. The panel itself says what the tooltip would.
 */
function isExpanded(element: Element | null | undefined) {
  if (!element) return false
  return (
    element.getAttribute('aria-expanded') === 'true' ||
    element.querySelector('[aria-expanded="true"]') !== null
  )
}

function isDisabled(props: TooltipProps) {
  return props.disabled ?? props.children.props.disabled === true
}

/** The look of a key in a tooltip */
const KBD = twJoin(
  'rounded px-1 font-sans text-[11px] leading-4 font-medium',
  'bg-white/15 text-zinc-200 dark:bg-zinc-950/10 dark:text-zinc-700',
)

/**
 * The text of a tooltip: the label, its shortcut in a `kbd` (for the platform), the hints (a key and what it does, one
 * row each) and the description
 */
function TooltipText(props: {
  label: string
  shortcut?: string
  description?: string
  hints?: readonly TooltipHint[]
}) {
  const { label, shortcut, description, hints } = props
  const apple = isApplePlatform()
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="font-medium">{label}</span>
        {shortcut ? <kbd className={KBD}>{formatShortcut(shortcut, apple)}</kbd> : null}
      </div>
      {hints && hints.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-zinc-300 dark:text-zinc-600">
          {hints.map((hint) => (
            <li key={`${hint.keys} ${hint.text}`} className="flex items-center gap-1.5">
              <kbd className={KBD}>{formatModifiers(hint.keys, apple)}</kbd>
              <span>{hint.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {description ? (
        <p className="mt-0.5 whitespace-pre-line text-zinc-300 dark:text-zinc-600">{description}</p>
      ) : null}
    </>
  )
}

function StandaloneTooltip(props: TooltipProps) {
  const { label, shortcut, description, hints, children } = props
  const preferredPlacement = props.placement ?? 'top'
  const [open, setOpen] = useState(false)
  const reducedMotion = useReducedMotion()
  const disabled = isDisabled(props)
  const wrap = needsWrap(children, disabled)

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

  // a control whose panel is open shows no tooltip: closed at once, and again when the panel opens while it shows
  useEffect(
    function hideWhileThePanelIsOpen() {
      if (!open) return
      const element = refs.domReference.current
      if (!element) return
      const hide = () => {
        if (isExpanded(element)) setOpen(false)
      }
      // the first look in the next frame (before the bubble fades in), then on every change of the panel's state
      const frame = requestAnimationFrame(hide)
      const observer = new MutationObserver(hide)
      observer.observe(element, {
        attributes: true,
        attributeFilter: ['aria-expanded'],
        subtree: true,
      })
      return () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
      }
    },
    [open, refs],
  )

  const side = placement.split('-')[0]
  const enterOffset =
    side === 'bottom'
      ? { y: -4 }
      : side === 'left'
        ? { x: 4 }
        : side === 'right'
          ? { x: -4 }
          : { y: 4 }

  const trigger = wrap ? (
    <span
      // oxlint-disable-next-line react/refs -- refs.setReference is floating-ui's callback ref, not a .current value read during render
      ref={refs.setReference}
      {...getReferenceProps()}
      className={disabled ? DISABLED_WRAP : 'inline-flex'}
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
              className={BUBBLE}
              // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
              {...getFloatingProps({ ref: refs.setFloating, style: floatingStyles })}
            >
              <TooltipText
                label={label}
                shortcut={shortcut}
                description={description}
                hints={hints}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </FloatingPortal>
    </>
  )
}

/** What a group gives its members: the events of a button, and the reference element they are on */
type GroupApi = { send: (event: TipEvent, element?: Element) => void }

/**
 * The group a tooltip belongs to. Null outside any group, and inside a `Flyout`'s panel: a
 * tooltip in a panel is its own, not the top bar's.
 */
export const TooltipGroupContext = createContext<GroupApi | null>(null)

type TipHandlers = {
  onPointerEnter: (event: PointerEvent<Element>) => void
  onPointerLeave: () => void
  onPointerDown: () => void
  onFocus: (event: FocusEvent<Element>) => void
  onBlur: () => void
}

/** The child's own handlers run first, then the tooltip's */
function withHandlers(
  own: Record<string, unknown>,
  tip: TipHandlers,
): TriggerProps & Record<string, unknown> {
  const merged: TriggerProps & Record<string, unknown> = {}
  for (const name of Object.keys(tip) as (keyof TipHandlers)[]) {
    const mine = tip[name] as (event?: unknown) => void
    const theirs = own[name]
    merged[name] = (event?: unknown) => {
      if (typeof theirs === 'function') theirs(event)
      mine(event)
    }
  }
  return merged
}

function GroupedTooltip(props: TooltipProps & { group: GroupApi }) {
  const { label, shortcut, description, hints, children, group } = props
  const placement = props.placement ?? 'top'
  const disabled = isDisabled(props)
  const id = useId()
  const content: TipContent = { label, shortcut, description, hints, placement }
  const handlers: TipHandlers = {
    // a touch does not hover: a tap is a press, and the tooltip of a press is not shown
    onPointerEnter: (event) => {
      if (event.pointerType !== 'touch' && !isExpanded(event.currentTarget))
        group.send({ type: 'enter', id, content }, event.currentTarget)
    },
    onPointerLeave: () => group.send({ type: 'leave', id }),
    onPointerDown: () => group.send({ type: 'press', id }),
    // only the keyboard's focus shows it: a click focuses the button too, and that is not wanted
    onFocus: (event) => {
      if (
        event.target instanceof Element &&
        event.target.matches(':focus-visible') &&
        !isExpanded(event.currentTarget)
      ) {
        group.send({ type: 'focus', id, content }, event.currentTarget)
      }
    },
    onBlur: () => group.send({ type: 'leave', id }),
  }
  if (needsWrap(children, disabled)) {
    return (
      <span className={disabled ? DISABLED_WRAP : 'inline-flex'} {...handlers}>
        {children}
      </span>
    )
  }
  return cloneElement(children, withHandlers(children.props, handlers))
}

/**
 * One tooltip for the buttons of a group. The box is drawn once, next to the button that the
 * pointer or the focus is on, and it moves from one button to the next (a layout animation of
 * 120 ms; none with reduced motion). Its label changes with the button.
 *
 * Wrap the buttons of one row or one region of the top bar. The box is a portal: the buttons keep
 * their layout.
 */
export function TooltipGroup(props: { placement?: Placement; children: ReactNode }) {
  const [tip, dispatch] = useReducer(reduceTip, INITIAL_TIP)
  const reducedMotion = useReducedMotion()
  const { target, timer } = tip
  const visible = tip.phase === 'open' || tip.phase === 'closing'
  // `transform: false` keeps position on top/left so Motion can own transform (the glide)
  const { refs, floatingStyles, isPositioned } = useFloating({
    open: visible,
    placement: target?.content.placement ?? props.placement ?? 'bottom',
    transform: false,
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  })

  useEffect(
    function runTooltipTimer() {
      if (!timer) return
      const handle = window.setTimeout(() => dispatch({ type: 'timeout' }), tipDelay(timer.kind))
      return () => window.clearTimeout(handle)
    },
    [timer],
  )

  // the button whose panel opens while its tooltip shows (a click, the panel's key): the tooltip goes, as for a press
  useEffect(
    function hideWhenThePanelOpens() {
      if (!visible || !target) return
      const element = refs.domReference.current
      if (!element) return
      const press = () => {
        if (isExpanded(element)) dispatch({ type: 'press', id: target.id })
      }
      const frame = requestAnimationFrame(press)
      const observer = new MutationObserver(press)
      observer.observe(element, {
        attributes: true,
        attributeFilter: ['aria-expanded'],
        subtree: true,
      })
      return () => {
        cancelAnimationFrame(frame)
        observer.disconnect()
      }
    },
    [visible, target, refs],
  )

  const group: GroupApi = {
    send(event, element) {
      // oxlint-disable-next-line react/refs -- refs.setReference is floating-ui's callback, called from an event, not during render
      if (element && (event.type === 'enter' || event.type === 'focus')) refs.setReference(element)
      dispatch(event)
    },
  }

  return (
    <TooltipGroupContext.Provider value={group}>
      {props.children}
      <FloatingPortal>
        <AnimatePresence>
          {visible && target ? (
            <motion.div
              // one key for the whole group: the box stays mounted and moves when the target changes
              key="tooltip-group"
              // Mounted while visible so Floating UI can measure it (it positions only a mounted box, so
              // gating the mount on `isPositioned` would never show it); it fades in once positioned.
              // only the position animates: the box's width follows its label at once
              layout="position"
              role="tooltip"
              initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
              animate={isPositioned ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.96 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
              transition={reducedMotion ? { duration: 0 } : GROUP_TRANSITION}
              className={twJoin(BUBBLE, 'pointer-events-none')}
              // oxlint-disable-next-line react/refs -- refs.setFloating is floating-ui's callback ref, not a .current value read during render
              ref={refs.setFloating}
              style={floatingStyles}
            >
              <TooltipText
                label={target.content.label}
                shortcut={target.content.shortcut}
                description={target.content.description}
                hints={target.content.hints}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </FloatingPortal>
    </TooltipGroupContext.Provider>
  )
}
