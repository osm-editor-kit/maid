import { AdjustmentsHorizontalIcon } from '@heroicons/react/24/outline'
import { useId, useState, type ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'
import { BottomSheet } from './BottomSheet.tsx'
import { ResizeHandle } from './ResizeHandle.tsx'
import { useBreakpoint } from './useBreakpoint.ts'
import { useResizable } from './useResizable.ts'

// Module level, so the hook sees the same function on every render.
const sidebarMaxWidth = (viewport: number) => Math.min(640, viewport - 360)

/**
 * Publishes the real width of the sidebar column (the sidebar, and the column before it while there is one) as
 * `--sidebar-width` on the shell's root, where the top bar reads it to start its tools at the map's left edge. It is
 * measured, not computed, so the relation column and the frame around the sidebar count. A ref callback and the style
 * of the root, not React state: no render follows a drag of the handle. The root says 0px without a column.
 */
function publishWidth(column: HTMLElement | null) {
  const root = column?.parentElement?.parentElement
  if (!column || !root) return
  const write = () => root.style.setProperty('--sidebar-width', `${column.offsetWidth}px`)
  write()
  const observer = new ResizeObserver(write)
  observer.observe(column)
  return () => {
    observer.disconnect()
    root.style.removeProperty('--sidebar-width')
  }
}

/**
 * Full-height editor frame: top bar, sidebar, map area with the dock below it. Below the `sm`
 * breakpoint the sidebar is not a column: its content is a bottom sheet, opened by a button at the
 * bottom right of the map. The sheet is uncontrolled unless `sheetOpen` is given.
 *
 * `sidebarStart` is a column before the sidebar that belongs to it, as an open relation's member list beside the
 * inspector. While it is there, both share one tinted frame and the sidebar becomes a card inside it, so the sidebar
 * reads as a part of the column. The sidebar keeps its place in the tree, so it is not mounted again. The column is
 * not shown in the bottom sheet.
 */
export function Shell(props: {
  topBar?: ReactNode
  sidebar?: ReactNode
  /** A column before the sidebar, with the sidebar as a card beside it (see above) */
  sidebarStart?: ReactNode
  dock?: ReactNode
  children: ReactNode
  /** Whether the bottom sheet is open, below `sm`. Without it the Shell keeps the state itself. */
  sheetOpen?: boolean
  onSheetOpenChange?: (open: boolean) => void
  /** The name of the sheet, and of the button that opens it. */
  sheetLabel?: string
}) {
  const {
    topBar,
    sidebar,
    sidebarStart,
    dock,
    children,
    sheetOpen,
    onSheetOpenChange,
    sheetLabel,
  } = props
  const sidebarWidth = useResizable({
    storageKey: 'sidebar-width',
    axis: 'x',
    initial: 320,
    min: 280,
    max: sidebarMaxWidth,
    direction: 1,
  })
  const wide = useBreakpoint('sm')
  const [ownSheetOpen, setOwnSheetOpen] = useState(false)
  const sheetId = useId()
  const open = sheetOpen ?? ownSheetOpen
  function setOpen(next: boolean) {
    if (sheetOpen === undefined) setOwnSheetOpen(next)
    onSheetOpenChange?.(next)
  }
  const label = sheetLabel ?? 'Properties'
  const inSheet = Boolean(sidebar) && !wide

  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-sm text-zinc-950 [--sidebar-width:0px] dark:bg-zinc-900 dark:text-white">
      {topBar}
      <div className="flex min-h-0 flex-1">
        {sidebar && wide ? (
          <div
            ref={publishWidth}
            className={twJoin(
              'relative flex min-h-0 shrink-0',
              sidebarStart &&
                'border-r border-zinc-950/10 bg-violet-100 dark:border-white/10 dark:bg-violet-950/50',
            )}
          >
            {sidebarStart ?? null}
            <div
              className={twJoin('flex min-h-0', sidebarStart && 'py-2 pr-2')}
              style={{ width: sidebarWidth.size }}
            >
              <div
                className={twJoin(
                  'flex min-h-0 min-w-0 flex-1',
                  sidebarStart &&
                    'overflow-hidden rounded-xl shadow-sm ring-1 ring-zinc-950/10 dark:ring-white/10 [&>aside]:border-r-0',
                )}
              >
                {sidebar}
              </div>
            </div>
            <ResizeHandle
              label="Resize sidebar"
              edge="right"
              dragging={sidebarWidth.dragging}
              {...sidebarWidth.handleProps}
            />
          </div>
        ) : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1 overflow-hidden">
            {children}
            {inSheet ? (
              <button
                type="button"
                aria-label={label}
                aria-expanded={open}
                aria-controls={open ? sheetId : undefined}
                onClick={() => setOpen(!open)}
                className={twJoin(
                  'absolute right-3 bottom-[calc(2rem_+_env(safe-area-inset-bottom))] z-20 flex size-14 cursor-pointer items-center justify-center rounded-full text-zinc-950 shadow-md ring-1 ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-white dark:ring-white/10',
                  open ? 'bg-zinc-200 dark:bg-zinc-600' : 'bg-white dark:bg-zinc-800',
                )}
              >
                <AdjustmentsHorizontalIcon aria-hidden="true" className="size-7" />
              </button>
            ) : null}
          </main>
          {dock}
        </div>
      </div>
      {inSheet ? (
        <BottomSheet id={sheetId} label={label} open={open} onOpenChange={setOpen}>
          {/* the sidebar's hairline on its right edge is for the column, not for the sheet */}
          <div className="[&_aside]:border-r-0">{sidebar}</div>
        </BottomSheet>
      ) : null}
    </div>
  )
}
