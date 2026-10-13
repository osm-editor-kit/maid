/**
 * Undo and redo check for Maid. Moves a junction, changes the name of a highway through it,
 * undoes twice, undoes once more with nothing left, and redoes once. After every step it checks
 * the history state, the data, and what the map draws against what the step should have left.
 *
 *   bun tools/bench/undo.ts [scene]
 *
 * Prints one line per check: `ok <check>`, or `FAIL <check>` with expected and actual. Exits 1 on
 * any failure, including a request outside localhost.
 */
import { EDIT_SOURCES, SOURCES } from '../../packages/renderer/src/layers'
import { runCheck } from './check-page'

const sceneName = process.argv[2] ?? 'small'
/** How far a drawn position may be from the expected one. The tile grid rounds to well under this. */
const TOLERANCE_M = 1
/** The move in degrees: about 7 m east at Berlin's latitude, far more than the tolerance */
const MOVE_LON = 0.0001
const NAME = 'Undo test'

type UndoExpect = {
  canUndo: boolean
  canRedo: boolean
  undoLabel: string | null
  redoLabel: string | null
}
type Picked = { nodeId: string; wayId: string; lon: number; lat: number; wayName: string | null }
type Step = {
  label: string
  run?: () => Promise<void>
  undo: UndoExpect
  name: string | null
  at: number[]
}
type State = {
  undo: { canUndo: boolean; canRedo: boolean; undoLabel?: string; redoLabel?: string }
  nodeLoc: number[] | null
  wayName: string | null
  vertices: number[][]
  wayFeatures: { name: string | null; geometry: { type: string; coordinates: any } }[]
}

/** Distance in metres from a point to a polyline, on a flat map at the point's latitude */
function metresToLine(p: number[], line: number[][], lat: number): number {
  const kx = 111320 * Math.cos((lat * Math.PI) / 180)
  const ky = 110540
  let best = Infinity
  for (let i = 0; i + 1 < line.length; i++) {
    const [ax0, ay0] = line[i] as [number, number]
    const [bx0, by0] = line[i + 1] as [number, number]
    const ax = (ax0 - p[0]!) * kx
    const ay = (ay0 - p[1]!) * ky
    const dx = (bx0 - p[0]!) * kx - ax
    const dy = (by0 - p[1]!) * ky - ay
    const len2 = dx * dx + dy * dy
    const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2))
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy))
  }
  return best
}

/** The lines of a GeoJSON geometry: a line, or the rings of an area */
function linesOf(geometry: { type: string; coordinates: any }): number[][][] {
  switch (geometry.type) {
    case 'LineString':
      return [geometry.coordinates]
    case 'Polygon':
    case 'MultiLineString':
      return geometry.coordinates
    case 'MultiPolygon':
      return geometry.coordinates.flat()
    default:
      return []
  }
}

const near = (a: number[], b: number[]) =>
  Math.abs(a[0]! - b[0]!) < 1e-9 && Math.abs(a[1]! - b[1]!) < 1e-9

