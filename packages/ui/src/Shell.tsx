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
 * Full-height editor frame: top bar, sidebar, map area with the dock below it. Below the `sm`
 * breakpoint the sidebar is not a column: its content is a bottom sheet, opened by a button at the
 * bottom right of the map. The sheet is uncontrolled unless `sheetOpen` is given.
 */
export function Shell(props: {
  topBar?: ReactNode
  sidebar?: ReactNode
  dock?: ReactNode
  children: ReactNode
  /** Whether the bottom sheet is open, below `sm`. Without it the Shell keeps the state itself. */
  sheetOpen?: boolean
  onSheetOpenChange?: (open: boolean) => void
  /** The name of the sheet, and of the button that opens it. */
  sheetLabel?: string
}) {
  const { topBar, sidebar, dock, children, sheetOpen, onSheetOpenChange, sheetLabel } = props
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
    <div className="flex h-full flex-col overflow-hidden bg-white text-sm text-zinc-950 dark:bg-zinc-900 dark:text-white">
      {topBar}
      <div className="flex min-h-0 flex-1">
        {sidebar && wide ? (
          <div className="relative flex min-h-0 shrink-0" style={{ width: sidebarWidth.size }}>
            {sidebar}
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
                  'absolute right-3 bottom-[calc(2rem+env(safe-area-inset-bottom))] z-20 flex size-11 cursor-pointer items-center justify-center rounded-full text-zinc-950 shadow-md ring-1 ring-zinc-950/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-white dark:ring-white/10',
                  open ? 'bg-zinc-200 dark:bg-zinc-600' : 'bg-white dark:bg-zinc-800',
                )}
              >
                <AdjustmentsHorizontalIcon aria-hidden="true" className="size-6" />
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
