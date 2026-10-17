import { OsmNode, OsmWay } from '@osm-editor-kit/maid-model'
import type { Action, Graph } from '@osm-editor-kit/maid-model'
import { frameAt, toLoc, toMetres, type Loc } from '../shared/metres.ts'
import { cross, distance, item, sub, type Pt } from '../shared/vector.ts'

export type { Loc }

/** The four corners of an area, in order */
export type Corners = [Loc, Loc, Loc, Loc]

/** Why a division is not done. The data is not changed when one of these is returned. */
export type DivideRefusal =
  | 'not_four_corners'
  | 'concave'
  | 'in_relation'
  | 'shared_edge'
  | 'too_many_parts'
  | 'nothing_to_do'

/** The most parts one division may make */
export const MAX_PARTS = 200

/** Tags of the source that the parts do not get */
/** Keys of the whole, with their namespaces (`name:de`, `addr:street`, `capacity:disabled`) */
const NOT_COPIED = new Set(['name', 'ref', 'addr', 'capacity', 'source', 'note', 'fixme'])

/** Smallest cross product (square metres) that still counts as a real turn, not a straight line */
const MIN_TURN = 1e-6

/**
 * Checks that a division has a usable size.
 * @param   columns - Sections across the first edge
 * @param   rows    - Sections down the first edge
 * @throws  RangeError if either is not a whole number of at least 1 (the UI keeps them in range)
 */
function checkSize(columns: number, rows: number): void {
  if (!Number.isInteger(columns) || !Number.isInteger(rows) || columns < 1 || rows < 1) {
    throw new RangeError(
      `Columns and rows must be whole numbers of at least 1, got ${columns} x ${rows}`,
    )
  }
}

/**
 * The grid point (i, j), for `0 <= i <= columns` and `0 <= j <= rows`. Corners A, B, C, D are the
 * input positions exactly. Columns run along A to B, rows along A to D. Bilinear:
 * P(u, v) = (1-u)(1-v)A + u(1-v)B + uv C + (1-u)v D, computed in the local frame.
 * @param   corners - The four corners A, B, C, D in order
 * @param   columns - Sections across
 * @param   rows    - Sections down
 * @param   i       - Column line, 0 at A's side
 * @param   j       - Row line, 0 at A's side
 * @return  The position
 */
function gridPoint(corners: Corners, columns: number, rows: number, i: number, j: number): Loc {
  if (i === 0 && j === 0) return corners[0]
  if (i === columns && j === 0) return corners[1]
  if (i === columns && j === rows) return corners[2]
  if (i === 0 && j === rows) return corners[3]

  const frame = frameAt(corners)
  const [A, B, C, D] = corners.map((corner) => toMetres(frame, corner)) as [Pt, Pt, Pt, Pt]
  const u = i / columns
  const v = j / rows
  const [w0, w1, w2, w3] = [(1 - u) * (1 - v), u * (1 - v), u * v, (1 - u) * v]
  return toLoc(frame, {
    x: w0 * A.x + w1 * B.x + w2 * C.x + w3 * D.x,
    y: w0 * A.y + w1 * B.y + w2 * C.y + w3 * D.y,
  })
}

/**
 * The cells of a division of a four-cornered area, as pure geometry for the preview. Each cell is
 * four positions in the order of the corners, cells row by row from corner A. Nothing is checked
 * here; see `dividePlan` for the refusals.
 * @param   corners - The four corners A, B, C, D in order
 * @param   columns - Sections across, along A to B
 * @param   rows    - Sections down, along A to D
 * @return  `columns * rows` cells, each an array of four positions
 */
export function divideCells(corners: Corners, columns: number, rows: number): Loc[][] {
  checkSize(columns, rows)
  const cells: Loc[][] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      cells.push([
        gridPoint(corners, columns, rows, i, j),
        gridPoint(corners, columns, rows, i + 1, j),
        gridPoint(corners, columns, rows, i + 1, j + 1),
        gridPoint(corners, columns, rows, i, j + 1),
      ])
    }
  }
  return cells
}

