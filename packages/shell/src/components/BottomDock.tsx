import { useExtensionPoint } from '@osm-editor-kit/maid-core/react'
import { Dock } from '@osm-editor-kit/maid-ui'
import type { DockView } from '@osm-editor-kit/maid-ui'
import { useCallback, useSyncExternalStore } from 'react'
import { useSelection } from '../selection'
import { useShell } from '../shell-context'

/** The ids of the views that have something to show now (`DockView.available`), as one string, so it compares by value */
function useAvailableIds(views: readonly DockView[], selected: readonly string[]) {
  const subscribe = useCallback(
    (listener: () => void) => {
      const stops = views.flatMap((view) => {
        const stop = view.available?.subscribe?.(listener)
        return stop ? [stop] : []
      })
      return () => stops.forEach((stop) => stop())
    },
    [views],
  )
  const snapshot = useCallback(
    () =>
      views
        .filter((view) => view.available?.get({ selected }) ?? true)
        .map((view) => view.id)
        .join(' '),
    [views, selected],
  )
  return useSyncExternalStore(subscribe, snapshot)
}

/**
 * The dock under the map, closed at first: the views of modules that have something to show now (`dock.view`). With
 * none, there is no dock at all. The list of what is loaded ("Data") is gone (Tobias, 2026-10-23): nothing a mapper
 * needs.
 */
export function BottomDock() {
  const { editor, engine } = useShell()
  const all = useExtensionPoint(editor, 'dock.view')
  const { select, ids } = useSelection()
  const availableIds = useAvailableIds(all, ids).split(' ')
  const views = all.filter((view) => availableIds.includes(view.id))
  // stable for as long as the engine is: a view memoises on these props
  const highlight = useCallback((ids: readonly string[] | null) => engine.setRelated(ids), [engine])
  const readOnly = useCallback((id: string) => engine.isReadOnly(id), [engine])
  return (
    <Dock
      tabs={views.map((view) => ({
        id: view.id,
        label: view.label,
        content: (
          <view.component
            editor={editor}
            select={select}
            selected={ids}
            highlight={highlight}
            readOnly={readOnly}
          />
        ),
      }))}
    />
  )
}
