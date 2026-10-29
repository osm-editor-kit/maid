import { ChevronDownIcon, XMarkIcon } from '@heroicons/react/20/solid'
import { motion } from 'motion/react'
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { twMerge } from 'tailwind-merge'
import { Flyout } from './Flyout.tsx'
import { FadeSlideIn } from './motion.tsx'
import { useBreakpoint } from './useBreakpoint.ts'

/**
 * Left column for the selection and its properties; a full-height landmark with a hairline on its
 * right. Its content eases in when the sidebar shows something else (its label changes), not on
 * every re-render.
 */
export function Sidebar(props: { label: string; children: ReactNode }) {
  return (
    <aside
      aria-label={props.label}
      className="flex h-full min-h-0 w-full flex-col border-r border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900"
    >
      <FadeSlideIn key={props.label} x={-12} className="flex min-h-0 flex-1 flex-col">
        {props.children}
      </FadeSlideIn>
    </aside>
  )
}

/**
 * Title row at the top of a sidebar, with an optional close button. With `onTitleClick` the icon
 * and the title are one large button, as iD's feature type button is: it opens what changes
 * the type, and `expanded` says whether that is open.
 *
 * With `titleFlyout` the whole row is that button (its hover background, its focus ring, its
 * `titleAction` tooltip). `meta` lies over the button at the right edge of the head.
 * It is not inside the button: the button sits underneath, the text passes clicks through to it,
 * and the controls take their own clicks, so hovering or clicking them leaves the button alone.
 * Each control in `meta` must be a button of its own.
 */
