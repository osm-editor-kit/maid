/**
 * Copy and paste of features: what Cmd+C took, and the paste as one undo step with the copies' middle at the
 * pointer. Owned by the engine as `engine.clipboard`; the engine keeps `copy`, `paste` and `canPaste`.
 */
import { actionCopyEntities, type Graph } from '@osm-editor-kit/maid-model'
import type { MaidEngine } from './engine'
import { actionMoveNodes, fromMercator, nodesOf, toMercator } from './transform'

export class Clipboard {
  constructor(private engine: MaidEngine) {}

  /** What Cmd+C took: ids and the graph they are read from when pasted */
  private taken?: { ids: string[]; graph: Graph }

  /** The copies of the last paste (every copied feature, relations too), each with the id it was copied from */
  private origins: ReadonlyMap<string, string> = new Map()

  /**
   * The copies of the last `paste`, by copy id, with the id each was copied from. Read right after the paste by the
   * shell, which offers the originals' relations (the relations module, "Also add"). Empty before any paste.
   */
  get lastPasteOrigins(): ReadonlyMap<string, string> {
    return this.origins
  }

  /** True if something was copied and can be pasted */
  get canPaste() {
    return this.taken !== undefined
  }

  /** Remembers the selection for `paste`. Returns false if nothing is selected. */
  copy() {
    if (this.engine.selection.length === 0) return false
    this.taken = { ids: [...this.engine.selection], graph: this.engine.data.history.stable.graph }
    return true
  }

  /**
   * Adds copies of what was copied, with their middle at this place, as one undo step, and
   * returns the ids of the copies. Relations are copied with new members, as in iD.
   */
  paste(lon: number, lat: number) {
    this.origins = new Map()
    const clipboard = this.taken
    if (!clipboard || this.engine.draw.active || this.engine.transform.active) return []
    // the graph is the state at the time of the copy; what was not in it cannot be copied
    const ids = clipboard.ids.filter((id) => clipboard.graph.hasEntity(id) !== undefined)
    if (ids.length === 0) return []
    const action = actionCopyEntities(ids, clipboard.graph)
    let pasted: string[] = []
    this.engine.change(() => {
      const { history } = this.engine.data
      history.perform(action)
      const copies = action.copies()
      this.origins = new Map(Object.entries(copies).map(([from, copy]) => [copy.id, from]))
      pasted = ids.map((id) => copies[id]?.id).filter((id) => id !== undefined)
      // move the copies as a whole so that their middle is where the pointer is
      const nodes = [...nodesOf(this.engine, pasted)].map((id) => ({
        id,
        at: toMercator(this.engine.data.node(id)?.loc ?? [0, 0]),
      }))
      if (nodes.length > 0) {
        const to = toMercator([lon, lat])
        const dx = to[0] - nodes.reduce((sum, n) => sum + n.at[0], 0) / nodes.length
        const dy = to[1] - nodes.reduce((sum, n) => sum + n.at[1], 0) / nodes.length
        // one action for all the nodes: one commit, not one per node
        history.perform(
          actionMoveNodes(
            nodes.map((n) => [n.id, fromMercator([n.at[0] + dx, n.at[1] + dy])] as const),
          ),
        )
      }
      const what = pasted.length === 1 ? 'a feature' : `${pasted.length} features`
      history.commit({ annotation: `Pasted ${what}`, selectedIDs: pasted })
    })
    this.engine.setSelected(pasted)
    return pasted
  }
}
