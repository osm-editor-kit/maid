import type { ReactNode } from 'react'

/** Full-height editor frame: top bar, sidebar, map area with the dock below it. */
export function Shell(props: {
  topBar?: ReactNode
  sidebar?: ReactNode
  dock?: ReactNode
  children: ReactNode
}) {
  const { topBar, sidebar, dock, children } = props
  return (
    <div className="flex h-full flex-col overflow-hidden bg-white text-sm text-zinc-950 dark:bg-zinc-900 dark:text-white">
      {topBar}
      <div className="flex min-h-0 flex-1">
        {sidebar ? <div className="flex min-h-0 w-80 shrink-0">{sidebar}</div> : null}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="relative min-h-0 flex-1 overflow-hidden">{children}</main>
          {dock}
        </div>
      </div>
    </div>
  )
}