/**
 * The four corners of a closed way with exactly four distinct nodes, that all have a position.
 * @param   graph - The graph to read the nodes from
 * @param   way   - The source way
 * @return  The corner node ids and positions in order, or `undefined`
 */
function cornersOf(
  graph: Graph,
  way: OsmWay,
): { ids: [string, string, string, string]; locs: Corners } | undefined {
  const [a, b, c, d, e] = way.nodes
  if (!a || !b || !c || !d || !e || e !== a) return undefined
  if (new Set([a, b, c, d]).size !== 4) return undefined

  const locOf = (id: string): Loc | undefined => {
    const node = graph.hasEntity(id)
    if (!(node instanceof OsmNode) || !node.loc) return undefined
    return [node.loc[0], node.loc[1]]
  }
  const [la, lb, lc, ld] = [locOf(a), locOf(b), locOf(c), locOf(d)]
  if (!la || !lb || !lc || !ld) return undefined
  // columns divide the long sides, whichever corner the way starts at: A-B is made one of the longer pair
  const frame = frameAt([la, lb, lc, ld])
  const [pa, pb, pc, pd] = [la, lb, lc, ld].map((loc) => toMetres(frame, loc)) as [Pt, Pt, Pt, Pt]
  const along = distance(pa, pb) + distance(pc, pd)
  const across = distance(pb, pc) + distance(pd, pa)
  if (across > along) return { ids: [b, c, d, a], locs: [lb, lc, ld, la] }
  return { ids: [a, b, c, d], locs: [la, lb, lc, ld] }
}

/**
 * The corner positions of a way with four corners, in order, for the operation and the preview. Undefined when the way
 * is not a closed way of four distinct corners with positions.
 * @param   graph  - The graph
 * @param   wayId  - The way
 * @return  The corners, or `undefined`
 */
export function cornersOfWay(graph: Graph, wayId: string): Corners | undefined {
  const way = graph.hasEntity(wayId)
  if (!(way instanceof OsmWay)) return undefined
  return cornersOf(graph, way)?.locs
}

/**
 * Whether four corners in order make a convex quadrilateral. Every turn must go the same way. For
 * four corners this also rules out a self-intersecting (bow-tie) shape, since such a shape turns both
 * ways. Straight corners (no turn) count as not convex.
 * @param   pts - The four corners in the local frame, in metres
 * @return  `true` if convex and simple
 */
function isConvex(pts: [Pt, Pt, Pt, Pt]): boolean {
  const [p0, p1, p2, p3] = pts
  const turns: [Pt, Pt, Pt][] = [
    [p0, p1, p2],
    [p1, p2, p3],
    [p2, p3, p0],
    [p3, p0, p1],
  ]
  let sign = 0
  for (const [a, b, c] of turns) {
    const turn = cross(sub(b, a), sub(c, b))
    if (Math.abs(turn) < MIN_TURN) return false
    const s = Math.sign(turn)
    if (sign !== 0 && s !== sign) return false
    sign = s
  }
  return true
}

/**
 * Whether another way has the two nodes next to each other, that is, shares the edge a-b.
 * @param   graph  - The graph
 * @param   source - The way being divided, which is not counted
 * @param   a      - One end of the edge
 * @param   b      - The other end
 * @return  `true` if a way other than the source uses this edge
 */
function sharesEdge(graph: Graph, source: OsmWay, a: string, b: string): boolean {
  return graph.parentWays(graph.entity(a)).some((way) => {
    if (way.id === source.id) return false
    const nodes = way.nodes
    for (let i = 0; i < nodes.length - 1; i++) {
      if ((nodes[i] === a && nodes[i + 1] === b) || (nodes[i] === b && nodes[i + 1] === a))
        return true
    }
    return false
  })
}

/**
 * The tags the parts get: the source's, without the names, references, addresses and the other
 * tags that belong to the whole.
 * @param   tags - The source's tags
 * @return  A new tags object
 */
function partTags(tags: Record<string, string>): Record<string, string> {
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(tags)) {
    if (NOT_COPIED.has(key.split(':')[0] ?? key)) continue
    kept[key] = value
  }
  return kept
}

