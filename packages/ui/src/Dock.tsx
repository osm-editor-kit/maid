import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'
import { BottomSheet } from './BottomSheet.tsx'
import { useDockRequest } from './dock-request.ts'
import { UI_SPRING } from './motion.tsx'
import { ResizeHandle } from './ResizeHandle.tsx'
import { useBreakpoint } from './useBreakpoint.ts'
import { useResizable } from './useResizable.ts'

export type DockTab = { id: string; label: string; content: ReactNode }

// Module level, so the hook sees the same function on every render.
const dockMaxHeight = (viewport: number) => viewport * 0.7

/**
 * Tabbed panel below the map. The tabs float as a small bar on the map's lower edge, not as a strip across the whole
 * width (Tobias, 2026-10-23), so the closed dock covers almost nothing; the panel opens below them, across the width.
 * On a phone (below `sm`) the panel is a bottom sheet, as the sidebar there: a grab row to drag it down, the tabs at
 * its top, the content scrolling under them (Tobias, 2026-10-29: an 8px edge to resize was no handle for a finger).
 */
export function Dock(props: { tabs: DockTab[]; defaultOpen?: boolean }) {
  const { tabs, defaultOpen = false } = props
  const [open, setOpen] = useState(defaultOpen)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  // a module asked for one of its views (openDockView): open on that tab
  // (state adjusted while rendering, as React advises for a change of an input; no effect)
  const request = useDockRequest()
  const [seenRequest, setSeenRequest] = useState(request)
  if (request !== seenRequest) {
    setSeenRequest(request)
    if (request) {
      setSelectedId(request.viewId)
      setOpen(true)
    }
  }
  const panelHeight = useResizable({
    storageKey: 'dock-height',
    axis: 'y',
    initial: 224,
    min: 120,
    max: dockMaxHeight,
    direction: -1,
  })
  // the tab shown while open; when it goes away (its view has nothing to show any more) the dock closes rather than
  // show another one (state adjusted while rendering, as for the request above)
  const [shownId, setShownId] = useState<string | undefined>(undefined)
  const shownNow = open ? (tabs.find((tab) => tab.id === selectedId) ?? tabs[0])?.id : undefined
  if (open && shownId !== undefined && !tabs.some((tab) => tab.id === shownId)) {
    setOpen(false)
    setShownId(undefined)
  } else if (shownNow !== shownId) {
    setShownId(shownNow)
  }
  const reducedMotion = useReducedMotion()
  const wide = useBreakpoint('sm')
  const baseId = useId()
  // Falls back to the first tab until one is picked, and when the picked tab is gone.
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0]
  if (!selected) return null

  const selectedTabId = selected.id
  const tabElementId = (id: string) => `${baseId}-tab-${id}`
  const panelId = `${baseId}-panel`

  function selectTab(tab: DockTab) {
    if (open && tab.id === selectedTabId) {
      setOpen(false)
      return
    }
    setSelectedId(tab.id)
    setOpen(true)
  }

  const tabList = (
    <div
      role="tablist"
      aria-label="Panels"
      className="flex min-w-0 items-center gap-0.5 overflow-x-auto"
    >
      {tabs.map((tab) => {
        const isSelected = tab.id === selectedTabId
        return (
          <button
            key={tab.id}
            id={tabElementId(tab.id)}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={open && isSelected ? panelId : undefined}
            onClick={() => selectTab(tab)}
            className={twJoin(
              'shrink-0 cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 pointer-coarse:px-3 pointer-coarse:py-2 pointer-coarse:text-sm',
              open && isSelected
                ? 'bg-zinc-950 text-white dark:bg-white dark:text-zinc-950'
                : 'text-zinc-600 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-300 dark:hover:bg-white/10 dark:hover:text-white',
            )}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )

  if (!wide) {
    return (
      <div className="relative shrink-0">
        {open ? null : (
          <div className="absolute bottom-full left-2 z-10 mb-2 flex max-w-[calc(100%-1rem)] items-center gap-0.5 rounded-lg bg-white/95 p-0.5 shadow-md ring-1 ring-zinc-950/10 dark:bg-zinc-900/95 dark:ring-white/10">
            {tabList}
          </div>
        )}
        <BottomSheet id={panelId} label={selected.label} open={open} onOpenChange={setOpen}>
          <div className="sticky top-0 z-10 bg-white px-3 pb-2 dark:bg-zinc-900">{tabList}</div>
          <div role="tabpanel" aria-labelledby={tabElementId(selectedTabId)} className="px-3 pb-3">
            {selected.content}
          </div>
        </BottomSheet>
      </div>
    )
  }

  // No animation while the handle is dragged: the panel follows the pointer exactly.
  const instant = reducedMotion || panelHeight.dragging

  return (
    <div
      className={twJoin(
        'relative shrink-0 bg-white dark:bg-zinc-900',
        open && 'border-t border-zinc-950/10 dark:border-white/10',
      )}
    >
      {open ? (
        <ResizeHandle
          label="Resize panel"
          edge="top"
          dragging={panelHeight.dragging}
          {...panelHeight.handleProps}
        />
      ) : null}
      <div className="absolute bottom-full left-2 z-10 mb-2 flex max-w-[calc(100%-1rem)] items-center gap-0.5 rounded-lg bg-white/95 p-0.5 shadow-md ring-1 ring-zinc-950/10 dark:bg-zinc-900/95 dark:ring-white/10">
        {tabList}
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={open ? 'Collapse panel' : 'Expand panel'}
          onClick={() => setOpen(!open)}
          className="flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-950 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-white"
        >
          {open ? (
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          ) : (
            <ChevronUpIcon aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="panel"
            id={panelId}
            role="tabpanel"
            aria-labelledby={tabElementId(selectedTabId)}
            className="overflow-hidden"
            initial={reducedMotion ? false : { height: 0 }}
            animate={{ height: panelHeight.size }}
            exit={{ height: 0 }}
            transition={instant ? { duration: 0 } : UI_SPRING}
          >
            <div className="h-full overflow-y-auto p-3">{selected.content}</div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