process.exit(
  await runCheck(sceneName, async ({ page, report, settle }) => {
    // a junction on a highway: its vertex is drawn, so the map can show where it is
    const picked = (await page.evaluate(() => {
      const { map, engine } = window.__maid
      for (const f of map.queryRenderedFeatures()) {
        const wayId = String(f.id ?? '')
        if (!wayId.startsWith('w')) continue
        const way = engine.data.way(wayId)
        if (!way || !way.tags.highway) continue
        for (const nodeId of way.nodes.slice(1, -1)) {
          const node = engine.data.node(nodeId)
          if (!node?.loc || (engine.data.nodeUses.get(nodeId) ?? 0) < 2) continue
          return {
            nodeId,
            wayId,
            lon: node.loc[0],
            lat: node.loc[1],
            wayName: way.tags.name ?? null,
          }
        }
      }
      return null
    })) as Picked | null
    if (!picked) {
      report('find a junction on a highway', 'one in view', null)
      return
    }

    const orig = [picked.lon, picked.lat]
    const moved: [number, number] = [picked.lon + MOVE_LON, picked.lat]
    const none = { canUndo: false, canRedo: false, undoLabel: null, redoLabel: null }
    const steps: Step[] = [
      { label: 'start', undo: none, name: picked.wayName, at: orig },
      {
        label: 'move node',
        run: () =>
          page.evaluate(
            async ({ id, lon, lat }) => {
              await window.__maid.engine.moveNode(id, lon, lat)
            },
            { id: picked.nodeId, lon: moved[0], lat: moved[1] },
          ),
        undo: { canUndo: true, canRedo: false, undoLabel: 'Moved a node', redoLabel: null },
        name: picked.wayName,
        at: moved,
      },
      {
        label: 'change tag',
        run: () =>
          page.evaluate(({ id, name }) => window.__maid.engine.setTag(id, 'name', name), {
            id: picked.wayId,
            name: NAME,
          }),
        undo: { canUndo: true, canRedo: false, undoLabel: 'Changed tags', redoLabel: null },
        name: NAME,
        at: moved,
      },
      {
        label: 'undo',
        run: () => page.evaluate(() => window.__maid.engine.undo()),
        undo: {
          canUndo: true,
          canRedo: true,
          undoLabel: 'Moved a node',
          redoLabel: 'Changed tags',
        },
        name: picked.wayName,
        at: moved,
      },
      {
        label: 'undo',
        run: () => page.evaluate(() => window.__maid.engine.undo()),
        undo: { canUndo: false, canRedo: true, undoLabel: null, redoLabel: 'Moved a node' },
        name: picked.wayName,
        at: orig,
      },
      {
        label: 'undo with nothing to undo',
        run: () => page.evaluate(() => window.__maid.engine.undo()),
        undo: { canUndo: false, canRedo: true, undoLabel: null, redoLabel: 'Moved a node' },
        name: picked.wayName,
        at: orig,
      },
      {
        label: 'redo',
        run: () => page.evaluate(() => window.__maid.engine.redo()),
        undo: {
          canUndo: true,
          canRedo: true,
          undoLabel: 'Moved a node',
          redoLabel: 'Changed tags',
        },
        name: picked.wayName,
        at: moved,
      },
    ]

    // (base source, live twin source) pairs: the live twin is read first
    const VERTEX_PAIRS: [string, string][] = [[SOURCES.vertices, EDIT_SOURCES.vertices]]
    const WAY_PAIRS: [string, string][] = [
      [SOURCES.lines, EDIT_SOURCES.lines],
      [SOURCES.areas, EDIT_SOURCES.areas],
    ]

    for (const step of steps) {
      if (step.run) await step.run()
      await settle()
      const s = (await page.evaluate(
        ({ nodeId, wayId, pairs }) => {
          const { map, engine } = window.__maid
          // an edited feature is drawn from its live twin; its base copy is hidden by feature state
          const find = (id: string, sets: [string, string][]) => {
            const inSource = (source: string) =>
              map.getSource(source)
                ? map.querySourceFeatures(source).filter((f: any) => String(f.id) === id)
                : []
            for (const [, live] of sets) {
              const found = inSource(live)
              if (found.length) return found
            }
            for (const [base] of sets) {
              const found = inSource(base)
              if (found.length) return found
            }
            return []
          }
          const node = engine.data.node(nodeId)
          const way = engine.data.way(wayId)
          return {
            undo: engine.undoState(),
            nodeLoc: node?.loc ?? null,
            wayName: way?.tags.name ?? null,
            vertices: find(nodeId, pairs.vertices).map((f: any) => f.geometry.coordinates),
            wayFeatures: find(wayId, pairs.ways).map((f: any) => ({
              name: f.properties?.name ?? null,
              geometry: f.geometry,
            })),
          }
        },
        {
          nodeId: picked.nodeId,
          wayId: picked.wayId,
          pairs: { vertices: VERTEX_PAIRS, ways: WAY_PAIRS },
        },
      )) as State

      const l = step.label
      const got = {
        canUndo: s.undo.canUndo,
        canRedo: s.undo.canRedo,
        undoLabel: s.undo.undoLabel ?? null,
        redoLabel: s.undo.redoLabel ?? null,
      }
      const want = step.undo
      report(
        `${l}: undo state`,
        true,
        got.canUndo === want.canUndo &&
          got.canRedo === want.canRedo &&
          got.undoLabel === want.undoLabel &&
          got.redoLabel === want.redoLabel,
      )
      report(
        `${l}: node position in the data`,
        true,
        s.nodeLoc !== null && near(s.nodeLoc, step.at),
      )
      report(`${l}: way name in the data`, step.name, s.wayName)
      const lat = step.at[1]!
      const vertexOff = Math.min(
        Infinity,
        ...s.vertices.map((c) => metresToLine(step.at, [c, c], lat)),
      )
      report(`${l}: vertex on the map`, true, vertexOff <= TOLERANCE_M)
      const wayOff = Math.min(
        Infinity,
        ...s.wayFeatures.flatMap((f) =>
          linesOf(f.geometry).map((line) => metresToLine(step.at, line, lat)),
        ),
      )
      report(`${l}: way geometry on the map`, true, wayOff <= TOLERANCE_M)
      report(
        `${l}: way name on the map`,
        true,
        s.wayFeatures.length > 0 && s.wayFeatures.every((f) => f.name === step.name),
      )
    }
  }),
)
