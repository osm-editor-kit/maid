import { ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/20/solid'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useId, useState, type ReactNode } from 'react'
import { twJoin } from 'tailwind-merge'
import { UI_SPRING } from './motion.tsx'
import { ResizeHandle } from './ResizeHandle.tsx'
import { useResizable } from './useResizable.ts'

export type DockTab = { id: string; label: string; content: ReactNode }

// Module level, so the hook sees the same function on every render.
const dockMaxHeight = (viewport: number) => viewport * 0.7

/** Tabbed panel below the map. The tab bar stays visible when the panel is collapsed. */
export function Dock(props: { tabs: DockTab[]; defaultOpen?: boolean }) {
  const { tabs, defaultOpen = false } = props
  const [open, setOpen] = useState(defaultOpen)
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined)
  const panelHeight = useResizable({
    storageKey: 'dock-height',
    axis: 'y',
    initial: 224,
    min: 120,
    max: dockMaxHeight,
    direction: -1,
  })
  const reducedMotion = useReducedMotion()
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

  // No animation while the handle is dragged: the panel follows the pointer exactly.
  const instant = reducedMotion || panelHeight.dragging

  return (
    <div className="relative shrink-0 border-t border-zinc-950/10 bg-white dark:border-white/10 dark:bg-zinc-900">
      {open ? (
        <ResizeHandle
          label="Resize panel"
          edge="top"
          dragging={panelHeight.dragging}
          {...panelHeight.handleProps}
        />
      ) : null}
      <div className="flex h-9 items-stretch justify-between">
        <div
          role="tablist"
          aria-label="Panels"
          className="flex min-w-0 items-stretch gap-4 overflow-x-auto pl-3"
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
                  'flex shrink-0 cursor-pointer items-center border-b-2 px-1 text-sm font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500',
                  isSelected
                    ? 'border-zinc-950 text-zinc-950 dark:border-white dark:text-white'
                    : 'border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:text-zinc-200',
                )}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          aria-label={open ? 'Collapse panel' : 'Expand panel'}
          onClick={() => setOpen(!open)}
          className="flex size-9 shrink-0 cursor-pointer items-center justify-center text-zinc-500 hover:text-zinc-950 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-500 dark:text-zinc-400 dark:hover:text-white"
        >
          {open ? (
            <ChevronDownIcon aria-hidden="true" className="size-5" />
          ) : (
            <ChevronUpIcon aria-hidden="true" className="size-5" />
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
