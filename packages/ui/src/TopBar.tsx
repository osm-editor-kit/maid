import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { Tooltip, TooltipGroup } from './Tooltip.tsx'

/**
 * Top bar with start, centre and end areas. The layout follows the bar's own width (a container query, not the
 * viewport, so a narrow window or a wide sidebar both count). From the widest to the narrowest:
 *
 * 1. One row. The centre (draw tools, undo and redo) starts at the left edge of the map, i.e. where the sidebar
 *    ends (`--sidebar-width`, set by `Shell` on its root; 0 without a sidebar), and the end stays at the right.
 * 2. Less room: the centre moves left, next to the start. This is not a breakpoint: the first grid column is
 *    `minmax(max-content, sidebar)`, and a grid gives such a track the free space up to its maximum before it gives
 *    the rest to the centre, so the centre slides smoothly from the map edge to the logo and never jumps.
 * 3. Below 76rem the labels of the draw buttons go (`ToolButton`'s `collapseLabel`).
 * 4. Below 67rem the gaps between the buttons are 30% smaller.
 * 5. Two rows only when the start, the centre and the end no longer fit in one row with the centre next to the start
 *    (measured, `useOneRow`): the start and the end in the first row, the centre in the second. An area wider than
 *    its row scrolls sideways. The steps 3 and 4 stay container queries.
 *
 * Measured with the German texts, the longest, in the parking app (the most panel buttons), logged in with a
 * long name (px; padding 24 + start 34 + 16 + centre + 16 + end):
 * - full labels, normal gaps: centre 452 (draw 369, undo 71, gap 12), end 659 (8 icons of 36, Save 119, account up to 180,
 *   gap 8): 1201 needed, so step 3 begins at 1216 (76rem), 15 px of room for French "Enregistrer";
 * - no labels: centre 292, 1041 needed, so step 4 begins at 1072 (67rem);
 * - compact (gaps 8.4 and 5.6): centre 289, end 638: 1017 needed, so in this case the rows begin at about 1040.
 * Each step begins where the one before stops fitting. Logged out the end is 188 px shorter (Save is hidden), and an
 * app with fewer panel buttons is shorter too: the rows are measured, so they begin later there.
 * Change a text or add a button and measure again.
 */
export function TopBar(props: { start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  const bar = useRef<HTMLDivElement>(null)
  const oneRow = useOneRow(bar)
  return (
    <header className="@container shrink-0 border-b border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      <div
        ref={bar}
        data-rows={oneRow ? 'one' : 'two'}
        className={`grid items-center px-3 ${oneRow ? ONE_ROW : TWO_ROWS}`}
      >
        <div
          data-area
          className={`flex min-w-0 items-center gap-2 [grid-area:start] ${oneRow ? 'pr-4' : ''}`}
        >
          {props.start}
        </div>
        <div
          data-area
          className={`flex min-w-0 items-center [grid-area:center] ${CENTER_GAP} ${oneRow ? '[justify-content:flex-start]' : '[justify-content:safe_center]'} ${SCROLL_X}`}
        >
          {props.center}
        </div>
        <div
          data-area
          className={`flex min-w-0 items-center [justify-content:safe_end] [grid-area:end] ${END_GAP} ${oneRow ? 'pl-4' : ''} ${SCROLL_X}`}
        >
          {/* the buttons at the end share one tooltip: the first opens it, the next ones switch it */}
          <TooltipGroup>{props.end}</TooltipGroup>
        </div>
      </div>
    </header>
  )
}

/**
 * One row: the start, then the centre from the map's left edge (`--sidebar-width`, the first column gives up its room
 * down to the start's own width before anything else gives), then the end. Two rows: start and end, then the centre.
 */
const ONE_ROW =
  'min-h-12 grid-cols-[minmax(max-content,calc(var(--sidebar-width,0px)-0.75rem))_minmax(max-content,1fr)_max-content] [grid-template-areas:"start_center_end"]'
const TWO_ROWS =
  'grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 py-1.5 [grid-template-areas:"start_end"_"center_center"]'

/**
 * Whether the bar's three areas fit in one row with the centre next to the start: the width of their content (the
 * children and the gaps between them, whatever the area's own width in the current layout), the paddings, against the
 * bar's width. Measured again when the bar or a content changes size (a label that collapses, the account's name) and
 * when a button comes or goes.
 */
function useOneRow(bar: { current: HTMLDivElement | null }) {
  const [oneRow, setOneRow] = useState(true)
  useLayoutEffect(
    function measureWhatFits() {
      const element = bar.current
      if (!element) return
      const areas = [...element.querySelectorAll<HTMLElement>(':scope > [data-area]')]
      const measure = () => {
        // the bar's padding (24) and the 16 px on each side of the centre in one row
        let needed = 24 + 2 * 16
        for (const area of areas) needed += contentWidth(area)
        setOneRow(needed <= element.clientWidth)
      }
      const sizes = new ResizeObserver(measure)
      const watch = () => {
        sizes.disconnect()
        sizes.observe(element)
        for (const area of areas) for (const child of area.children) sizes.observe(child)
        measure()
      }
      // a button that comes or goes (Save after logging in) is watched too
      const children = new MutationObserver(watch)
      for (const area of areas) children.observe(area, { childList: true })
      watch()
      return () => {
        sizes.disconnect()
        children.disconnect()
      }
    },
    [bar],
  )
  return oneRow
}

/** The width of an area's children and the gaps between them, as a flex row lays them out */
function contentWidth(area: HTMLElement) {
  const children = [...area.children] as HTMLElement[]
  const gap = Number.parseFloat(getComputedStyle(area).columnGap) || 0
  let width = Math.max(0, children.length - 1) * gap
  for (const child of children) width += child.getBoundingClientRect().width
  return width
}

/** The gaps between the groups of the centre (12px) and between the buttons of the end (8px), 30% smaller below 67rem */
const CENTER_GAP = 'gap-3 @max-[67rem]:gap-[0.525rem]'
const END_GAP = 'gap-2 @max-[67rem]:gap-[0.35rem]'

/**
 * An area that scrolls sideways when its row is too narrow, without a scrollbar. The areas align with `safe`, which
 * keeps the first item reachable when the content is wider than the area (plain centring would push it out on the
 * left). A scrolling box clips in both directions, so the padding keeps the buttons' focus rings and the badges
 * that stick out of their corners (the filter count, `-top-1.5`) inside it; the negative margin gives the bar its
 * height back. Without it Safari on a phone cut the count in half.
 */
const SCROLL_X =
  'overflow-x-auto overscroll-x-contain -my-1.5 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/**
 * The app at the top left. With a logo only the logo shows, and its name and detail appear on hover, as the
 * buttons' labels do (the `img` carries the name for screen readers). Without a logo: the name, and the quieter
 * detail after it from `sm` up.
 */
export function Brand(props: { name: string; detail?: string; logo?: string }) {
  if (props.logo) {
    return (
      <Tooltip label={props.name} description={props.detail} placement="bottom">
        <img src={props.logo} alt={props.name} className="h-8 w-auto shrink-0" />
      </Tooltip>
    )
  }
  return (
    <div className="flex min-w-0 items-baseline gap-2">
      <span className="shrink-0 font-semibold">{props.name}</span>
      {props.detail ? (
        <span className="hidden truncate text-zinc-500 sm:block dark:text-zinc-400">
          {props.detail}
        </span>
      ) : null}
    </div>
  )
}
