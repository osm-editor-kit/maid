import type { EditHistory } from '@osm-editor-kit/maid-model'

// A counter per edit history that moves only when the data moves: an edit, an undo or redo (`stagingchange`) or
// arriving data (`merge`). The engine's own version also moves on selection, display and level changes, which would
// make the overview analyse a large route again on every click.

const counters = new WeakMap<EditHistory, { value: number }>()

/** How often the data of this history has changed; use it as a cache key */
export function dataVersion(history: EditHistory): number {
  let counter = counters.get(history)
  if (!counter) {
    const created = { value: 0 }
    const bump = () => {
      created.value++
    }
    history.on('stagingchange', bump)
    history.on('merge', bump)
    counters.set(history, created)
    counter = created
  }
  return counter.value
}
