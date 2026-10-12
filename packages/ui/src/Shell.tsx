import type { ReactNode } from 'react'
import { ResizeHandle } from './ResizeHandle.tsx'
import { useResizable } from './useResizable.ts'

// Module level, so the hook sees the same function on every render.
const sidebarMaxWidth = (viewport: number) => Math.min(640, viewport - 360)

/** Full-height editor frame: top bar, sidebar, map area with the dock below it. */
export function Shell(props: {
  topBar?: ReactNode
  sidebar?: ReactNode
  dock?: ReactNode
  children: ReactNode
}) {
  const { topBar, sidebar, dock, children } = props
  const sidebarWidth = useResizable({
    storageKey: 'sidebar-width',
    axis: 'x',
    initial: 320,
    min: 280,
    max: sidebarMaxWidth,
    direction: 1,
  })
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-sm text-zinc-950 dark:bg-zinc-900 dark:text-white">
      {topBar}
      <div className="flex min-h-0 flex-1">
        {sidebar ? (
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
          <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
          {dock}
        </div>
      </div>
    </div>
  )
}
