/**
 * The lane the person points at or has chosen, by its diagram slot id (`way/<id>/lane/<direction>/<index>`,
 * `formatLaneSlotId`): the table, the diagram and the lanes drawn on the map read and set it, so all three mark the
 * same lane. Module state, as the selection of a lane is not worth a URL parameter.
 */
type Listener = () => void

let hovered: string | null = null
let chosen: string | null = null
const listeners = new Set<Listener>()

function emit() {
  for (const listener of listeners) listener()
}

export const laneFocus = {
  /** The lane under the pointer or the focus, or null */
  hovered: () => hovered,
  /** The lane chosen with a click in the diagram or on the map, or null */
  chosen: () => chosen,
  setHovered(id: string | null) {
    if (id === hovered) return
    hovered = id
    emit()
  },
  setChosen(id: string | null) {
    if (id === chosen) return
    chosen = id
    emit()
  },
  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
