/**
 * A request to open one view of the dock under the map, from anywhere: a module that shows something there (the
 * street-level image of a field's "eye") asks for its view, and the dock opens on that tab. The dock keeps its own
 * open state; this only carries the latest request, numbered so that asking for the same view again opens it again.
 */
import { create } from 'zustand'

type DockRequest = { viewId: string; serial: number }

const useDockRequestStore = create<{ request?: DockRequest }>(() => ({}))

/** Opens the dock on the view with this id (a `dock.view` item's id) */
export function openDockView(viewId: string) {
  useDockRequestStore.setState((state) => ({
    request: { viewId, serial: (state.request?.serial ?? 0) + 1 },
  }))
}

/** The latest request, for the dock */
export const useDockRequest = () => useDockRequestStore((state) => state.request)
