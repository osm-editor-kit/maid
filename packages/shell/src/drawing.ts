import type { DrawKind, DrawToolItem, MaidEngine, Mode } from '@osm-editor-kit/maid-renderer'
import { giveFavouriteType } from './favourites'
import { markNewFeature } from './new-feature'

type Select = (selection: string | readonly string[] | null) => void

/**
 * One click of the drawing tool, from the mouse or from Space. A click that finishes the way
 * goes back to browsing and selects it, so the sidebar asks what it is (or, after a favourite
 * started it, the favourite's type is already given).
 */
export async function drawClick(
  engine: MaidEngine,
  select: Select,
  kind: DrawKind,
  point: { x: number; y: number },
  layers: string[],
) {
  const finished = await engine.draw.click(kind, point, layers)
  if (!finished) return false
  giveFavouriteType({ engine }, finished, kind === 'line' ? 'draw-line' : 'draw-area')
  engine.setMode('browse')
  markNewFeature(finished)
  select(finished)
  return true
}

/**
 * The kind of way a mode draws, if it is a drawing mode. The one answer to "is this a drawing mode": the map,
 * the keys and the draw calls read it, never a comparison of their own.
 */
export function drawKindOf(mode: Mode): DrawKind | undefined {
  return mode === 'draw-line' ? 'line' : mode === 'draw-area' ? 'area' : undefined
}

/** The kind of way the current mode draws, if it is a drawing mode */
export function drawingKind(engine: MaidEngine) {
  return drawKindOf(engine.mode)
}

/**
 * iD's A: continues the selected line from its end, or from the selected vertex if that is an
 * end of a line. Returns false if the selection is not something to continue.
 */
export function continueLine(engine: MaidEngine, selected: readonly string[]) {
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

/**
 * The key 3: it starts an area. Pressed again before the first click, it steps through the drawing tools of the Area
 * dropdown (33 the first, 333 the second) and then back to the area. Once the first click is made, 3 starts a new
 * area, as it always did.
 */
export function stepAreaTool(
  engine: Pick<MaidEngine, 'mode' | 'moduleMode' | 'setMode'> & { draw: { active: boolean } },
  tools: readonly Pick<DrawToolItem, 'id' | 'start'>[],
) {
  const at = tools.findIndex((tool) => tool.id === engine.moduleMode?.id)
  if (at >= 0) {
    const next = tools[at + 1]
    if (next) next.start(engine as MaidEngine)
    else engine.setMode('draw-area')
    return
  }
  const first = tools[0]
  if (first && engine.mode === 'draw-area' && !engine.draw.active) first.start(engine as MaidEngine)
  else engine.setMode('draw-area')
}

/** The key sequence that reaches a tool of the Area dropdown with stepAreaTool: 33 for the first, 333 for the second */
export function areaToolKeys(index: number) {
  return '3'.repeat(index + 2)
}