export function SidebarHeader(props: {
  icon?: ReactNode
  title: string
  subtitle?: string
  onClose?: () => void
  onTitleClick?: () => void
  expanded?: boolean
  /** What the title button does, for its tooltip and for screen readers */
  titleAction?: string
  /**
   * What the title button opens, shown in a flyout that points at the button. `expanded` says
   * whether it is open and `onTitleClick` toggles it.
   */
  titleFlyout?: ReactNode
  /** Small controls at the right edge of the head, over the head button; without `titleFlyout`, beside the head */
  meta?: ReactNode
}) {
  const { icon, title, subtitle, onClose, onTitleClick, expanded, titleAction, titleFlyout, meta } =
    props
  // from `sm` up the sidebar has room beside it for a flyout; below, it is the bottom sheet
  const wide = useBreakpoint('sm')
  // the title and the subtitle name the head button, so that it is read as one button
  const titleId = useId()
  const subtitleId = useId()
  const closeButton = onClose ? (
    <button
      type="button"
      aria-label="Close"
      onClick={onClose}
      className="relative flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white"
    >
      <XMarkIcon aria-hidden="true" className="size-5" />
    </button>
  ) : null

  if (onTitleClick && titleFlyout !== undefined) {
    // the head button: the whole row, under the text and the controls, with no content of its own
    const headButton = (
      <button
        type="button"
        aria-labelledby={subtitle ? `${titleId} ${subtitleId}` : titleId}
        aria-expanded={expanded}
        // no tooltip: the picker itself shows on hover
        aria-description={titleAction}
        // with a flyout, the flyout takes the click (it pins or closes the panel)
        onClick={wide ? undefined : onTitleClick}
        className="absolute inset-0 cursor-pointer hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 aria-expanded:bg-zinc-950/5 dark:hover:bg-white/5 dark:aria-expanded:bg-white/5"
      />
    )
    const head = (
      <div className="relative flex min-h-12 shrink-0 items-center gap-1 border-b border-zinc-950/10 dark:border-white/10">
        {wide ? (
          <Flyout
            label={titleAction ?? title}
            placement="right-start"
            className="w-[26rem]"
            focus={false}
            // the picker shows while the pointer rests on the head; a click keeps it
            hover
            open={expanded ?? false}
            onOpenChange={(open) => {
              if (open !== (expanded ?? false)) onTitleClick()
            }}
            trigger={headButton}
          >
            {titleFlyout}
          </Flyout>
        ) : (
          headButton
        )}
        {/* the head as it looks, over the button: the text passes pointer events through, the controls take theirs */}
        <div className="pointer-events-none relative flex min-w-0 flex-1 items-stretch gap-3 pr-3">
          {icon ? (
            <span
              aria-hidden="true"
              className="inline-flex size-12 shrink-0 items-center justify-center self-start bg-zinc-950/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300 [&>svg]:size-7"
            >
              {icon}
            </span>
          ) : null}
          <span className="min-w-0 flex-1 self-center py-1 text-left">
            <span id={titleId} className="block truncate leading-[1.125rem] font-semibold">
              {title}
            </span>
            {subtitle ? (
              <span
                id={subtitleId}
                className="block truncate text-xs leading-4 text-zinc-500 dark:text-zinc-400"
              >
                {subtitle}
              </span>
            ) : null}
          </span>
          {/* at the right edge, so they keep their place from one feature to the next */}
          {meta ? (
            <span className="pointer-events-auto relative z-10 flex shrink-0 items-center gap-1.5 self-center">
              {meta}
            </span>
          ) : null}
        </div>
        {closeButton}
      </div>
    )
    if (wide) return head
    // a phone: no room beside the sheet for a flyout, so what the head opens comes in under it, as iD's type list
    return (
      <>
        {head}
        {expanded ? (
          <div className="shrink-0 border-b border-zinc-950/10 p-3 dark:border-white/10">
            {titleFlyout}
          </div>
        ) : null}
      </>
    )
  }

  const plainContent = (
    <>
      {icon ? (
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md bg-zinc-950/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300 [&>svg]:size-6"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{title}</span>
        {subtitle ? (
          <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </span>
        ) : null}
      </span>
    </>
  )
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-zinc-950/10 p-2 dark:border-white/10">
      {onTitleClick ? (
        <button
          type="button"
          onClick={onTitleClick}
          aria-expanded={expanded}
          title={titleAction}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg p-1 inset-ring-1 inset-ring-zinc-950/10 hover:bg-zinc-950/5 focus-visible:outline-2 focus-visible:outline-blue-500 dark:inset-ring-white/10 dark:hover:bg-white/5"
        >
          {plainContent}
          <ChevronDownIcon
            aria-hidden="true"
            className={`mr-1 size-4 shrink-0 text-zinc-500 transition dark:text-zinc-400 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3 p-1">
          {/* a heading when the row is only a title */}
          <h2 className="contents">{plainContent}</h2>
        </div>
      )}
      {/* the same controls as on the head with a flyout, beside a head that is not a button of the picker */}
      {meta ? <span className="flex shrink-0 items-center gap-1 pr-1">{meta}</span> : null}
      {closeButton}
    </div>
  )
}

/**
 * Scrolling area under the sidebar header. `layoutScroll` tells Motion that this element scrolls, so
 * the layout animations of its rows (the sheet's reorders) are measured from its scroll position.
 * Its headings stack at its top (useStackedHeadings); it has no top padding, so the first one touches the header.
 */
export function SidebarBody(props: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null)
  useStackedHeadings(scroller)
  return (
    <motion.div
      ref={scroller}
      layoutScroll
      data-stack-scroll
      className="min-h-0 flex-1 overflow-y-auto px-3 pb-3"
    >
      {props.children}
    </motion.div>
  )
}

/** A titled group inside the sidebar body, separated from the group above by a hairline. */
export function SidebarSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-zinc-950/10 py-3 first:border-t-0 first:pt-0 dark:border-white/10">
      <h3 className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{props.title}</h3>
      {props.children}
    </section>
  )
}

/**
 * The heading of a group that folds away, and the group under it. Closed unless `defaultOpen`. `detail` is a quiet
 * word after the title, such as a count or an id, which stays readable while folded; a control as `detail` sits
 * beside the title button, not in it.
 *
 * The heading sticks to the top of its scroller (`data-stack-scroll`, see useStackedHeadings): the headings that have
 * scrolled past stack under each other, so a long group can still be folded from its middle. A pointer click on a
 * stuck heading's title scrolls its group to where the heading stands; a click on the title of a heading in its place
 * folds it, and so does the chevron and a key press. Outside a scroller the heading does not stick.
 * `headingClassName` is merged last, for a tint or another background (the opaque one stays unless it replaces it).
 */
export function SidebarDisclosure(props: {
  title: string
  detail?: ReactNode
  defaultOpen?: boolean
  /** An icon before the title, drawn for the open or folded state (the relation sections' icon) */
  icon?: (open: boolean) => ReactNode
  /** Extra classes for the heading, merged last (for example a tinted background) */
  headingClassName?: string
  /** Small icon buttons in the heading, before the chevron, shown while the section is open (e.g. "Copy all") */
  actions?: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false)
  const id = useId()
  const headingId = `${id}-heading`
  const panelId = `${id}-panel`
  const { detail } = props
  const hasDetail = detail !== undefined && detail !== ''
  // a word or a number goes into the title button; anything else (with controls) sits beside it
  const wordDetail = typeof detail === 'string' || typeof detail === 'number'

  // set by a click that opens the section: once it is drawn open, the list scrolls its content into view
  const reveal = useRef(false)
  const panel = useRef<HTMLDivElement>(null)
  useLayoutEffect(
    function revealTheOpenedSection() {
      if (!open || !reveal.current) return
      reveal.current = false
      if (panel.current) revealPanel(panel.current)
    },
    [open],
  )
  function toggle() {
    reveal.current = !open
    setOpen(!open)
  }

  function onTitleClick(event: MouseEvent<HTMLButtonElement>) {
    // a pointer click (detail > 0) on a stuck heading jumps to its group; a key press folds, as the chevron does
    const heading = event.currentTarget.parentElement
    if (event.detail > 0 && heading && jumpToStuckHeading(heading)) return
    toggle()
  }

  return (
    // display: contents, so the heading and the panel are the scroller's own layout children and the heading can stick
    <div className="contents">
      {/* zero height, in flow where the heading would be without sticking: the stacking measures from here */}
      <div aria-hidden="true" data-stack-anchor className="h-0" />
      <h3
        id={headingId}
        data-stack-heading
        className={twMerge(
          'sticky top-0 z-20 flex h-9 shrink-0 items-stretch gap-2 border-t border-zinc-950/10 bg-white text-sm font-semibold text-zinc-950 dark:border-white/10 dark:bg-zinc-900 dark:text-white',
          props.headingClassName,
        )}
      >
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onTitleClick}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500"
        >
          {props.icon?.(open)}
          <span className="min-w-0 truncate">{props.title}</span>
          {wordDetail && hasDetail ? (
            <span className="min-w-0 truncate text-xs font-normal text-zinc-500 dark:text-zinc-400">
              {detail}
            </span>
          ) : null}
        </button>
        {!wordDetail && hasDetail ? (
          <span className="flex shrink-0 items-center">{detail}</span>
        ) : null}
        {open && props.actions ? (
          <span className="flex shrink-0 items-center gap-0.5 font-normal">{props.actions}</span>
        ) : null}
        {/* the chevron folds on every click, also on a stuck heading; the title button is the keyboard's */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          onClick={toggle}
          className="grid w-8 shrink-0 cursor-pointer place-items-center text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
        >
          <ChevronDownIcon className={`size-4 transition ${open ? 'rotate-180' : ''}`} />
        </button>
      </h3>
      <div
        ref={panel}
        id={panelId}
        data-stack-panel
        role="region"
        aria-labelledby={headingId}
        hidden={!open}
        className="pt-2.5 pb-2.5"
      >
        {props.children}
      </div>
    </div>
  )
}

/**
 * Stacks the headings of a scroller (`data-stack-heading`, as SidebarDisclosure renders them). A heading whose anchor
 * has scrolled above the stack line sticks there, and the next stuck one sticks under it: `top` is the height of the
 * stuck headings before it. Positions are read first and written after, so the writes do not disturb the reads.
 */
function stackHeadings(scroller: HTMLElement) {
  const top = scroller.getBoundingClientRect().top
  const headings = Array.from(scroller.querySelectorAll<HTMLElement>('[data-stack-heading]'))
  let stack = 0
  const lines = headings.map((heading) => {
    const line = stack
    const anchor = heading.previousElementSibling
    // the anchor is not sticky, so it marks the heading's place in the flow
    const natural = anchor ? anchor.getBoundingClientRect().top - top : line
    if (natural < line - 0.5) stack += heading.offsetHeight
    return line
  })
  headings.forEach((heading, index) => {
    heading.style.top = `${lines[index]}px`
  })
}

/**
 * Keeps the stacking of one scroller current: on its scroll, its resize, a resize of a heading or a panel, and a
 * change of its children or of a panel's `hidden`. Returns what stops it.
 */
function watchHeadings(scroller: HTMLElement): () => void {
  // at most once a frame: a scroll or a burst of changes reads the layout once
  let frame = 0
  const update = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      stackHeadings(scroller)
    })
  }
  const resizes = new ResizeObserver(update)
  const watched = '[data-stack-heading], [data-stack-panel]'
  function observeAll() {
    resizes.disconnect()
    resizes.observe(scroller)
    scroller.querySelectorAll(watched).forEach((element) => resizes.observe(element))
    update()
  }
  // a section that comes or goes is observed again; other changes inside (typing, a row redrawn) are left to the
  // ResizeObserver, which sees a panel grow or shrink
  const touchesSections = (nodes: NodeList) =>
    Array.from(nodes).some(
      (node) => node instanceof Element && (node.matches(watched) || node.querySelector(watched)),
    )
  const changes = new MutationObserver((records) => {
    if (records.some((record) => record.type === 'attributes')) update()
    if (records.some((r) => touchesSections(r.addedNodes) || touchesSections(r.removedNodes)))
      observeAll()
  })
  observeAll()
  changes.observe(scroller, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['hidden'],
  })
  scroller.addEventListener('scroll', update, { passive: true })
  return () => {
    cancelAnimationFrame(frame)
    changes.disconnect()
    resizes.disconnect()
    scroller.removeEventListener('scroll', update)
  }
}

/**
 * Stacks the headings of the scroller that `ref` points to, as SidebarDisclosure renders them (see stackHeadings).
 * It runs on every render, so a scroller that mounts later (the relation column without its relation) is attached
 * when it appears, and what it watches is stopped when it goes or the component unmounts.
 */
export function useStackedHeadings(ref: RefObject<HTMLElement | null>) {
  const watching = useRef<{ element: HTMLElement; stop: () => void } | null>(null)
  useLayoutEffect(function stackTheHeadings() {
    const element = ref.current
    if (element === (watching.current?.element ?? null)) return
    watching.current?.stop()
    watching.current = element ? { element, stop: watchHeadings(element) } : null
  })
  useLayoutEffect(function stopStackingOnUnmount() {
    return () => {
      watching.current?.stop()
      watching.current = null
    }
  }, [])
}

/**
 * How far the stuck headings reach down a scroller, in its pixels: a row that should be read must start below it.
 * Zero when no heading sticks.
 */
export function stackedHeadingsCover(scroller: HTMLElement): number {
  const top = scroller.getBoundingClientRect().top
  let cover = 0
  scroller.querySelectorAll<HTMLElement>('[data-stack-heading]').forEach((heading) => {
    const line = Number.parseFloat(heading.style.top) || 0
    if (heading.getBoundingClientRect().top - top <= line + 0.5) {
      cover = Math.max(cover, line + heading.offsetHeight)
    }
  })
  return cover
}

/** A stuck heading's jump: scrolls its group so that the heading stands at its stack line. False when it is not stuck. */
function jumpToStuckHeading(heading: HTMLElement): boolean {
  const scroller = heading.closest<HTMLElement>('[data-stack-scroll]')
  const anchor = heading.previousElementSibling
  if (!scroller || !(anchor instanceof HTMLElement)) return false
  const line = Number.parseFloat(heading.style.top) || 0
  const natural = anchor.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  if (natural >= line - 0.5) return false
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scroller.scrollTo({
    top: scroller.scrollTop + natural - line,
    behavior: reduce ? 'auto' : 'smooth',
  })
  return true
}

/** Centred hint for a sidebar with nothing selected. */
export function SidebarEmpty(props: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 p-6 text-center">
      <p className="font-medium">{props.title}</p>
      {props.children ? (
        <div className="text-zinc-500 dark:text-zinc-400">{props.children}</div>
      ) : null}
    </div>
  )
}

/**
 * After a section opened: scroll its list (only the list, never the page) so that as much of the content shows as fits,
 * at most until the section's heading reaches its place among the stacked headings at the top.
 */
function revealPanel(panel: HTMLElement) {
  const list = panel.closest<HTMLElement>('[data-stack-scroll]')
  const heading = panel.previousElementSibling
  if (!list || !(heading instanceof HTMLElement)) return
  const view = list.getBoundingClientRect()
  const below = panel.getBoundingClientRect().bottom - view.bottom
  if (below <= 0) return
  const stuckAt = Number.parseFloat(heading.style.top) || 0
  const headingRoom = heading.getBoundingClientRect().top - view.top - stuckAt
  list.scrollTop += Math.min(below, Math.max(headingRoom, 0))
}
