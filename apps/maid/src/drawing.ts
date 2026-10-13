import type { DrawKind } from '@osm-editor-kit/maid-renderer'
import { engine } from './editor'
import { giveFavouriteType } from './favourites'

type Select = (selection: string | readonly string[] | null) => void

/**
 * One click of the drawing tool, from the mouse or from Space. A click that finishes the way
 * goes back to browsing and selects it, so the sidebar asks what it is (or, after a favourite
 * started it, the favourite's type is already given).
 */
export async function drawClick(
  select: Select,
  kind: DrawKind,
  point: { x: number; y: number },
  layers: string[],
) {
  const finished = await engine.draw.click(kind, point, layers)
  if (!finished) return false
  giveFavouriteType(finished, kind === 'line' ? 'draw-line' : 'draw-area')
  engine.setMode('browse')
  select(finished)
  return true
}

/** The kind of way the current mode draws, if it is a drawing mode */
export function drawingKind() {
  return engine.mode === 'draw-line' ? 'line' : engine.mode === 'draw-area' ? 'area' : undefined
}

/**
 * iD's A: continues the selected line from its end, or from the selected vertex if that is an
 * end of a line. Returns false if the selection is not something to continue.
 */
export function continueLine(selected: readonly string[]) {
  const [id] = selected
  if (selected.length !== 1 || !id) return false
  const way = id[0] === 'w' ? engine.data.way(id) : undefined
  const nodeId =
    way && !way.isClosed() ? way.nodes[way.nodes.length - 1] : id[0] === 'n' ? id : undefined
  if (!nodeId || !engine.setMode('draw-line')) return false
  if (engine.draw.startAt(nodeId)) return true
  engine.setMode('browse')
  return false
}