/**
 * Plans the division of a closed four-cornered way into `columns` by `rows` closed ways. The new
 * nodes and ways are made now, so their ids are fixed: applying the action again (redo) gives the
 * same ids. The first part keeps the source's id and history; the others are new ways. The four
 * corners are reused. Nothing is changed until the action is applied.
 *
 * Refused (with the reason, and no change): see `DivideRefusal`. Columns and rows must be whole
 * numbers of at least 1, otherwise this throws a RangeError.
 *
 * @param   graph   - The graph to divide in (the head graph of the editor)
 * @param   wayId   - The source way
 * @param   columns - Sections across, along the first edge
 * @param   rows    - Sections down
 * @return  The action and a function that gives the ids of the parts in a graph after the action,
 *          or the refusal
 */
export function dividePlan(
  graph: Graph,
  wayId: string,
  columns: number,
  rows: number,
): { action: Action; parts: (after: Graph) => string[] } | { refused: DivideRefusal } {
  checkSize(columns, rows)
  if (columns === 1 && rows === 1) return { refused: 'nothing_to_do' }
  if (columns * rows > MAX_PARTS) return { refused: 'too_many_parts' }

  const source = graph.hasEntity(wayId)
  if (!(source instanceof OsmWay)) return { refused: 'not_four_corners' }

  const corners = cornersOf(graph, source)
  if (!corners) return { refused: 'not_four_corners' }
  const frame = frameAt(corners.locs)
  const pts = corners.locs.map((c) => toMetres(frame, c)) as [Pt, Pt, Pt, Pt]
  if (!isConvex(pts)) return { refused: 'concave' }
  if (graph.parentRelations(source).length > 0) return { refused: 'in_relation' }

  // Edges are A-B (0), B-C (1), C-D (2), D-A (3). New nodes sit on A-B and C-D when there are
  // columns, and on B-C and D-A when there are rows.
  const [A, B, C, D] = corners.ids
  const edges: [string, string, boolean][] = [
    [A, B, columns > 1],
    [B, C, rows > 1],
    [C, D, columns > 1],
    [D, A, rows > 1],
  ]
  for (const [a, b, hasNew] of edges) {
    if (hasNew && sharesEdge(graph, source, a, b)) return { refused: 'shared_edge' }
  }

  // One node per grid point, shared by the cells around it. Row by row (j, then i), so ids are
  // deterministic. Index in this list: j * (columns + 1) + i.
  const cornerId = (i: number, j: number): string | undefined => {
    if (i === 0 && j === 0) return A
    if (i === columns && j === 0) return B
    if (i === columns && j === rows) return C
    if (i === 0 && j === rows) return D
    return undefined
  }
  const newNodes: OsmNode[] = []
  const nodeIds: string[] = []
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= columns; i++) {
      const existing = cornerId(i, j)
      if (existing) {
        nodeIds.push(existing)
      } else {
        const node = new OsmNode(graph.context, {
          loc: gridPoint(corners.locs, columns, rows, i, j),
        })
        newNodes.push(node)
        nodeIds.push(node.id)
      }
    }
  }
  const idAt = (i: number, j: number): string => item(nodeIds, j * (columns + 1) + i)

  const tags = partTags(source.tags)
  const parts: OsmWay[] = []
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < columns; i++) {
      const cellNodes = [idAt(i, j), idAt(i + 1, j), idAt(i + 1, j + 1), idAt(i, j + 1), idAt(i, j)]
      // The first part takes over the source: same id, same history.
      const part =
        parts.length === 0
          ? source.update({ nodes: cellNodes, tags: { ...tags } })
          : new OsmWay(graph.context, { nodes: cellNodes, tags: { ...tags } })
      parts.push(part)
    }
  }
  const partIds = parts.map((part) => part.id)

  const action: Action = (head) => {
    let g = head
    for (const node of newNodes) g = g.replace(node)
    for (const part of parts) g = g.replace(part)
    return g.commit()
  }

  const partsIn = (after: Graph): string[] =>
    partIds.filter((id) => after.hasEntity(id) !== undefined)

  return { action, parts: partsIn }
}
