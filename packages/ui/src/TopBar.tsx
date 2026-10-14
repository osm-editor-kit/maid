import type { ReactNode } from 'react'

/**
 * Top bar with start, centre and end areas. The layout follows the bar's own width (a container query, not the
 * viewport, so a narrow window or a wide sidebar both count): from 80rem it is one row with the centre in the middle;
 * below that it is two rows, the start and the end in the first and the centre in the second, so no area ever
 * covers another. An area wider than its row scrolls sideways.
 */
export function TopBar(props: { start?: ReactNode; center?: ReactNode; end?: ReactNode }) {
  return (
    <header className="@container shrink-0 border-b border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-1 px-3 py-1.5 [grid-template-areas:'start_end'_'center_center'] @min-[80rem]:min-h-12 @min-[80rem]:grid-cols-[minmax(max-content,1fr)_auto_minmax(max-content,1fr)] @min-[80rem]:py-0 @min-[80rem]:[grid-template-areas:'start_center_end']">
        <div className="flex min-w-0 items-center gap-2 [grid-area:start]">{props.start}</div>
        <div
          className={`flex min-w-0 items-center [justify-content:safe_center] gap-2 [grid-area:center] ${SCROLL_X}`}
        >
          {props.center}
        </div>
        <div
          className={`flex min-w-0 items-center [justify-content:safe_end] gap-2 [grid-area:end] ${SCROLL_X}`}
        >
          {props.end}
        </div>
      </div>
    </header>
  )
}

/**
 * An area that scrolls sideways when its row is too narrow, without a scrollbar. The areas align with `safe`, which
 * keeps the first item reachable when the content is wider than the area (plain centring would push it out on the
 * left). The padding keeps the buttons' focus rings inside the scrolling box.
 */
const SCROLL_X =
  'overflow-x-auto overscroll-x-contain py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'

/** The app name, with an optional quieter detail after it (for example the scene or version). The detail is shown from `sm` up. */
export function Brand(props: { name: string; detail?: string }) {
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
