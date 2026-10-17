import type { ReactNode } from 'react'
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
 * 5. Below 65rem two rows: the start and the end in the first, the centre in the second. An area
 *    wider than its row scrolls sideways.
 *
 * Measured with the German texts, the longest, in the parking app (the most panel buttons), logged in with a
 * long name (px; padding 24 + start 34 + 16 + centre + 16 + end):
 * - full labels, normal gaps: centre 452 (draw 369, undo 71, gap 12), end 659 (8 icons of 36, Save 119, account up to 180,
 *   gap 8): 1201 needed, so step 3 begins at 1216 (76rem), 15 px of room for French "Enregistrer";
 * - no labels: centre 292, 1041 needed, so step 4 begins at 1072 (67rem);
 * - compact (gaps 8.4 and 5.6): centre 289, end 638: 1017 needed, so rows begin at 1040 (65rem).
 * Each step begins where the one before stops fitting. Logged out the end is 188 px shorter (Save is hidden).
 * Change a text or add a button and measure again.
 */
export function TopBar(props: { start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  return (
    <header className="@container shrink-0 border-b border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-3 py-1.5 [grid-template-areas:'start_end'_'center_center'] @min-[65rem]:min-h-12 @min-[65rem]:grid-cols-[minmax(max-content,calc(var(--sidebar-width,0px)-0.75rem))_minmax(max-content,1fr)_max-content] @min-[65rem]:gap-x-0 @min-[65rem]:py-0 @min-[65rem]:[grid-template-areas:'start_center_end']">
        <div className="flex min-w-0 items-center gap-2 [grid-area:start] @min-[65rem]:pr-4">
          {props.start}
        </div>
        <div
          className={`flex min-w-0 items-center [justify-content:safe_center] [grid-area:center] ${CENTER_GAP} @min-[65rem]:[justify-content:flex-start] ${SCROLL_X}`}
        >
          {props.center}
        </div>
        <div
          className={`flex min-w-0 items-center [justify-content:safe_end] [grid-area:end] ${END_GAP} @min-[65rem]:pl-4 ${SCROLL_X}`}
        >
          {/* the buttons at the end share one tooltip: the first opens it, the next ones switch it */}
          <TooltipGroup>{props.end}</TooltipGroup>
        </div>
      </div>
    </header>
  )
}

/** The gaps between the groups of the centre (12px) and between the buttons of the end (8px), 30% smaller below 67rem */
const CENTER_GAP = 'gap-3 @max-[67rem]:gap-[0.525rem]'
const END_GAP = 'gap-2 @max-[67rem]:gap-[0.35rem]'

/**
 * An area that scrolls sideways when its row is too narrow, without a scrollbar. The areas align with `safe`, which
 * keeps the first item reachable when the content is wider than the area (plain centring would push it out on the
 * left). The padding keeps the buttons' focus rings inside the scrolling box.
 */
const SCROLL_X =
  'overflow-x-auto overscroll-x-contain py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

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
